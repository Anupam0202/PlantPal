// PlantPal Type Definitions

// App Navigation
export type AppStep = 1 | 2 | 3;
export type Theme = 'light' | 'dark';

// Location Types
export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string;
  city?: string;
  country?: string;
}

export interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string; // State/Province
}

// Weather Types
export interface WeatherData {
  latitude: number;
  longitude: number;
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    weather_description?: string;
    time: string;
    wind_speed_10m?: number;
    cloud_cover?: number;
    uv_index?: number;
    precipitation?: number;
  };
  daily?: {
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
  };
}

export interface WeatherCodeInterpretation {
  description: string;
  icon?: string;
  gradient?: string;
}

// WMO Weather interpretation codes
export const WMO_WEATHER_CODES: Record<number, WeatherCodeInterpretation> = {
  0: { description: "Clear sky", icon: "sun", gradient: "from-yellow-400 to-orange-300" },
  1: { description: "Mainly clear", icon: "sun-cloud", gradient: "from-yellow-300 to-blue-200" },
  2: { description: "Partly cloudy", icon: "cloud-sun", gradient: "from-blue-300 to-gray-200" },
  3: { description: "Overcast", icon: "cloud", gradient: "from-gray-400 to-gray-300" },
  45: { description: "Fog", icon: "fog", gradient: "from-gray-300 to-gray-400" },
  48: { description: "Depositing rime fog", icon: "fog", gradient: "from-gray-400 to-blue-200" },
  51: { description: "Light drizzle", icon: "drizzle", gradient: "from-blue-300 to-gray-300" },
  53: { description: "Moderate drizzle", icon: "drizzle", gradient: "from-blue-400 to-gray-400" },
  55: { description: "Dense drizzle", icon: "drizzle", gradient: "from-blue-500 to-gray-500" },
  56: { description: "Light freezing drizzle", icon: "snow", gradient: "from-blue-200 to-gray-300" },
  57: { description: "Dense freezing drizzle", icon: "snow", gradient: "from-blue-300 to-gray-400" },
  61: { description: "Slight rain", icon: "rain", gradient: "from-blue-400 to-blue-300" },
  63: { description: "Moderate rain", icon: "rain", gradient: "from-blue-500 to-blue-400" },
  65: { description: "Heavy rain", icon: "rain-heavy", gradient: "from-blue-600 to-blue-500" },
  66: { description: "Light freezing rain", icon: "snow-rain", gradient: "from-blue-300 to-purple-200" },
  67: { description: "Heavy freezing rain", icon: "snow-rain", gradient: "from-blue-400 to-purple-300" },
  71: { description: "Slight snow fall", icon: "snow", gradient: "from-white to-blue-100" },
  73: { description: "Moderate snow fall", icon: "snow", gradient: "from-blue-100 to-blue-200" },
  75: { description: "Heavy snow fall", icon: "snow-heavy", gradient: "from-blue-200 to-blue-300" },
  77: { description: "Snow grains", icon: "snow", gradient: "from-gray-200 to-blue-100" },
  80: { description: "Slight rain showers", icon: "rain-sun", gradient: "from-blue-300 to-yellow-200" },
  81: { description: "Moderate rain showers", icon: "rain-sun", gradient: "from-blue-400 to-yellow-300" },
  82: { description: "Violent rain showers", icon: "storm", gradient: "from-blue-600 to-gray-500" },
  85: { description: "Slight snow showers", icon: "snow-sun", gradient: "from-blue-100 to-yellow-100" },
  86: { description: "Heavy snow showers", icon: "snow-heavy", gradient: "from-blue-300 to-yellow-200" },
  95: { description: "Thunderstorm", icon: "storm", gradient: "from-purple-500 to-blue-600" },
  96: { description: "Thunderstorm with slight hail", icon: "storm-hail", gradient: "from-purple-600 to-blue-700" },
  99: { description: "Thunderstorm with heavy hail", icon: "storm-hail", gradient: "from-purple-700 to-blue-800" },
};

// Form Enums
export enum SunlightExposure {
  FULL_SUN = "Full Sun (6+ hours direct sun)",
  PARTIAL_SHADE = "Partial Shade (3-6 hours direct sun)",
  FULL_SHADE = "Full Shade (less than 3 hours direct sun)",
}

