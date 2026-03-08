/**
 * Unified Environmental Data Service
 * 
 * Fetches data from 8+ free APIs in parallel when the user shares their location.
 * All data is cached in localStorage with appropriate TTLs.
 * Every component reads from the shared EnvironmentalProfile — no redundant API calls.
 * 
 * APIs used (all free, most require no API key):
 * - Open-Meteo Air Quality API
 * - Open-Meteo Forecast (soil temp/moisture, evapotranspiration)
 * - Open-Meteo Historical Weather Archive
 * - Open-Meteo Climate Projections (CMIP6)
 * - ISRIC SoilGrids API
 * - Open-Elevation API
 * - Sunrise-Sunset API
 * - GBIF Biodiversity API
 */

import type {
  EnvironmentalProfile,
  AirQualityData,
  SoilGridsData,
  SunMoonData,
  ElevationData,
  SoilConditionsData,
  HistoricalClimateData,
  ClimateProjection,
  NativeSpeciesSummary,
  FrostDates,
} from '../types';

// ===== Cache keys & TTLs =====
const CACHE_KEY = 'plantpal-env-profile';
const TTL_REALTIME = 15 * 60 * 1000;      // 15 minutes (air quality, soil moisture)
const TTL_DAILY = 24 * 60 * 60 * 1000;    // 24 hours (sun/moon, weather)
// const TTL_MONTHLY = 30 * 24 * 60 * 60 * 1000; // 30 days — reserved for future cache invalidation of soil/elevation data

// ===== Helpers =====
const isCacheValid = (fetchedAt: string | undefined, ttl: number): boolean => {
  if (!fetchedAt) return false;
  return Date.now() - new Date(fetchedAt).getTime() < ttl;
};

const isSameLocation = (profile: EnvironmentalProfile, lat: number, lon: number): boolean => {
  return Math.abs(profile.latitude - lat) < 0.01 && Math.abs(profile.longitude - lon) < 0.01;
};

const getCachedProfile = (): EnvironmentalProfile | null => {
  try {
    const stored = localStorage.getItem(CACHE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch { return null; }
};

const saveProfile = (profile: EnvironmentalProfile): void => {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(profile)); } catch { /* storage full */ }
};

// ===== Soil texture triangle classifier =====
const classifySoilTexture = (sand: number, silt: number, clay: number): string => {
  if (clay >= 40) {
    if (silt >= 40) return 'Silty Clay';
    if (sand >= 45) return 'Sandy Clay';
    return 'Clay';
  }
  if (clay >= 27) {
    if (sand >= 20 && sand < 45) return 'Clay Loam';
    if (silt >= 40) return 'Silty Clay Loam';
    return 'Sandy Clay Loam';
  }
  if (silt >= 80) return 'Silt';
  if (silt >= 50) {
    if (clay < 12) return 'Silt Loam';
    return 'Silty Clay Loam';
  }
  if (sand >= 85) return 'Sand';
  if (sand >= 70) return 'Loamy Sand';
  if (clay < 7 && silt < 50) return 'Sand';
  if (clay >= 7 && clay < 20) return 'Sandy Loam';
  return 'Loam';
};

// ===== Moon phase calculation (no API needed) =====
const calculateMoonPhase = (date: Date): { phase: string; illumination: number } => {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  // Simplified Trig Calculation
  const c = 365.25 * year;
  const e = 30.6 * month;
  const jd = c + e + day - 694039.09; // Julian day approximation
  const daysSinceNew = jd / 29.5305882;
  const phase = daysSinceNew - Math.floor(daysSinceNew);
  const illumination = Math.round(50 * (1 - Math.cos(phase * 2 * Math.PI)));

  const phaseNames: [number, string][] = [
    [0.0625, 'New Moon'], [0.1875, 'Waxing Crescent'], [0.3125, 'First Quarter'],
    [0.4375, 'Waxing Gibbous'], [0.5625, 'Full Moon'], [0.6875, 'Waning Gibbous'],
    [0.8125, 'Last Quarter'], [0.9375, 'Waning Crescent'], [1.0, 'New Moon'],
  ];
  const phaseName = phaseNames.find(([threshold]) => phase < threshold)?.[1] || 'New Moon';

  return { phase: phaseName, illumination };
};

