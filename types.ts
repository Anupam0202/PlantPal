// Fix: AppStep type updated to reflect new 3-step flow.
export type AppStep = 1 | 2 | 3;
export type Theme = 'light' | 'dark';

export interface LocationData {
  latitude: number;
  longitude: number;
  name?: string; // e.g., "Current Location" or address string
}

export interface WeatherData {
  latitude: number;
  longitude: number;
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    weather_code: number;
    weather_description?: string; // Added by our mapping
    time: string;
  };
  // We can extend this with daily/hourly forecasts if needed
}

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
  CUSTOM = "Custom Size (Specify)", // Made more explicit for UI
}

export enum HeightClearance {
  NO_LIMIT = "No Limit",
  UNDER_3_FT = "Under 3 ft (approx 1 m)",
  BETWEEN_3_AND_6_FT = "3-6 ft (approx 1-2 m)",
  OVER_6_FT = "Over 6 ft (approx 2+ m)",
}

export interface UserPreferences {
  sunlightExposure: SunlightExposure;
  sunlightHours: number; // 0-12
  wateringFrequency: WateringFrequency;
  droughtTolerant: boolean;
  // plantingAreaSize can be one of the enum values or a string like "Custom: 25 sq ft"
  plantingAreaSize: PlantingAreaSize | string;
  customPlantingAreaSize?: string; // Stores the actual custom value, e.g., "25 sq ft" or "2m x 3m"
  heightClearance: HeightClearance;
  plantType: string; // e.g., "Flower, Fruit, Tree"
  planningGoals: string[]; // Array of selected goals from constants.ts
  projectArea: string; // e.g. "100 sq m"
}

// WMO Weather interpretation codes
// Reference: https://open-meteo.com/en/docs (see WMO Weather interpretation codes table)
export interface WeatherCodeInterpretation {
  description: string;
  icon?: string; // Optional: for future icon integration
}

export const WMO_WEATHER_CODES: Record<number, WeatherCodeInterpretation> = {
  0: { description: "Clear sky" },
  1: { description: "Mainly clear" },
  2: { description: "Partly cloudy" },
  3: { description: "Overcast" },
  45: { description: "Fog" },
  48: { description: "Depositing rime fog" },
  51: { description: "Light drizzle" },
  53: { description: "Moderate drizzle" },
  55: { description: "Dense drizzle" },
  56: { description: "Light freezing drizzle" },
  57: { description: "Dense freezing drizzle" },
  61: { description: "Slight rain" },
  63: { description: "Moderate rain" },
  65: { description: "Heavy rain" },
  66: { description: "Light freezing rain" },
  67: { description: "Heavy freezing rain" },
  71: { description: "Slight snow fall" },
  73: { description: "Moderate snow fall" },
  75: { description: "Heavy snow fall" },
  77: { description: "Snow grains" },
  80: { description: "Slight rain showers" },
  81: { description: "Moderate rain showers" },
  82: { description: "Violent rain showers" },
  85: { description: "Slight snow showers" },
  86: { description: "Heavy snow showers" },
  95: { description: "Thunderstorm: Slight or moderate" },
  96: { description: "Thunderstorm with slight hail" },
  99: { description: "Thunderstorm with heavy hail" },
};

// Types for parsed recommendations
export interface PlantInfo {
  id: string;
  commonName: string;
  scientificName?: string;
  description?: string;
  suitability?: string;
  keyBenefits?: string;
  maintenanceTips?: string;
  // Image related fields removed:
  // imageUrl?: string;
  // imageLoading?: boolean;
  // imageError?: boolean;
}

export interface InfrastructureInfo {
  id: string;
  title: string;
  explanation?: string; // Changed from 'description' to 'explanation' to match prompt
}