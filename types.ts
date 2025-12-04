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

// Image Generation Types
export interface ImageGenerationResult {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export interface PlantImageRequest {
  plantId: string;
  plantName: string;
  scientificName?: string;
}

// Export Data Types
export interface ExportData {
  location: LocationData;
  preferences: UserPreferences;
  plants: PlantInfo[];
  infrastructure: InfrastructureInfo[];
  conclusion: string | null;
  exportedAt: string;
}

// Favorite Item
export interface FavoriteItem {
  plantId: string;
  plantName: string;
  addedAt: Date;
}

// View Mode
export type ViewMode = 'grid' | 'list';

// Filter Options
export interface FilterOptions {
  showFavoritesOnly: boolean;
  searchQuery: string;
}