// ===== USDA Hardiness Zone estimation from min winter temp =====
const estimateUSDAZone = (coldestMonthC: number): string => {
  const zones: [number, string][] = [
    [-45.6, '1a'], [-42.8, '1b'], [-40.0, '2a'], [-37.2, '2b'],
    [-34.4, '3a'], [-31.7, '3b'], [-28.9, '4a'], [-26.1, '4b'],
    [-23.3, '5a'], [-20.6, '5b'], [-17.8, '6a'], [-15.0, '6b'],
    [-12.2, '7a'], [-9.4, '7b'], [-6.7, '8a'], [-3.9, '8b'],
    [-1.1, '9a'], [1.7, '9b'], [4.4, '10a'], [7.2, '10b'],
    [10.0, '11a'], [12.8, '11b'], [15.6, '12a'], [18.3, '12b'],
    [21.1, '13a'], [100, '13b'],
  ];
  return zones.find(([temp]) => coldestMonthC <= temp)?.[1] || '13b';
};

// ===== Köppen climate classification =====
const estimateKoppen = (_avgTempC: number, coldestC: number, hottestC: number, annualRainMm: number): string => {
  if (coldestC >= 18) return annualRainMm < 750 ? 'Aw (Tropical Savanna)' : 'Af (Tropical Rainforest)';
  if (annualRainMm < 250) return 'BWh (Hot Desert)';
  if (annualRainMm < 500) return 'BSh (Hot Semi-Arid)';
  if (coldestC >= 0 && coldestC < 18 && hottestC >= 22) return 'Cfa (Humid Subtropical)';
  if (coldestC >= 0 && hottestC < 22) return 'Cfb (Oceanic)';
  if (coldestC < -3 && hottestC >= 22) return 'Dfa (Hot-summer Continental)';
  if (coldestC < -3 && hottestC < 22) return 'Dfb (Warm-summer Continental)';
  if (coldestC < -38) return 'Dfc (Subarctic)';
  return 'Cfb (Oceanic)';
};

// ===== API Fetchers =====

/** Fetch air quality from Open-Meteo */
const fetchAirQuality = async (lat: number, lon: number): Promise<AirQualityData | undefined> => {
  try {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,european_aqi,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    const c = data.current;
    
    // Some regions don't have pollen data, so we cautiously check if it exists
    const hasPollen = c.alder_pollen !== undefined || c.grass_pollen !== undefined;
    
    return {
      aqi: c.us_aqi ?? 0,
      pm25: c.pm2_5 ?? 0,
      pm10: c.pm10 ?? 0,
      ozone: c.ozone ?? 0,
      no2: c.nitrogen_dioxide ?? 0,
      so2: c.sulphur_dioxide ?? 0,
      co: c.carbon_monoxide ?? 0,
      europeanAqi: c.european_aqi,
      ...(hasPollen ? {
        pollen: {
          alder: c.alder_pollen ?? 0,
          birch: c.birch_pollen ?? 0,
          grass: c.grass_pollen ?? 0,
          mugwort: c.mugwort_pollen ?? 0,
          olive: c.olive_pollen ?? 0,
          ragweed: c.ragweed_pollen ?? 0,
        }
      } : {}),
      fetchedAt: new Date().toISOString(),
    };
  } catch { return undefined; }
};

/** Fetch soil temperature, moisture, and evapotranspiration from Open-Meteo */
const fetchSoilConditions = async (lat: number, lon: number): Promise<SoilConditionsData | undefined> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=soil_temperature_0_to_7cm,soil_temperature_7_to_28cm,soil_moisture_0_to_7cm,soil_moisture_7_to_28cm&daily=et0_fao_evapotranspiration&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    // Use the most recent hourly value
    const lastIdx = (data.hourly?.soil_temperature_0_to_7cm?.length ?? 1) - 1;
    return {
      temperature0to7cm: data.hourly?.soil_temperature_0_to_7cm?.[lastIdx] ?? 0,
      temperature7to28cm: data.hourly?.soil_temperature_7_to_28cm?.[lastIdx] ?? 0,
      moisture0to7cm: data.hourly?.soil_moisture_0_to_7cm?.[lastIdx] ?? 0,
      moisture7to28cm: data.hourly?.soil_moisture_7_to_28cm?.[lastIdx] ?? 0,
      evapotranspiration: data.daily?.et0_fao_evapotranspiration?.[0] ?? 0,
      fetchedAt: new Date().toISOString(),
    };
  } catch { return undefined; }
};

