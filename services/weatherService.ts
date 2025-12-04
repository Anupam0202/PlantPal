import type { WeatherData } from '../types';
import { WMO_WEATHER_CODES } from '../types';

const API_BASE_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

export interface GeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string; // State/Province
  timezone: string;
}

// Fetch weather data with enhanced parameters
export const fetchWeatherData = async (latitude: number, longitude: number): Promise<WeatherData> => {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "weather_code",
      "wind_speed_10m",
      "precipitation",
      "cloud_cover",
      "uv_index"
    ].join(","),
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum"
    ].join(","),
    timezone: "auto",
    forecast_days: "7"
  });

  const url = `${API_BASE_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      let errorMessage = `Weather API error (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.reason || errorData.error || response.statusText;
      } catch {
        errorMessage = response.statusText;
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    // Map weather code to description and icon
    if (data.current && typeof data.current.weather_code === 'number') {
      const weatherCodeInfo = WMO_WEATHER_CODES[data.current.weather_code];
      data.current.weather_description = weatherCodeInfo
        ? weatherCodeInfo.description
        : "Unknown weather condition";
    }

    return data as WeatherData;
  } catch (error) {
    console.error("Failed to fetch weather data:", error);
    if (error instanceof Error) {
      throw new Error(`Failed to fetch weather data: ${error.message}`);
    }
    throw new Error("An unknown error occurred while fetching weather data.");
  }
};

// Geocoding: Search for location by name
export const searchLocation = async (query: string): Promise<GeocodingResult[]> => {
  if (!query || query.trim().length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    name: query.trim(),
    count: "10",
    language: "en",
    format: "json"
  });

  const url = `${GEOCODING_URL}?${params.toString()}`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Geocoding API error (${response.status})`);
    }

    const data = await response.json();

    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    return data.results.map((result: any) => ({
      name: result.name,
      latitude: result.latitude,
      longitude: result.longitude,
      country: result.country,
      admin1: result.admin1,
      timezone: result.timezone
    }));
  } catch (error) {
    console.error("Failed to search location:", error);
    return [];
  }
};

// Reverse geocoding: Get location name from coordinates
export const reverseGeocode = async (latitude: number, longitude: number): Promise<string | null> => {
  try {
    // Use a simple reverse geocoding approach
    const results = await searchLocation(`${latitude.toFixed(2)},${longitude.toFixed(2)}`);

    if (results.length > 0) {
      const closest = results[0];
      return `${closest.name}, ${closest.country}`;
    }

    return null;
  } catch (error) {
    console.error("Reverse geocoding failed:", error);
    return null;
  }
};

// Get weather icon based on weather code
export const getWeatherIcon = (code: number): string => {
  const weatherInfo = WMO_WEATHER_CODES[code];
  return weatherInfo?.icon || 'cloud';
};

// Get weather gradient based on weather code
export const getWeatherGradient = (code: number): string => {
  const weatherInfo = WMO_WEATHER_CODES[code];
  return weatherInfo?.gradient || 'from-slate-400 to-slate-500';
};

// Calculate UV index description
export const getUVIndexDescription = (uvIndex: number): { level: string; color: string; advice: string } => {
  if (uvIndex <= 2) {
    return { level: 'Low', color: 'text-green-500', advice: 'No protection needed' };
  } else if (uvIndex <= 5) {
    return { level: 'Moderate', color: 'text-yellow-500', advice: 'Some protection advised' };
  } else if (uvIndex <= 7) {
    return { level: 'High', color: 'text-orange-500', advice: 'Protection essential' };
  } else if (uvIndex <= 10) {
    return { level: 'Very High', color: 'text-red-500', advice: 'Extra protection needed' };
  } else {
    return { level: 'Extreme', color: 'text-purple-500', advice: 'Avoid sun exposure' };
  }
};

// Format temperature with unit
export const formatTemperature = (temp: number, unit: 'C' | 'F' = 'C'): string => {
  if (unit === 'F') {
    return `${Math.round((temp * 9 / 5) + 32)}°F`;
  }
  return `${Math.round(temp)}°C`;
};

// Get planting condition assessment
export const getPlantingConditions = (weather: WeatherData): {
  overall: 'excellent' | 'good' | 'fair' | 'poor';
  reasons: string[];
  recommendations: string[];
} => {
  const temp = weather.current.temperature_2m;
  const humidity = weather.current.relative_humidity_2m;
  const weatherCode = weather.current.weather_code;

  const reasons: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  // Temperature assessment
  if (temp < 5) {
    score -= 40;
    reasons.push('Temperature too cold for most planting');
    recommendations.push('Wait for warmer weather or focus on cold-hardy species');
  } else if (temp < 10) {
    score -= 20;
    reasons.push('Cool temperatures - limited planting options');
    recommendations.push('Consider cool-season plants');
  } else if (temp > 35) {
    score -= 30;
    reasons.push('High temperatures may stress new plants');
    recommendations.push('Plant early morning or evening, provide shade');
  } else if (temp >= 15 && temp <= 25) {
    reasons.push('Ideal temperature range for planting');
  }

  // Humidity assessment
  if (humidity < 30) {
    score -= 15;
    reasons.push('Low humidity - plants may need extra watering');
    recommendations.push('Mulch heavily and water frequently');
  } else if (humidity > 80) {
    score -= 10;
    reasons.push('High humidity - watch for fungal issues');
    recommendations.push('Ensure good air circulation');
  }

  // Weather condition assessment
  if (weatherCode >= 61 && weatherCode <= 67) {
    score -= 20;
    reasons.push('Rainy conditions - soil may be too wet');
    recommendations.push('Wait for soil to drain before planting');
  } else if (weatherCode >= 71 && weatherCode <= 77) {
    score -= 50;
    reasons.push('Snow conditions - not suitable for planting');
    recommendations.push('Plan for spring planting');
  } else if (weatherCode === 95 || weatherCode === 96 || weatherCode === 99) {
    score -= 40;
    reasons.push('Stormy conditions - postpone outdoor work');
    recommendations.push('Wait for calm weather');
  }

  let overall: 'excellent' | 'good' | 'fair' | 'poor';
  if (score >= 80) {
    overall = 'excellent';
  } else if (score >= 60) {
    overall = 'good';
  } else if (score >= 40) {
    overall = 'fair';
  } else {
    overall = 'poor';
  }

  return { overall, reasons, recommendations };
};