export enum WateringFrequency {
  DAILY = "Daily",
  EVERY_FEW_DAYS = "Every 2-3 Days",
  WEEKLY = "Weekly",
  BI_WEEKLY_OR_LESS = "Bi-weekly or Less",
}

export enum PlantingAreaSize {
  SMALL = "Small (less than 10 sq ft / 1 sq m)",
  MEDIUM = "Medium (10-50 sq ft / 1-5 sq m)",
  LARGE = "Large (more than 50 sq ft / 5+ sq m)",
  CUSTOM = "Custom Size (Specify)",
}

export enum HeightClearance {
  NO_LIMIT = "No Limit",
  UNDER_3_FT = "Under 3 ft (approx 1 m)",
  BETWEEN_3_AND_6_FT = "3-6 ft (approx 1-2 m)",
  OVER_6_FT = "Over 6 ft (approx 2+ m)",
}

export type SoilType =
  | "Clay"
  | "Sandy"
  | "Loamy"
  | "Silty"
  | "Peaty"
  | "Chalky"
  | "Unknown/Mixed";

export type ClimateZone =
  | "Tropical"
  | "Subtropical"
  | "Mediterranean"
  | "Temperate"
  | "Continental"
  | "Arid/Desert"
  | "Semi-Arid"
  | "Oceanic"
  | "Subarctic";

export type MaintenanceLevel = 'low' | 'medium' | 'high';

// User Preferences
export interface UserPreferences {
  sunlightExposure: SunlightExposure;
  sunlightHours: number;
  wateringFrequency: WateringFrequency;
  droughtTolerant: boolean;
  plantingAreaSize: PlantingAreaSize | string;
  customPlantingAreaSize?: string;
  heightClearance: HeightClearance;
  plantType: string;
  planningGoals: string[];
  projectArea: string;
  // Enhanced fields
  soilType?: SoilType;
  climateZone?: ClimateZone;
  maintenanceLevel?: MaintenanceLevel;
}

// Plant Information
export interface PlantInfo {
  id: string;
  commonName: string;
  scientificName?: string;
  description?: string;
  suitability?: string;
  keyBenefits?: string;
  maintenanceTips?: string;
  growthRate?: string;
  // Image-related fields
  imageUrl?: string;
  imageLoading?: boolean;
  imageError?: boolean;
  // Enhanced fields
  category?: string;
  matureSize?: string;
  flowerColor?: string;
  bloomSeason?: string;
  hardiness?: string;
}

// Infrastructure Information
export interface InfrastructureInfo {
  id: string;
  title: string;
  explanation?: string;
}

// Recommendation Result
export interface RecommendationResult {
  plants: PlantInfo[];
  infrastructure: InfrastructureInfo[];
  conclusion: string | null;
  generatedAt: Date;
}

// View Mode
export type ViewMode = 'grid' | 'list';

// ===== Garden Journal Types =====
export type MilestoneType =
  | 'planted' | 'sprouted' | 'first-flower' | 'first-harvest'
  | 'pruned' | 'repotted' | 'pest-issue' | 'observation'
  | 'watering' | 'feeding' | 'measurement';

export interface GardenPlant {
  id: string;
  commonName: string;
  scientificName?: string;
  description?: string;
  dateAdded: string;
  status: 'active' | 'dormant' | 'removed';
  location?: string;
}

export interface JournalEntry {
  id: string;
  plantId: string;
  date: string;
  type: MilestoneType;
  title: string;
  notes?: string;
  photoUrl?: string;
  measurements?: {
    heightCm?: number;
    spreadCm?: number;
    leafCount?: number;
    flowerCount?: number;
    fruitCount?: number;
  };
  waterAmountLiters?: number;
  weatherSnapshot?: {
    temperature: number;
    humidity: number;
    description: string;
  };
}

// ===== Gamification Types =====
export type BadgeTier = 'bronze' | 'silver' | 'gold';

export interface BadgeDefinition {
  id: string;
  name: string;
  icon: string;
  description: string;
  tiers: { tier: BadgeTier; target: number }[];
}

export interface EarnedBadge {
  badgeId: string;
  tier: BadgeTier;
  earnedDate: string;
}

