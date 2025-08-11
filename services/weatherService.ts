
import type { WeatherData } from '../types';
import { WMO_WEATHER_CODES } from '../types';

const API_BASE_URL = "https://api.open-meteo.com/v1/forecast";

export const fetchWeatherData = async (latitude: number, longitude: number): Promise<WeatherData> => {
  const params = new URLSearchParams({
    latitude: latitude.toString(),
    longitude: longitude.toString(),
    current: "temperature_2m,relative_humidity_2m,weather_code",
    timezone: "auto", // Automatically detect timezone
  });

  const url = `${API_BASE_URL}?${params.toString()}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Weather API error (${response.status}): ${errorData.reason || response.statusText}`);
    }
    const data = await response.json();

    // Map weather code to description
    if (data.current && typeof data.current.weather_code === 'number') {
        const weatherCodeInfo = WMO_WEATHER_CODES[data.current.weather_code];
        data.current.weather_description = weatherCodeInfo ? weatherCodeInfo.description : "Unknown weather condition";
    }


    return data as WeatherData; // Assume data structure matches WeatherData type
  } catch (error) {
    console.error("Failed to fetch weather data:", error);
    if (error instanceof Error) {
        throw new Error(`Failed to fetch weather data: ${error.message}`);
    }
    throw new Error("An unknown error occurred while fetching weather data.");
  }
};