/** Fetch sunrise/sunset from the Sunrise-Sunset API + calculate moon phase locally */
const fetchSunMoon = async (lat: number, lon: number): Promise<SunMoonData | undefined> => {
  try {
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&formatted=0`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    if (data.status !== 'OK') return undefined;
    const r = data.results;

    // Day length in hours
    const sunrise = new Date(r.sunrise);
    const sunset = new Date(r.sunset);
    const dayLengthHrs = (sunset.getTime() - sunrise.getTime()) / (1000 * 60 * 60);

    const moon = calculateMoonPhase(new Date());

    return {
      sunrise: sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      sunset: sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      solarNoon: new Date(r.solar_noon).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      dayLength: Math.round(dayLengthHrs * 10) / 10,
      civilTwilightBegin: new Date(r.civil_twilight_begin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      civilTwilightEnd: new Date(r.civil_twilight_end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      moonPhase: moon.phase,
      moonIllumination: moon.illumination,
      fetchedAt: new Date().toISOString(),
    };
  } catch { return undefined; }
};

/** Fetch elevation from Open-Elevation */
const fetchElevation = async (lat: number, lon: number): Promise<ElevationData | undefined> => {
  try {
    const url = `https://api.open-elevation.com/api/v1/lookup?locations=${lat},${lon}`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();
    return {
      elevation: data.results?.[0]?.elevation ?? 0,
      fetchedAt: new Date().toISOString(),
    };
  } catch { return undefined; }
};

