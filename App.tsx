import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { LocationInput } from './components/LocationInput';
import { EnvironmentalDataDisplay } from './components/EnvironmentalDataDisplay';
import { PreferencesForm } from './components/PreferencesForm';
import { RecommendationsDisplay } from './components/RecommendationsDisplay';
import { GardenDashboard } from './components/GardenDashboard';
import { PlantHealthScanner } from './components/PlantHealthScanner';
import { CompanionMatrix } from './components/CompanionMatrix';
import { SoilIntelligence } from './components/SoilIntelligence';
import { MicroClimateMapper } from './components/MicroClimateMapper';
import { CarbonDashboard } from './components/CarbonDashboard';
import { BiodiversityScore } from './components/BiodiversityScore';
import { ClimateTrendForecaster } from './components/ClimateTrendForecaster';
import { PollinatorPathway } from './components/PollinatorPathway';
import { CommunityGreenMap } from './components/CommunityGreenMap';
import { SwapMarketplace } from './components/SwapMarketplace';
import { HarvestTracker } from './components/HarvestTracker';
import { MultiGardenPortfolio } from './components/MultiGardenPortfolio';
import { ARVisualizer } from './components/ARVisualizer';
import { BudgetPlanner } from './components/BudgetPlanner';
import { VoiceAssistant } from './components/VoiceAssistant';
import { TimeLapseSimulator } from './components/TimeLapseSimulator';
import { ProgressBar } from './components/common/ProgressBar';
import { Loader } from './components/common/Loader';
import { ApiKeyModal } from './components/ApiKeyModal';
import { PlantPalIcon } from './constants';
import type { LocationData, WeatherData, UserPreferences, AppStep, Theme, ActiveTool, EnvironmentalProfile } from './types';
import {
  getPlantRecommendationsFromGemini,
  QuotaExceededError,
  setUserApiKey,
  hasUserApiKey
} from './services/geminiService';
import { addGardenPlant, getGardenPlants } from './services/gardenService';
import { fetchWeatherData } from './services/weatherService';
import { fetchEnvironmentalProfile } from './services/environmentalDataService';
import { ThemeToggle } from './components/ThemeToggle';

const TOTAL_STEPS_USER_FACING = 3;

// Feature categories for organized navigation
const FEATURE_CATEGORIES = [
  { id: 'garden', icon: '🌿', label: 'My Garden', color: 'emerald',
    desc: 'Manage plants, harvest & spaces',
    tools: [
      { id: 'garden' as ActiveTool, icon: '🌿', label: 'Dashboard', desc: 'View & manage your plants' },
      { id: 'multi-garden' as ActiveTool, icon: '🗂️', label: 'Portfolio', desc: 'Multiple garden spaces' },
      { id: 'harvest' as ActiveTool, icon: '🥗', label: 'Harvest', desc: 'Track edible plant yields' },
    ]
  },
  { id: 'science', icon: '🔬', label: 'Plant Science', color: 'blue',
    desc: 'Diagnose, analyze & optimize',
    tools: [
      { id: 'plant-doctor' as ActiveTool, icon: '🩺', label: 'Health Scanner', desc: 'AI-powered plant diagnosis' },
      { id: 'companion' as ActiveTool, icon: '🔗', label: 'Companions', desc: 'Plant compatibility matrix' },
      { id: 'soil' as ActiveTool, icon: '🧪', label: 'Soil Intel', desc: 'Soil analysis & amendments' },
    ]
  },
  { id: 'environment', icon: '🌍', label: 'Environment', color: 'teal',
    desc: 'Track your ecological impact',
    tools: [
      { id: 'carbon' as ActiveTool, icon: '🌍', label: 'Carbon Impact', desc: 'CO₂ sequestration metrics' },
      { id: 'biodiversity' as ActiveTool, icon: '🦋', label: 'Biodiversity', desc: 'Ecosystem diversity score' },
      { id: 'climate' as ActiveTool, icon: '📈', label: 'Climate', desc: 'Weather trend forecasts' },
      { id: 'pollinator' as ActiveTool, icon: '🐝', label: 'Pollinators', desc: 'Pollinator pathway design' },
      { id: 'microclimate' as ActiveTool, icon: '🏙️', label: 'Micro-Climate', desc: 'Zone mapping & analysis' },
    ]
  },
  { id: 'community', icon: '👥', label: 'Community', color: 'purple',
    desc: 'Connect with local gardeners',
    tools: [
      { id: 'community-map' as ActiveTool, icon: '🗺️', label: 'Green Map', desc: 'Neighborhood planting map' },
      { id: 'swap' as ActiveTool, icon: '🔄', label: 'Plant Swap', desc: 'Seed & plant marketplace' },
    ]
  },
  { id: 'tools', icon: '🛠️', label: 'Design Tools', color: 'amber',
    desc: 'Visualize, plan & budget',
    tools: [
      { id: 'ar-visualizer' as ActiveTool, icon: '🔮', label: 'AR Preview', desc: 'Visualize plants in your space' },
      { id: 'timelapse' as ActiveTool, icon: '⏳', label: 'Time-Lapse', desc: 'Growth simulation over years' },
      { id: 'budget' as ActiveTool, icon: '💰', label: 'Budget', desc: 'Cost & ROI calculator' },
      { id: 'voice-assistant' as ActiveTool, icon: '🎙️', label: 'Voice Guide', desc: 'Hands-free planting assistant' },
    ]
  },
];

