import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { LocationInput } from './components/LocationInput';
import { EnvironmentalDataDisplay } from './components/EnvironmentalDataDisplay';
import { PreferencesForm } from './components/PreferencesForm';
import { RecommendationsDisplay } from './components/RecommendationsDisplay';
import { ProgressBar } from './components/common/ProgressBar';
import { Loader } from './components/common/Loader';
import { PlantPalIcon } from './constants';
import type { LocationData, WeatherData, UserPreferences, AppStep, Theme } from './types';
import { getPlantRecommendationsFromGemini } from './services/geminiService';
import { fetchWeatherData } from './services/weatherService';
import { ThemeToggle } from './components/ThemeToggle';

const TOTAL_STEPS_USER_FACING = 3; // Location, Preferences, Recommendations

const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('light');
  const [currentStep, setCurrentStep] = useState<AppStep>(1);
  const [location, setLocation] = useState<LocationData | null>(null);
  const [environmentalData, setEnvironmentalData] = useState<WeatherData | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null);
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);
  const [stepError, setStepError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem('plantpal-theme') as Theme | null;
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');
    setTheme(initialTheme);

    // Simulate initialization and check for API key
    const timer = setTimeout(() => {
      if (!process.env.API_KEY) {
        setInitializationError("API_KEY environment variable is not set.");
      }
      setIsLoading(false);
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
      const weather = await fetchWeatherData(loc.latitude, loc.longitude);
      setEnvironmentalData(weather);
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
    return `You are PlantPal, an expert AI assistant for urban sustainability and green planning.
    Generate plant and green infrastructure recommendations based on the following information:

    **Location:**
    - Coordinates: Latitude ${loc.latitude.toFixed(4)}, Longitude ${loc.longitude.toFixed(4)}.
    - Name/Description: ${loc.name || 'Not specified'}.

    **Current Environmental Conditions:**
    - Temperature: ${weather.current.temperature_2m}°C
    - Relative Humidity: ${weather.current.relative_humidity_2m}%
    - Weather: ${weather.current.weather_description}
    - Data Time: ${new Date(weather.current.time).toLocaleString()}

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
    - Consider typical soil types and topography for urban/regional areas. Suggest soil testing if critical.
    - If relevant, briefly mention how microclimate factors (e.g., urban heat island, wind channels) might influence choices.
    - Aim to enhance local biodiversity and ecological resilience.
    - Suggest plants that are relatively low-maintenance and suitable for urban environments.

    **Output Format (Use Markdown - CRITICAL: FOLLOW THIS STRUCTURE PRECISELY):**
    Provide a list of 3-5 specific plant recommendations. For each plant, use the following numbered format:
    1.  **Common Name** (Scientific Name in parentheses)
    2.  **Description:** Brief overview (1-2 sentences).
    3.  **Suitability:** Why it fits the user's criteria (sunlight, water, space, goals).
    4.  **Key Benefits:** e.g., Pollinator-friendly, edible, air purifying, etc.
    5.  **Maintenance Tips:** Brief, essential care notes.

    Example for one plant:
    1. **Sunny Delight** (Helianthus annuus 'Sunny')
    2. **Description:** A vibrant sunflower variety known for its bright yellow petals and cheerful disposition. Grows quickly.
    3. **Suitability:** Perfect for full sun (6+ hours), well-draining soil, and can tolerate some drought once established. Fits medium to large spaces.
    4. **Key Benefits:** Attracts pollinators, edible seeds, adds striking vertical interest.
    5. **Maintenance Tips:** Water regularly until established, then less frequently. May need staking in windy areas.

    Then, after all plant recommendations, include a section titled:
    ### Green Infrastructure Ideas
    Suggest 1-2 green infrastructure ideas relevant to the user's goals (e.g., rain garden for flood mitigation, green wall for urban cooling, pollinator patch for biodiversity). For each idea:
    - **Idea Title:** (e.g., **Rain Garden**)
    - **Explanation:** Why it is suitable and what types of plants from your recommendations might fit.

    Example for Green Infrastructure:
    ### Green Infrastructure Ideas
    - **Pollinator Patch:** Create a dedicated area with a mix of flowering plants from the recommendations like [Plant Name 1] and [Plant Name 2] to support local bees, butterflies, and other beneficial insects. This aligns with biodiversity goals.

    Finally, conclude with a section titled:
    ### Conclusion
    A friendly, encouraging remark and a reminder to consult local horticultural experts or resources.
    Ensure the response is well-structured, practical, actionable, and encouraging.
    `;
  }, []);

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
      const message = err instanceof Error ? err.message : "An unknown error occurred while fetching recommendations.";
      setStepError(`Failed to get recommendations: ${message}. You can try adjusting preferences or try again.`);
      setRecommendations(null);
    } finally {
      setActionLoading(false);
    }
  }, [location, environmentalData, constructPrompt]);

  const handleReset = useCallback(() => {
    setCurrentStep(1);
    setLocation(null);
    setEnvironmentalData(null);
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

  if (initializationError) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-red-400 via-pink-500 to-rose-500 p-6 text-center">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-20 h-20 sm:w-24 sm:h-24 text-white mb-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.008v.008H12v-.008z" />
        </svg>
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">Application Error</h1>
        <div className="bg-white/90 p-6 sm:p-8 rounded-xl shadow-2xl max-w-md sm:max-w-lg backdrop-blur-sm">
          <p className="text-lg text-red-700 mb-2 font-semibold">
            PlantPal could not start.
          </p>
          <p className="text-sm text-slate-700 mb-3">
            <strong>Details:</strong> {initializationError}
          </p>
          <p className="text-sm text-slate-600">
            Please ensure the administrator has correctly configured the <code>API_KEY</code>.
          </p>
        </div>
        <footer className="absolute bottom-8 text-sm text-red-100">
          <p>&copy; {new Date().getFullYear()} PlantPal. We apologize for the inconvenience.</p>
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
            <EnvironmentalDataDisplay data={environmentalData} locationName={location.name} />
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
            />
          </div>
        );
      default:
        handleReset();
        return <p className="text-center text-red-500 dark:text-red-400">An unexpected error occurred. Resetting...</p>;
    }
  };

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 flex flex-col items-center selection:bg-emerald-100 dark:selection:bg-emerald-800/50 selection:text-emerald-700 dark:selection:text-emerald-200">
      <header className="mb-8 sm:mb-12 text-center w-full max-w-4xl relative">
        <div className="flex flex-col justify-center items-center space-y-2 drop-shadow-sm">
          <PlantPalIcon className="w-16 h-16 sm:w-20 sm:h-20 text-emerald-700 dark:text-emerald-400" />
          <h1 className="text-4xl sm:text-5xl font-extrabold text-green-800 dark:text-green-200 tracking-tight">
            PlantPal
          </h1>
          <div className="flex space-x-1.5">
            <span className="inline-block w-2.5 h-2.5 bg-emerald-500 dark:bg-emerald-400 rounded-full"></span>
            <span className="inline-block w-2.5 h-2.5 bg-emerald-500 dark:bg-emerald-400 rounded-full opacity-80"></span>
            <span className="inline-block w-2.5 h-2.5 bg-emerald-500 dark:bg-emerald-400 rounded-full opacity-60"></span>
          </div>
        </div>
        {currentStep !== 3 && <p className="mt-3 text-lg sm:text-xl text-green-700 dark:text-green-300 font-medium">Your AI Assistant for Greener Urban Spaces</p>}
        <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
      </header>

      <main className="w-full max-w-xl lg:max-w-3xl bg-white dark:bg-slate-800 p-5 sm:p-8 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700">
        <div className="mb-6 sm:mb-8">
          <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-1.5 text-center">Step {currentStep} of {TOTAL_STEPS_USER_FACING}: <span className="font-semibold text-emerald-700 dark:text-emerald-300">{currentStepName}</span></p>
          <ProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS_USER_FACING} />
        </div>
        {renderStepContent()}
      </main>
      <footer className="mt-12 sm:mt-16 mb-6 text-center text-sm text-green-700 dark:text-green-400">
        <p>&copy; {new Date().getFullYear()} PlantPal. Cultivating a greener tomorrow.</p>
        <p className="text-xs mt-1">AI recommendations. Always consult local experts.</p>
      </footer>
    </div>
  );
};

export default App;