export interface GardenProfile {
  xp: number;
  level: number;
  streakDays: number;
  lastActiveDate?: string;
  joinedDate: string;
  earnedBadges: EarnedBadge[];
}

// ===== Calendar Types =====
export type CalendarEventType =
  | 'seed-start' | 'transplant' | 'direct-sow'
  | 'growing' | 'bloom' | 'harvest' | 'dormancy' | 'critical-care';

export interface CalendarEvent {
  plantName: string;
  type: CalendarEventType;
  monthStart: number;
  monthEnd: number;
  color: string;
  label: string;
}

// ===== Watering Types =====
export interface WateringTask {
  plantId: string;
  plantName: string;
  action: 'water' | 'skip';
  amountLiters?: number;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export interface WeatherAlert {
  type: 'heat-wave' | 'frost' | 'storm' | 'drought';
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  actions: string[];
}

// ===== Water Usage =====
export interface WaterUsage {
  thisWeek: number;
  thisMonth: number;
  allTime: number;
  avgPerPlant: number;
  entryCount: number;
}

// ===== Growth Chart =====
export interface GrowthDataPoint {
  date: string;
  heightCm?: number;
  spreadCm?: number;
  leafCount?: number;
}

// ===== Seasonal Challenge =====
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonalChallenge {
  id: string;
  season: Season;
  title: string;
  description: string;
  icon: string;
  target: number;
  metric: 'plants-added' | 'entries-logged' | 'waterings' | 'harvests' | 'streak';
  xpReward: number;
}

// ===== Upcoming Task =====
export interface UpcomingTask {
  plantName: string;
  task: string;
  dueDesc: string;
  icon: string;
  priority: 'high' | 'medium' | 'low';
}

// ===== Garden Stats =====
export interface GardenStats {
  totalPlants: number;
  activePlants: number;
  dormantPlants: number;
  removedPlants: number;
  totalEntries: number;
  totalWaterings: number;
  totalHarvests: number;
  healthScore: number;
  weekEntries: JournalEntry[];
  waterUsage: WaterUsage;
  upcomingTasks: UpcomingTask[];
}

// ===== Plant Health Scanner =====
export type HealthRating = 'thriving' | 'healthy' | 'fair' | 'poor' | 'critical';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type UrgencyLevel = 'immediate' | 'soon' | 'monitor';

export interface HealthIssue {
  name: string;
  confidence: ConfidenceLevel;
  cause: string;
  urgency: UrgencyLevel;
}

export interface HealthReport {
  rating: HealthRating;
  plantName?: string;
  issues: HealthIssue[];
  treatmentPlan: string[];
  preventionTips: string[];
  summary: string;
  analyzedAt: string;
}

// ===== Companion Planting =====
export type CompanionRelation = 'good' | 'bad' | 'neutral';

export interface CompanionEntry {
  a: string;
  b: string;
  rel: CompanionRelation;
  why: string;
}

// ===== Soil Intelligence =====
export interface SoilProfile {
  id: string;
  createdAt: string;
  method: 'photo-ai' | 'diy-jar' | 'diy-squeeze' | 'diy-ph' | 'diy-drainage' | 'professional';
  soilType?: string;
  ph?: number;
  organicMatter?: string;
  moisture?: string;
  texture?: { sand: number; silt: number; clay: number };
  nutrients?: { nitrogen: string; phosphorus: string; potassium: string };
  drainage?: string;
  notes?: string;
  aiAnalysis?: string;
  improvementPlan?: string;
}

// ===== Micro-Climate Mapper =====
export type ZoneDirection = 'north' | 'south' | 'east' | 'west' | 'northeast' | 'northwest' | 'southeast' | 'southwest';
export type WindExposure = 'sheltered' | 'moderate' | 'exposed';
export type DrainageSpeed = 'collects' | 'normal' | 'fast';

export interface MicroClimateZone {
  id: string;
  name: string;
  direction: ZoneDirection;
  wind: WindExposure;
  nearStructure: boolean;
  drainage: DrainageSpeed;
  hasShade: boolean;
  aiAnalysis?: string;
  recommendedPlants?: string;
}

// ===== Active Tool =====
export type ActiveTool = 'main' | 'garden' | 'plant-doctor' | 'companion' | 'soil' | 'microclimate' | 'carbon' | 'biodiversity' | 'climate' | 'pollinator' | 'community-map' | 'swap' | 'harvest' | 'multi-garden' | 'ar-visualizer' | 'budget' | 'voice-assistant' | 'timelapse';

// ===== Unified Environmental Profile =====
// This is fetched in parallel from 8+ free APIs when the user shares their location.
// Every component draws from this shared pool — no redundant API calls.

export interface AirQualityData {
  aqi: number;                // US AQI (0-500)
  pm25: number;               // µg/m³
  pm10: number;               // µg/m³
  ozone: number;              // µg/m³
  no2: number;                // µg/m³
  so2: number;                // µg/m³
  co: number;                 // µg/m³
  europeanAqi?: number;
  pollen?: {                  // grains/m³
    alder: number;
    birch: number;
    grass: number;
    mugwort: number;
    olive: number;
    ragweed: number;
  };
  fetchedAt: string;
}

export interface SoilGridsData {
  ph: number;                 // pH at 0-5cm (divided by 10 from API)
  clay: number;               // % at 0-5cm
  sand: number;               // % at 0-5cm
  silt: number;               // % at 0-5cm
  organicCarbon: number;      // g/kg at 0-5cm
  nitrogen: number;           // cg/kg at 0-5cm
  bulkDensity: number;        // kg/dm³ at 0-5cm
  cec: number;                // mmol(c)/kg cation exchange capacity
  soilClass: string;          // Derived texture class (e.g., "Sandy Clay Loam")
  fetchedAt: string;
}

export interface SunMoonData {
  sunrise: string;
  sunset: string;
  solarNoon: string;
  dayLength: number;          // hours
  civilTwilightBegin: string;
  civilTwilightEnd: string;
  moonPhase: string;          // e.g., "Waxing Gibbous"
  moonIllumination: number;   // 0-100%
  fetchedAt: string;
}

export interface ElevationData {
  elevation: number;          // meters above sea level
  fetchedAt: string;
}

export interface SoilConditionsData {
  temperature0to7cm: number;  // °C
  temperature7to28cm: number; // °C
  moisture0to7cm: number;     // m³/m³ (volumetric)
  moisture7to28cm: number;    // m³/m³
  evapotranspiration: number; // mm/day (ET₀)
  fetchedAt: string;
}

export interface FrostDates {
  lastSpringFrost: string;    // "March 28" format
  firstFallFrost: string;     // "October 15" format
  growingSeasonDays: number;
  confidence: string;         // "Based on X years of data"
}

export interface HistoricalClimateData {
  avgAnnualTempC: number;
  avgAnnualRainMm: number;
  tempTrend30yr: number;      // °C change over 30 years
  rainTrend30yr: number;      // mm change over 30 years
  hottestMonthAvgC: number;
  coldestMonthAvgC: number;
  frostDates: FrostDates;
  fetchedAt: string;
}

export interface ClimateProjection {
  scenario: string;           // "SSP2-4.5" or "SSP5-8.5"
  tempChange2050: number;     // °C
  tempChange2080: number;     // °C
  rainChange2050: number;     // % change
}

export interface NativeSpeciesSummary {
  totalPlantSpecies: number;
  totalAnimalSpecies: number;
  keyNativePlants: string[];  // Top 20 native plant names
  invasiveSpecies: string[];  // Species to warn about
  recentObservations: number; // Count in last 30 days
  fetchedAt: string;
}

export interface EnvironmentalProfile {
  // Core identifiers
  latitude: number;
  longitude: number;
  locationName: string;
  country?: string;
  admin1?: string;            // State/Province
  timezone?: string;

  // Climate classification
  usdaZone?: string;          // e.g., "7b"
  koppenClass?: string;       // e.g., "Cfa" (Humid Subtropical)

  // Real-time data (refreshed frequently)
  airQuality?: AirQualityData;
  soilConditions?: SoilConditionsData;
  sunMoon?: SunMoonData;

  // Semi-static data (refreshed monthly or less)
  elevation?: ElevationData;
  soilGrids?: SoilGridsData;
  historicalClimate?: HistoricalClimateData;
  climateProjections?: ClimateProjection[];
  biodiversity?: NativeSpeciesSummary;

  // Metadata
  profileCreatedAt: string;
  lastRefreshedAt: string;
  dataSources: string[];      // List of APIs that contributed data
}