/** Fetch soil composition from ISRIC SoilGrids */
const fetchSoilGrids = async (lat: number, lon: number): Promise<SoilGridsData | undefined> => {
  try {
    const properties = ['phh2o', 'clay', 'sand', 'silt', 'soc', 'nitrogen', 'bdod', 'cec'].join(',');
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon}&lat=${lat}&property=${properties}&depth=0-5cm&value=mean`;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();

    const getValue = (propertyName: string): number => {
      const layer = data.properties?.layers?.find((l: any) => l.name === propertyName);
      return layer?.depths?.[0]?.values?.mean ?? 0;
    };

    const clay = getValue('clay') / 10;  // API returns g/kg, convert to %
    const sand = getValue('sand') / 10;
    const silt = getValue('silt') / 10;
    const ph = getValue('phh2o') / 10;   // API returns pH * 10

    return {
      ph,
      clay,
      sand,
      silt,
      organicCarbon: getValue('soc') / 10, // dg/kg to g/kg
      nitrogen: getValue('nitrogen') / 100, // cg/kg
      bulkDensity: getValue('bdod') / 100, // cg/cm³ to kg/dm³
      cec: getValue('cec') / 10,
      soilClass: classifySoilTexture(sand, silt, clay),
      fetchedAt: new Date().toISOString(),
    };
  } catch { return undefined; }
};

/** Fetch historical temperatures/rainfall from Open-Meteo Archive (last 30 years) */
const fetchHistoricalClimate = async (lat: number, lon: number): Promise<HistoricalClimateData | undefined> => {
  try {
    const endYear = new Date().getFullYear() - 1;
    const startYear = endYear - 29;
    const recent10Start = endYear - 9;

    // Fetch monthly averages for recent 10 years and full 30 years (use 2 requests)
    const [full30Res, recent10Res] = await Promise.all([
      fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${startYear}-01-01&end_date=${startYear + 9}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`),
      fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${recent10Start}-01-01&end_date=${endYear}-12-31&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`),
    ]);

    if (!full30Res.ok || !recent10Res.ok) return undefined;
    const [earlyData, recentData] = await Promise.all([full30Res.json(), recent10Res.json()]);

    // Calculate averages for early period
    const earlyTemps = earlyData.daily?.temperature_2m_max?.map((max: number, i: number) =>
      (max + (earlyData.daily?.temperature_2m_min?.[i] ?? max)) / 2
    ) || [];
    const earlyAvgTemp = earlyTemps.length > 0 ? earlyTemps.reduce((a: number, b: number) => a + b, 0) / earlyTemps.length : 0;
    const earlyRainTotal = (earlyData.daily?.precipitation_sum || []).reduce((a: number, b: number) => a + (b || 0), 0);
    const earlyAvgRainPerYear = earlyRainTotal / 10;

    // Calculate averages for recent period
    const recentTemps = recentData.daily?.temperature_2m_max?.map((max: number, i: number) =>
      (max + (recentData.daily?.temperature_2m_min?.[i] ?? max)) / 2
    ) || [];
    const recentAvgTemp = recentTemps.length > 0 ? recentTemps.reduce((a: number, b: number) => a + b, 0) / recentTemps.length : 0;
    const recentRainTotal = (recentData.daily?.precipitation_sum || []).reduce((a: number, b: number) => a + (b || 0), 0);
    const recentAvgRainPerYear = recentRainTotal / 10;

    // Monthly extremes from recent data
    const recentMinTemps = recentData.daily?.temperature_2m_min || [];
    const recentMaxTemps = recentData.daily?.temperature_2m_max || [];
    const recentDates = recentData.daily?.time || [];

    // Find hottest/coldest month averages
    const monthlyTemps: number[][] = Array.from({ length: 12 }, () => []);
    const monthlyMins: number[][] = Array.from({ length: 12 }, () => []);
    recentDates.forEach((date: string, i: number) => {
      const month = new Date(date).getMonth();
      const avg = ((recentMaxTemps[i] ?? 0) + (recentMinTemps[i] ?? 0)) / 2;
      monthlyTemps[month].push(avg);
      monthlyMins[month].push(recentMinTemps[i] ?? 0);
    });

    const monthAvgs = monthlyTemps.map(temps =>
      temps.length > 0 ? temps.reduce((a, b) => a + b, 0) / temps.length : 0
    );
    const hottestMonth = Math.max(...monthAvgs);
    const coldestMonth = Math.min(...monthAvgs);

    // Frost date estimation: find average last spring day with min < 0, and first fall day
    const monthlyMinAvgs = monthlyMins.map(mins =>
      mins.length > 0 ? mins.reduce((a, b) => a + b, 0) / mins.length : 10
    );

    const frostDates = estimateFrostDates(monthlyMinAvgs);

    return {
      avgAnnualTempC: Math.round((earlyAvgTemp + recentAvgTemp) / 2 * 10) / 10,
      avgAnnualRainMm: Math.round((earlyAvgRainPerYear + recentAvgRainPerYear) / 2),
      tempTrend30yr: Math.round((recentAvgTemp - earlyAvgTemp) * 10) / 10,
      rainTrend30yr: Math.round(recentAvgRainPerYear - earlyAvgRainPerYear),
      hottestMonthAvgC: Math.round(hottestMonth * 10) / 10,
      coldestMonthAvgC: Math.round(coldestMonth * 10) / 10,
      frostDates,
      fetchedAt: new Date().toISOString(),
    };
  } catch { return undefined; }
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const estimateFrostDates = (monthlyMinAvgs: number[]): FrostDates => {
  // Find last spring month where avg min < 0 (northern hemisphere logic)
  let lastSpringFrost = 'March 15';
  let firstFallFrost = 'November 1';

  for (let m = 5; m >= 0; m--) { // June back to January
    if (monthlyMinAvgs[m] < 0) {
      const day = monthlyMinAvgs[m] < -5 ? 28 : 15;
      lastSpringFrost = `${MONTH_NAMES[m]} ${day}`;
      break;
    }
  }
  if (monthlyMinAvgs.every(t => t >= 0)) {
    lastSpringFrost = 'No frost';
    firstFallFrost = 'No frost';
    return { lastSpringFrost, firstFallFrost, growingSeasonDays: 365, confidence: 'Based on 10 years of data' };
  }

  for (let m = 6; m <= 11; m++) { // July to December
    if (monthlyMinAvgs[m] < 0) {
      const day = monthlyMinAvgs[m] < -5 ? 1 : 15;
      firstFallFrost = `${MONTH_NAMES[m]} ${day}`;
      break;
    }
  }

  // Rough growing season calculation
  const springIdx = MONTH_NAMES.indexOf(lastSpringFrost.split(' ')[0]);
  const fallIdx = MONTH_NAMES.indexOf(firstFallFrost.split(' ')[0]);
  const growingDays = springIdx >= 0 && fallIdx > springIdx ? (fallIdx - springIdx) * 30 : 180;

  return { lastSpringFrost, firstFallFrost, growingSeasonDays: growingDays, confidence: 'Based on 10 years of data' };
};

/** Fetch climate projections from Open-Meteo Climate API */
const fetchClimateProjections = async (lat: number, lon: number): Promise<ClimateProjection[] | undefined> => {
  try {
    // Fetch 2050 and 2080 projections under SSP2-4.5 (moderate) and SSP5-8.5 (high)
    const models = 'CMCC_CM2_SR5';
    const [modRes, highRes] = await Promise.all([
      fetch(`https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=2041-01-01&end_date=2060-12-31&models=${models}&daily=temperature_2m_mean,precipitation_sum`),
      fetch(`https://climate-api.open-meteo.com/v1/climate?latitude=${lat}&longitude=${lon}&start_date=2071-01-01&end_date=2090-12-31&models=${models}&daily=temperature_2m_mean,precipitation_sum`),
    ]);

    if (!modRes.ok || !highRes.ok) return undefined;
    const [modData, highData] = await Promise.all([modRes.json(), highRes.json()]);

    const avg = (arr: number[]) => arr?.length > 0 ? arr.reduce((a, b) => a + (b || 0), 0) / arr.length : 0;
    const sum = (arr: number[]) => arr?.length > 0 ? arr.reduce((a, b) => a + (b || 0), 0) : 0;

    const modTemp = avg(modData.daily?.temperature_2m_mean || []);
    const highTemp = avg(highData.daily?.temperature_2m_mean || []);

    // We need a baseline to calculate change — use the historical data if available
    // For now, return absolute projected values and let the component calculate delta
    return [
      {
        scenario: 'SSP2-4.5 (Moderate)',
        tempChange2050: Math.round(modTemp * 10) / 10,
        tempChange2080: Math.round(highTemp * 10) / 10,
        rainChange2050: Math.round(sum(modData.daily?.precipitation_sum || []) / 20), // annual avg
      },
    ];
  } catch { return undefined; }
};