const CATEGORY_STYLES: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', activeBg: 'bg-emerald-500' },
  blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-300', activeBg: 'bg-blue-500' },
  teal: { bg: 'bg-teal-50 dark:bg-teal-900/20', border: 'border-teal-200 dark:border-teal-800', text: 'text-teal-700 dark:text-teal-300', activeBg: 'bg-teal-500' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-300', activeBg: 'bg-purple-500' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-900/20', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', activeBg: 'bg-amber-500' },
};

const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('light');
  const [currentStep, setCurrentStep] = useState<AppStep>(1);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [environmentalData, setEnvironmentalData] = useState<WeatherData | null>(null);
  const [envProfile, setEnvProfile] = useState<EnvironmentalProfile | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [stepError, setStepError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Active tool / view
  const [activeTool, setActiveTool] = useState<ActiveTool>('main');
  const [gardenCount, setGardenCount] = useState<number>(0);
  const [navCategory, setNavCategory] = useState<string | null>(null);

  // Auto-detect which category the active tool belongs to
  const activeCategoryId = useMemo(() => {
    if (activeTool === 'main') return null;
    return FEATURE_CATEGORIES.find(cat => cat.tools.some(t => t.id === activeTool))?.id || null;
  }, [activeTool]);
  const expandedCategory = navCategory ?? activeCategoryId;

  // API Key Modal state
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [quotaErrorMessage, setQuotaErrorMessage] = useState<string>('');

  useEffect(() => {
    const storedTheme = localStorage.getItem('plantpal-theme') as Theme | null;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);

    const timer = setTimeout(() => {
      const hasEnvKey = !!process.env.GEMINI_API_KEY;
      const hasUserKey = hasUserApiKey();

      if (!hasEnvKey && !hasUserKey) {
        setQuotaErrorMessage('No API key configured. Please provide your Gemini API key to use PlantPal.');
        setShowApiKeyModal(true);
      }
      setIsLoading(false);
      setGardenCount(getGardenPlants().length);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('plantpal-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleLocationSubmit = useCallback(async (loc: LocationData) => {
    setActionLoading(true);
    setStepError(null);
    setLocation(loc);
    try {
      // Fetch weather (critical) and environmental profile (enhancement) in parallel
      const [weather, profile] = await Promise.all([
        fetchWeatherData(loc.latitude, loc.longitude),
        fetchEnvironmentalProfile(loc.latitude, loc.longitude, loc.name || 'Unknown', loc.country, loc.city)
          .catch(() => null), // Profile is non-critical — don't block on failure
      ]);
      setEnvironmentalData(weather);
      if (profile) setEnvProfile(profile);
      setCurrentStep(2);
      setRecommendations(null);
      setUserPreferences(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred fetching environmental data.";
      setStepError(`Failed to fetch environmental data: ${message}. Please check the coordinates or try again.`);
    } finally {
      setActionLoading(false);
    }
  }, []);

  const constructPrompt = useCallback((
    loc: LocationData,
    weather: WeatherData,
    prefs: UserPreferences
  ): string => {
    const ep = envProfile;

    // Build rich environmental context sections
    const locationSection = [
      `- Coordinates: ${loc.latitude.toFixed(4)}°N, ${loc.longitude.toFixed(4)}°E`,
      `- Name: ${loc.name || 'Not specified'}`,
      ep?.elevation ? `- Elevation: ${ep.elevation.elevation}m above sea level` : '',
      ep?.usdaZone ? `- USDA Hardiness Zone: ${ep.usdaZone}` : '',
      ep?.koppenClass ? `- Köppen Climate: ${ep.koppenClass}` : '',
    ].filter(Boolean).join('\n    ');

    const weatherSection = [
      `- Temperature: ${weather.current.temperature_2m}°C, Humidity: ${weather.current.relative_humidity_2m}%`,
      `- Weather: ${weather.current.weather_description || 'N/A'}`,
      weather.current.uv_index != null ? `- UV Index: ${weather.current.uv_index}` : '',
      weather.current.wind_speed_10m ? `- Wind: ${weather.current.wind_speed_10m} km/h` : '',
    ].filter(Boolean).join('\n    ');

    const airSection = ep?.airQuality ? [
      `- Air Quality Index (US AQI): ${ep.airQuality.aqi}`,
      `- PM2.5: ${ep.airQuality.pm25} µg/m³, PM10: ${ep.airQuality.pm10} µg/m³`,
      `- Ozone: ${ep.airQuality.ozone} µg/m³, NO₂: ${ep.airQuality.no2} µg/m³`,
    ].join('\n    ') : '';

    const soilSection = ep?.soilGrids ? [
      `- Soil Class: ${ep.soilGrids.soilClass}`,
      `- pH: ${ep.soilGrids.ph.toFixed(1)}, Clay: ${ep.soilGrids.clay.toFixed(0)}%, Sand: ${ep.soilGrids.sand.toFixed(0)}%, Silt: ${ep.soilGrids.silt.toFixed(0)}%`,
      `- Organic Carbon: ${ep.soilGrids.organicCarbon.toFixed(1)} g/kg`,
      ep?.soilConditions ? `- Current soil temp (0-7cm): ${ep.soilConditions.temperature0to7cm.toFixed(1)}°C, Moisture: ${(ep.soilConditions.moisture0to7cm * 100).toFixed(0)}%` : '',
      ep?.soilConditions ? `- Today's evapotranspiration: ${ep.soilConditions.evapotranspiration.toFixed(1)} mm` : '',
    ].filter(Boolean).join('\n    ') : '';

    const sunSection = ep?.sunMoon ? [
      `- Daylight: ${ep.sunMoon.dayLength} hours (Sunrise: ${ep.sunMoon.sunrise}, Sunset: ${ep.sunMoon.sunset})`,
      `- Moon: ${ep.sunMoon.moonPhase} (${ep.sunMoon.moonIllumination}% illumination)`,
    ].join('\n    ') : '';

    const climateSection = ep?.historicalClimate ? [
      `- Avg Annual Temp: ${ep.historicalClimate.avgAnnualTempC}°C, Avg Annual Rain: ${ep.historicalClimate.avgAnnualRainMm}mm`,
      `- Hottest Month Avg: ${ep.historicalClimate.hottestMonthAvgC}°C, Coldest Month Avg: ${ep.historicalClimate.coldestMonthAvgC}°C`,
      `- 30-year temp trend: ${ep.historicalClimate.tempTrend30yr > 0 ? '+' : ''}${ep.historicalClimate.tempTrend30yr}°C`,
      `- Frost dates: Last spring ${ep.historicalClimate.frostDates.lastSpringFrost}, First fall ${ep.historicalClimate.frostDates.firstFallFrost}`,
      `- Growing season: ~${ep.historicalClimate.frostDates.growingSeasonDays} days`,
    ].join('\n    ') : '';

    const bioSection = ep?.biodiversity ? [
      `- ${ep.biodiversity.totalPlantSpecies} plant species observed within 10km`,
      ep.biodiversity.keyNativePlants.length > 0 ? `- Key native species: ${ep.biodiversity.keyNativePlants.slice(0, 10).join(', ')}` : '',
      ep.biodiversity.invasiveSpecies.length > 0 ? `- Invasive species to avoid: ${ep.biodiversity.invasiveSpecies.join(', ')}` : '',
    ].filter(Boolean).join('\n    ') : '';

    return `You are PlantPal, an expert AI assistant for urban sustainability and green planning.
    Generate plant and green infrastructure recommendations based on the following information:

    **Location:**
    ${locationSection}

    **Current Weather:**
    ${weatherSection}
    ${airSection ? `\n    **Air Quality:**\n    ${airSection}` : ''}
    ${soilSection ? `\n    **Soil Profile (from ISRIC SoilGrids, 250m resolution):**\n    ${soilSection}` : ''}
    ${sunSection ? `\n    **Sun & Moon:**\n    ${sunSection}` : ''}
    ${climateSection ? `\n    **Historical Climate (30-year analysis):**\n    ${climateSection}` : ''}
    ${bioSection ? `\n    **Local Biodiversity (GBIF, 10km radius):**\n    ${bioSection}` : ''}

    **User Preferences & Project Details:**
    - Sunlight Exposure: ${prefs.sunlightExposure}
    - Hours of Direct Sunlight: ${prefs.sunlightHours} hours/day
    - Watering Frequency: ${prefs.wateringFrequency}
    - Drought Tolerance Preference: ${prefs.droughtTolerant ? 'Yes, prefers drought-tolerant plants' : 'No, fine with regular watering'}
    - Planting Area Size: ${typeof prefs.plantingAreaSize === 'string' && prefs.plantingAreaSize.startsWith("Custom:") ? prefs.customPlantingAreaSize || 'Custom size not specified' : prefs.plantingAreaSize}
    - Max Plant Height: ${prefs.heightClearance}
    - Desired Plant Type(s): ${prefs.plantType.trim() || 'Any suitable type'}
    - Overall Project Area (approximate): ${prefs.projectArea.trim() || 'Not specified'}
    - Key Urban Planning Goals: ${prefs.planningGoals.length > 0 ? prefs.planningGoals.join(', ') : 'General beautification and sustainability'}

    **Recommendation Guidelines:**
    - Prioritize native or well-adapted species for the specified location and climate.
    ${ep?.soilGrids ? `- The soil is ${ep.soilGrids.soilClass} with pH ${ep.soilGrids.ph.toFixed(1)}. Consider this for plant suitability and suggest amendments if needed.` : '- Consider typical soil types for urban/regional areas. Suggest soil testing if critical.'}
    ${ep?.airQuality && ep.airQuality.aqi > 50 ? `- Air quality is ${ep.airQuality.aqi > 100 ? 'poor' : 'moderate'} (AQI ${ep.airQuality.aqi}). Prioritize plants with air-purifying and particulate-filtering capabilities.` : ''}
    - If relevant, mention how microclimate factors may influence choices.
    - Aim to enhance local biodiversity and ecological resilience.
    ${ep?.biodiversity && ep.biodiversity.keyNativePlants.length > 0 ? `- Prioritize species from the native species list observed in this area when possible.` : ''}
    - Suggest plants that are relatively low-maintenance and suitable for urban environments.

    **Output Format (Use Markdown - CRITICAL: FOLLOW THIS STRUCTURE PRECISELY):**
    Provide a list of 3-5 specific plant recommendations. For each plant, use the following numbered format:
    1.  **Common Name** (Scientific Name in parentheses)
    2.  **Description:** Brief overview (1-2 sentences).
    3.  **Suitability:** Why it fits the user's criteria (sunlight, water, space, goals).${ep?.soilGrids ? ' Reference the soil type and pH.' : ''}
    4.  **Key Benefits:** e.g., Pollinator-friendly, edible, air purifying, etc.
    5.  **Maintenance Tips:** Brief, essential care notes.

    Then, after all plant recommendations, include a section titled:
    ### Green Infrastructure Ideas
    Suggest 1-2 green infrastructure ideas relevant to the user's goals. For each idea:
    - **Idea Title:** (e.g., **Rain Garden**)
    - **Explanation:** Why it is suitable and what types of plants from your recommendations might fit.

    Finally, conclude with a section titled:
    ### Conclusion
    A friendly, encouraging remark and a reminder to consult local horticultural experts or resources.
    Ensure the response is well-structured, practical, actionable, and encouraging.
    `;
  }, [envProfile]);

  const handlePreferencesSubmit = useCallback(async (prefs: UserPreferences) => {
    if (!location || !environmentalData) {
      setStepError("Critical error: Missing Location or Environmental Data. Please restart the process.");
      setCurrentStep(1);
      return;
    }
    setActionLoading(true);
    setStepError(null);
    setUserPreferences(prefs);

    try {
      const prompt = constructPrompt(location, environmentalData, prefs);
      const result = await getPlantRecommendationsFromGemini(prompt);
      setRecommendations(result);
      setCurrentStep(3);
    } catch (err) {
      // Check if it's a quota exceeded error
      if (err instanceof QuotaExceededError) {
        setQuotaErrorMessage(err.message);
        setShowApiKeyModal(true);
        setStepError('API quota exceeded. Please add your own API key to continue.');
      } else {
        const message = err instanceof Error ? err.message : "An unknown error occurred while fetching recommendations.";
        setStepError(`Failed to get recommendations: ${message}. You can try adjusting preferences or try again.`);
      }
      setRecommendations(null);
    } finally {
      setActionLoading(false);
    }
  }, [location, environmentalData, constructPrompt]);

  const handleReset = useCallback(() => {
    setCurrentStep(1);
    setLocation(null);
    setEnvironmentalData(null);
    setEnvProfile(null);
    setUserPreferences(null);
    setRecommendations(null);
    setStepError(null);
    setActionLoading(false);
  }, []);

  const handleRefine = useCallback(() => {
    setCurrentStep(2);
    setRecommendations(null);
    setStepError(null);
    setActionLoading(false);
  }, []);

  // API Key handlers
  const handleSaveApiKey = useCallback((apiKey: string) => {
    setUserApiKey(apiKey);
    setShowApiKeyModal(false);
    setQuotaErrorMessage('');
    setStepError(null);
    // If user was on step 2, they can try again now
    // API key saved successfully
  }, []);

  const handleCloseApiKeyModal = useCallback(() => {
    setShowApiKeyModal(false);
  }, []);

  // Centralized quota error handler - passed to all AI-powered components
  const handleQuotaError = useCallback((message?: string) => {
    setQuotaErrorMessage(message || 'API quota exceeded. Please provide your own Gemini API key to continue.');
    setShowApiKeyModal(true);
  }, []);

  // Escape key to close modal or return to main view
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showApiKeyModal) handleCloseApiKeyModal();
        else if (activeTool !== 'main') { setActiveTool('main'); setGardenCount(getGardenPlants().length); }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [showApiKeyModal, handleCloseApiKeyModal, activeTool]);

  // Scroll to top button visibility
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Seasonal tip based on current month and environmental profile
  const seasonalTip = useMemo(() => {
    const month = new Date().getMonth();
    const tips = [
      '❄️ Plan spring beds now & start seeds indoors.',
      '🌱 Last chance for cold-weather crops before warmth.',
      '🌸 Spring is here! Perfect time to plant perennials.',
      '🌷 Divide & transplant overcrowded perennials.',
      '☀️ Mulch beds to retain moisture for summer.',
      '🌻 Keep watering deeply during hot spells.',
      '🌿 Prune summer-flowering shrubs after blooming.',
      '🍂 Plan fall plantings & order spring bulbs.',
      '🍁 Plant trees & shrubs for root establishment.',
      '🎃 Clean up beds & add compost for next year.',
      '🌾 Protect tender plants before first frost.',
      '⛄ Review this year & dream up next year\'s garden!',
    ];
    let tip = tips[month];
    if (envProfile?.historicalClimate && envProfile?.usdaZone) {
      const isSpring = month >= 2 && month <= 4;
      const isFall = month >= 8 && month <= 10;
      if (isSpring) tip += ` (Zone ${envProfile.usdaZone} last frost: ${envProfile.historicalClimate.frostDates.lastSpringFrost})`;
      else if (isFall) tip += ` (Zone ${envProfile.usdaZone} first frost: ${envProfile.historicalClimate.frostDates.firstFallFrost})`;
      else tip += ` (You're growing in USDA Zone ${envProfile.usdaZone})`;
    }
    return tip;
  }, [envProfile]);


  const currentStepName = useMemo((): string => {
    switch (currentStep) {
      case 1: return "Location & Environment";
      case 2: return "Your Preferences";
      case 3: return "Plant Recommendations";
      default: return "";
    }
  }, [currentStep]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-emerald-500 via-green-500 to-teal-500 p-6 text-center">
        <PlantPalIcon className="w-24 h-24 sm:w-32 sm:h-32 text-white mb-6 animate-pulse" />
        <h1 className="text-4xl sm:text-5xl font-extrabold text-white mb-3" style={{ textShadow: '1px 1px 3px rgba(0,0,0,0.2)' }}>PlantPal</h1>
        <div className="space-x-1 mb-6">
          <span className="inline-block w-3 h-3 bg-white rounded-full animate-bounce animation-delay-0"></span>
          <span className="inline-block w-3 h-3 bg-white rounded-full animate-bounce animation-delay-200"></span>
          <span className="inline-block w-3 h-3 bg-white rounded-full animate-bounce animation-delay-400"></span>
        </div>
        <Loader text="Initializing your green planning assistant..." size="md" loaderColor="text-white" textColor="text-emerald-100" />
        <p className="mt-4 text-lg text-emerald-100 font-medium">Cultivating sustainable futures...</p>
        <footer className="absolute bottom-8 text-sm text-emerald-200">
          <p>&copy; {new Date().getFullYear()} PlantPal.</p>
        </footer>
      </div>
    );
  }


  const renderStepContent = () => {
    const animationKey = `step-${currentStep}`;

    if (actionLoading) {
      return <div className="flex flex-col justify-center items-center h-96"><Loader size="lg" text="Processing..." loaderColor="text-emerald-500 dark:text-emerald-400" textColor="text-emerald-600 dark:text-emerald-300" /><p className="mt-3 text-lg text-emerald-600 dark:text-emerald-400">Fetching your data...</p></div>;
    }

    switch (currentStep) {
      case 1:
        return (
          <div key={animationKey} className="step-transition">
            <LocationInput onSubmit={handleLocationSubmit} />
            {stepError && <p className="mt-4 p-3 bg-red-50 dark:bg-red-800/30 text-red-600 dark:text-red-400 rounded-lg shadow-sm text-sm border border-red-200 dark:border-red-600/30">{stepError}</p>}
          </div>
        );
      case 2:
        if (!location || !environmentalData) {
          handleReset();
          return null;
        }
        return (
          <div key={animationKey} className="step-transition">
            <EnvironmentalDataDisplay data={environmentalData} locationName={location.name} envProfile={envProfile} />
            <PreferencesForm
              onSubmit={handlePreferencesSubmit}
              isLoading={actionLoading}
              initialPreferences={userPreferences}
            />
            {stepError && <p className="mt-4 p-3 bg-red-50 dark:bg-red-800/30 text-red-600 dark:text-red-400 rounded-lg shadow-sm text-sm border border-red-200 dark:border-red-600/30">{stepError}</p>}
          </div>
        );
      case 3:
        if (!userPreferences) {
          handleRefine();
          return null;
        }
        return (
          <div key={animationKey} className="step-transition">
            <RecommendationsDisplay
              recommendations={recommendations}
              isLoading={actionLoading}
              error={stepError}
              onReset={handleReset}
              onRefine={handleRefine}
              location={location}
              preferences={userPreferences}
              onAddToGarden={(plant) => {
                addGardenPlant({ id: plant.id, commonName: plant.commonName, scientificName: plant.scientificName, description: plant.description, dateAdded: new Date().toISOString(), status: 'active' });
                setGardenCount(getGardenPlants().length);
              }}
              onOpenGarden={() => setActiveTool('garden')}
            />
          </div>
        );
      default:
        handleReset();
        return <p className="text-center text-red-500 dark:text-red-400">An unexpected error occurred. Resetting...</p>;
    }
  };

  return (
    <div className="min-h-screen py-4 sm:py-8 px-3 sm:px-4 flex flex-col items-center selection:bg-emerald-100 dark:selection:bg-emerald-800/50 selection:text-emerald-700 dark:selection:text-emerald-200">
      <header className="mb-4 sm:mb-6 text-center w-full max-w-5xl relative">
        {/* Compact Logo Row */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <PlantPalIcon className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-700 dark:text-emerald-400" />
          <div className="text-left">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-green-800 dark:text-green-200 tracking-tight leading-none">PlantPal</h1>
            <p className="text-[10px] sm:text-xs text-emerald-600 dark:text-emerald-400 font-medium">AI-Powered Green Urban Planning</p>
          </div>
        </div>
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />

        {/* Category Navigation */}
        <nav className="mt-3 no-print">
          {/* Level 1: Category Tabs */}
          <div className="flex flex-wrap justify-center gap-1.5">
            {/* Home tab */}
            <button onClick={() => { setActiveTool('main'); setNavCategory(null); setGardenCount(getGardenPlants().length); }}
              className={`flex items-center gap-1 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                activeTool === 'main'
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                  : 'bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:shadow-md'
              }`}>
              🏠 Home
            </button>
            {FEATURE_CATEGORIES.map(cat => {
              const styles = CATEGORY_STYLES[cat.color];
              const isActive = expandedCategory === cat.id;
              const hasActiveTool = cat.tools.some(t => t.id === activeTool);
              return (
                <button key={cat.id} onClick={() => setNavCategory(navCategory === cat.id ? null : cat.id)}
                  className={`flex items-center gap-1 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all border ${
                    hasActiveTool
                      ? `${styles.activeBg} text-white border-transparent shadow-lg`
                      : isActive
                        ? `${styles.bg} ${styles.text} ${styles.border} ring-2 ring-offset-1 ring-current/20`
                        : `bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:${styles.bg} hover:shadow-md`
                  }`}>
                  {cat.icon} {cat.label}
                  {cat.id === 'garden' && gardenCount > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      hasActiveTool ? 'bg-white/25 text-white' : 'bg-emerald-500 text-white'
                    }`}>{gardenCount}</span>
                  )}
                  <svg className={`w-3 h-3 transition-transform ${isActive ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              );
            })}
          </div>

          {/* Level 2: Tools for Expanded Category */}
          {expandedCategory && (
            <div className="mt-2 flex flex-wrap justify-center gap-1 animate-fade-in">
              {FEATURE_CATEGORIES.find(c => c.id === expandedCategory)?.tools.map(tool => (
                <button key={tool.id} onClick={() => { setActiveTool(tool.id); setNavCategory(null); }}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-all border ${
                    activeTool === tool.id
                      ? 'bg-slate-800 dark:bg-white text-white dark:text-slate-800 border-transparent shadow-md'
                      : 'bg-slate-50 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 hover:shadow-sm'
                  }`}>
                  {tool.icon} {tool.label}
                </button>
              ))}
            </div>
          )}
        </nav>
      </header>

      <main className={`w-full bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 transition-all duration-300 ${
        activeTool !== 'main' ? 'max-w-2xl lg:max-w-4xl p-4 sm:p-6 md:p-8' : 'max-w-3xl lg:max-w-5xl p-0'
      }`}>
        {activeTool === 'garden' ? (
          <GardenDashboard onBack={() => { setActiveTool('main'); setGardenCount(getGardenPlants().length); }} location={location} weatherData={environmentalData} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'plant-doctor' ? (
          <PlantHealthScanner onBack={() => setActiveTool('main')} location={location} weatherData={environmentalData} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'companion' ? (
          <CompanionMatrix onBack={() => setActiveTool('main')} onQuotaError={handleQuotaError} />
        ) : activeTool === 'soil' ? (
          <SoilIntelligence onBack={() => setActiveTool('main')} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'microclimate' ? (
          <MicroClimateMapper onBack={() => setActiveTool('main')} location={location} weatherData={environmentalData} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'carbon' ? (
          <CarbonDashboard onBack={() => setActiveTool('main')} location={location} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'biodiversity' ? (
          <BiodiversityScore onBack={() => setActiveTool('main')} location={location} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'climate' ? (
          <ClimateTrendForecaster onBack={() => setActiveTool('main')} location={location} weatherData={environmentalData} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'pollinator' ? (
          <PollinatorPathway onBack={() => setActiveTool('main')} location={location} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'community-map' ? (
          <CommunityGreenMap onBack={() => setActiveTool('main')} location={location} />
        ) : activeTool === 'swap' ? (
          <SwapMarketplace onBack={() => setActiveTool('main')} location={location} />
        ) : activeTool === 'harvest' ? (
          <HarvestTracker onBack={() => setActiveTool('main')} location={location} onQuotaError={handleQuotaError} envProfile={envProfile} />
        ) : activeTool === 'multi-garden' ? (
          <MultiGardenPortfolio onBack={() => setActiveTool('main')} location={location} />
        ) : activeTool === 'ar-visualizer' ? (
          <ARVisualizer onBack={() => setActiveTool('main')} location={location} onQuotaError={handleQuotaError} />
        ) : activeTool === 'budget' ? (
          <BudgetPlanner onBack={() => setActiveTool('main')} location={location} />
        ) : activeTool === 'voice-assistant' ? (
          <VoiceAssistant onBack={() => setActiveTool('main')} location={location} onQuotaError={handleQuotaError} />
        ) : activeTool === 'timelapse' ? (
          <TimeLapseSimulator onBack={() => setActiveTool('main')} location={location} onQuotaError={handleQuotaError} />
        ) : (
          <>
            {/* Dashboard Quick Stats & Environmental Context */}
            {gardenCount > 0 && (
              <div className="px-4 sm:px-6 pt-5 pb-2">
                {envProfile && (
                  <div className="mb-4 flex flex-wrap items-center justify-center gap-2 text-[11px] sm:text-xs">
                    <span className="px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">📍 {location?.name || 'Local'}</span>
                    <span className="px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">🌡️ Zone {envProfile.usdaZone}</span>
                    {envProfile.historicalClimate && <span className="px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">🌦️ {envProfile.koppenClass?.split(' ')[0]}</span>}
                    {envProfile.airQuality && <span className={`px-2 py-1 rounded-full ${envProfile.airQuality.aqi > 50 ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'}`}>💨 AQI: {envProfile.airQuality.aqi}</span>}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-center">
                    <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{gardenCount}</p>
                    <p className="text-[10px] text-emerald-600 dark:text-emerald-400">Active Plants</p>
                  </div>
                  <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 text-center">
                    <p className="text-lg font-bold text-teal-700 dark:text-teal-300">{(gardenCount * 5.2).toFixed(0)}</p>
                    <p className="text-[10px] text-teal-600 dark:text-teal-400">kg CO₂/year</p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-center">
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{Math.min(100, Math.round(50 + gardenCount * 3))}</p>
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">Bio Score</p>
                  </div>
                </div>
              </div>
            )}

            {/* Wizard Section */}
            <div className="p-4 sm:p-6 md:p-8">
              <div className="mb-6 sm:mb-8">
                <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1.5 text-center">Step {currentStep} of {TOTAL_STEPS_USER_FACING}: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{currentStepName}</span></p>
                <ProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS_USER_FACING} />
              </div>
              {renderStepContent()}
            </div>

            {/* Feature Discovery Grid */}
            <div className="border-t border-slate-200 dark:border-slate-700 px-4 sm:px-6 py-5 bg-slate-50/50 dark:bg-slate-800/50 rounded-b-xl">
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200 mb-3 text-center">🌿 Explore PlantPal Features</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {FEATURE_CATEGORIES.map(cat => {
                  const styles = CATEGORY_STYLES[cat.color];
                  return (
                    <button key={cat.id} onClick={() => setNavCategory(navCategory === cat.id ? null : cat.id)}
                      className={`p-3 rounded-xl border text-left transition-all hover:shadow-md group ${styles.bg} ${styles.border}`}>
                      <span className="text-xl block mb-1">{cat.icon}</span>
                      <p className={`text-xs font-bold ${styles.text}`}>{cat.label}</p>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">{cat.desc}</p>
                      <div className="flex flex-wrap gap-0.5 mt-1.5">
                        {cat.tools.map(t => (
                          <span key={t.id} onClick={(e) => { e.stopPropagation(); setActiveTool(t.id); }}
                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/70 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-600 cursor-pointer transition-colors">
                            {t.icon} {t.label}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </main>
      <footer className={`mt-8 sm:mt-12 mb-6 text-center text-sm text-green-700 dark:text-green-400 w-full transition-all duration-300 ${
        activeTool !== 'main' ? 'max-w-2xl lg:max-w-4xl' : 'max-w-3xl lg:max-w-5xl'
      }`}>
        <div className="p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-medium no-print">
          🌱 <span className="font-semibold">Seasonal Tip:</span> {seasonalTip}
        </div>
        <p>&copy; {new Date().getFullYear()} PlantPal. Cultivating a greener tomorrow.</p>
        <p className="text-xs mt-1 text-slate-500 dark:text-slate-500">AI recommendations. Always consult local experts.</p>
      </footer>

      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showApiKeyModal}
        onClose={handleCloseApiKeyModal}
        onSave={handleSaveApiKey}
        errorMessage={quotaErrorMessage}
      />

      {/* Scroll to Top */}
      <button
        onClick={scrollToTop}
        className={`scroll-to-top no-print ${
          showScrollTop ? 'visible' : ''
        } p-3 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl transition-colors`}
        aria-label="Scroll to top"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
        </svg>
      </button>
    </div>
  );
};

export default App;