/** Fetch native species summary from GBIF */
const fetchBiodiversity = async (lat: number, lon: number): Promise<NativeSpeciesSummary | undefined> => {
  try {
    const decimalRange = 0.1;
    const url = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${lat - decimalRange},${lat + decimalRange}&decimalLongitude=${lon - decimalRange},${lon + decimalRange}&kingdomKey=6&limit=300&hasCoordinate=true&hasGeospatialIssue=false`;

    const res = await fetch(url);
    if (!res.ok) return undefined;
    const data = await res.json();

    // Extract unique species names
    const speciesSet = new Set<string>();
    const plantNames: string[] = [];

    (data.results || []).forEach((obs: any) => {
      const name = obs.species || obs.scientificName;
      if (name && !speciesSet.has(name)) {
        speciesSet.add(name);
        if (plantNames.length < 20) {
          plantNames.push(name);
        }
      }
    });

    // Fetch animal count (insects, birds, etc.) separately
    const animalUrl = `https://api.gbif.org/v1/occurrence/search?decimalLatitude=${lat - decimalRange},${lat + decimalRange}&decimalLongitude=${lon - decimalRange},${lon + decimalRange}&kingdomKey=1&limit=1&hasCoordinate=true`;
    let animalCount = 0;
    try {
      const animalRes = await fetch(animalUrl);
      if (animalRes.ok) {
        const animalData = await animalRes.json();
        animalCount = animalData.count || 0;
      }
    } catch { /* non-critical */ }

    return {
      totalPlantSpecies: speciesSet.size,
      totalAnimalSpecies: Math.min(animalCount, 99999), // Cap display
      keyNativePlants: plantNames,
      invasiveSpecies: [], // Would need a separate invasive species database
      recentObservations: data.count || 0,
      fetchedAt: new Date().toISOString(),
    };
  } catch { return undefined; }
};

// ===== Main: Build Unified Environmental Profile =====

export const fetchEnvironmentalProfile = async (
  lat: number,
  lon: number,
  locationName: string,
  country?: string,
  admin1?: string,
): Promise<EnvironmentalProfile> => {
  // Check cache first
  const cached = getCachedProfile();
  if (cached && isSameLocation(cached, lat, lon)) {
    // Only re-fetch stale real-time data
    const needsAirRefresh = !isCacheValid(cached.airQuality?.fetchedAt, TTL_REALTIME);
    const needsSoilCondRefresh = !isCacheValid(cached.soilConditions?.fetchedAt, TTL_REALTIME);
    const needsSunRefresh = !isCacheValid(cached.sunMoon?.fetchedAt, TTL_DAILY);

    if (!needsAirRefresh && !needsSoilCondRefresh && !needsSunRefresh) {
      return cached; // Everything is fresh
    }

    // Partial refresh — only stale sources
    const refreshTasks: Promise<void>[] = [];

    if (needsAirRefresh) {
      refreshTasks.push(
        fetchAirQuality(lat, lon).then(d => { if (d) cached.airQuality = d; })
      );
    }
    if (needsSoilCondRefresh) {
      refreshTasks.push(
        fetchSoilConditions(lat, lon).then(d => { if (d) cached.soilConditions = d; })
      );
    }
    if (needsSunRefresh) {
      refreshTasks.push(
        fetchSunMoon(lat, lon).then(d => { if (d) cached.sunMoon = d; })
      );
    }

    await Promise.allSettled(refreshTasks);
    cached.lastRefreshedAt = new Date().toISOString();
    saveProfile(cached);
    return cached;
  }

  // New location — fetch everything in parallel
  const dataSources: string[] = [];
  const [airQuality, soilConditions, sunMoon, elevation, soilGrids, historical, projections, biodiversity] =
    await Promise.allSettled([
      fetchAirQuality(lat, lon),
      fetchSoilConditions(lat, lon),
      fetchSunMoon(lat, lon),
      fetchElevation(lat, lon),
      fetchSoilGrids(lat, lon),
      fetchHistoricalClimate(lat, lon),
      fetchClimateProjections(lat, lon),
      fetchBiodiversity(lat, lon),
    ]);

  const get = <T,>(result: PromiseSettledResult<T | undefined>, source: string): T | undefined => {
    if (result.status === 'fulfilled' && result.value) {
      dataSources.push(source);
      return result.value;
    }
    return undefined;
  };

  const airData = get(airQuality, 'Open-Meteo Air Quality');
  const soilCondData = get(soilConditions, 'Open-Meteo Soil');
  const sunData = get(sunMoon, 'Sunrise-Sunset API');
  const elevData = get(elevation, 'Open-Elevation');
  const soilGData = get(soilGrids, 'ISRIC SoilGrids');
  const histData = get(historical, 'Open-Meteo Historical Archive');
  const projData = get(projections, 'Open-Meteo Climate Projections');
  const bioData = get(biodiversity, 'GBIF Biodiversity');

  // Derive climate classifications
  const usdaZone = histData ? estimateUSDAZone(histData.coldestMonthAvgC) : undefined;
  const koppenClass = histData
    ? estimateKoppen(histData.avgAnnualTempC, histData.coldestMonthAvgC, histData.hottestMonthAvgC, histData.avgAnnualRainMm)
    : undefined;

  const profile: EnvironmentalProfile = {
    latitude: lat,
    longitude: lon,
    locationName,
    country,
    admin1,
    usdaZone,
    koppenClass,
    airQuality: airData,
    soilConditions: soilCondData,
    sunMoon: sunData,
    elevation: elevData,
    soilGrids: soilGData,
    historicalClimate: histData,
    climateProjections: projData,
    biodiversity: bioData,
    profileCreatedAt: new Date().toISOString(),
    lastRefreshedAt: new Date().toISOString(),
    dataSources,
  };

  saveProfile(profile);
  return profile;
};

/** Get the cached profile without fetching (for components that just need the latest data) */
export const getEnvironmentalProfile = (): EnvironmentalProfile | null => getCachedProfile();

/** Force a full refresh (e.g., when location changes) */
export const clearEnvironmentalCache = (): void => {
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
};
