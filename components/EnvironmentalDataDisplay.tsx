import React, { useState } from 'react';
import type { WeatherData, EnvironmentalProfile } from '../types';
import { WMO_WEATHER_CODES } from '../types';
import { SunIcon, WaterDropIcon, CloudIcon, WindIcon, LocationIcon } from '../constants';
import { getPlantingConditions, getUVIndexDescription } from '../services/weatherService';

interface EnvironmentalDataDisplayProps {
  data: WeatherData | null;
  locationName?: string;
  envProfile?: EnvironmentalProfile | null;
}

interface WeatherCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  gradient?: string;
  iconBg?: string;
}

const WeatherCard: React.FC<WeatherCardProps> = ({
  icon,
  label,
  value,
  unit,
  subtext,
  gradient = 'from-emerald-500 to-teal-500',
  iconBg = 'bg-emerald-100 dark:bg-emerald-900/50'
}) => (
  <div className="relative group">
    <div className="absolute inset-0 bg-gradient-to-r opacity-0 group-hover:opacity-10 rounded-xl transition-opacity duration-300" style={{ backgroundImage: `linear-gradient(to right, var(--tw-gradient-stops))` }} />
    <div className="relative p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-lg transition-all duration-300">
      <div className="flex items-center space-x-3">
        <div className={`w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}>
          <span className="text-emerald-600 dark:text-emerald-400">{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {label}
          </p>
          <div className="flex items-baseline">
            <span className={`text-2xl font-bold bg-gradient-to-r ${gradient} bg-clip-text text-transparent`}>
              {value}
            </span>
            {unit && (
              <span className="ml-1 text-sm text-slate-500 dark:text-slate-400">{unit}</span>
            )}
          </div>
          {subtext && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{subtext}</p>
          )}
        </div>
      </div>
    </div>
  </div>
);

const WeatherIcon: React.FC<{ code: number; className?: string }> = ({ code, className = "w-8 h-8" }) => {
  const iconName = WMO_WEATHER_CODES[code]?.icon || 'cloud';

  const icons: Record<string, React.ReactNode> = {
    'sun': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="12" cy="12" r="5" />
        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    'sun-cloud': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="14" cy="8" r="3.5" opacity="0.6" />
        <path d="M14 3v1.5M8.5 5l1 1M19.5 5l-1 1M21 10h-1.5M6 10h1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4" />
        <path d="M17 18H7a4 4 0 01-.86-7.91A6 6 0 0117 13a3 3 0 010 5z" />
      </svg>
    ),
    'cloud-sun': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2v2M4.93 4.93l1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M20 12h2M18.66 5.34l1.41-1.41" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.5" />
        <circle cx="12" cy="10" r="4" opacity="0.5" />
        <path d="M18 18H6a4 4 0 01-.86-7.91A7 7 0 0118 14a3 3 0 010 4z" />
      </svg>
    ),
    'cloud': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 18H6a4 4 0 01-.86-7.91A7 7 0 0118 14a3 3 0 010 4z" />
      </svg>
    ),
    'drizzle': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 14H6a4 4 0 01-.86-7.91A7 7 0 0118 10a3 3 0 010 4z" />
        <path d="M8 18v1M12 18v1M16 18v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.6" />
      </svg>
    ),
    'rain': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 14H6a4 4 0 01-.86-7.91A7 7 0 0118 10a3 3 0 010 4z" />
        <path d="M8 18v2M12 18v2M16 18v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    'rain-heavy': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 12H6a4 4 0 01-.86-7.91A7 7 0 0118 8a3 3 0 010 4z" />
        <path d="M7 16v3M10 15v4M13 16v3M16 15v4M19 16v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    'rain-sun': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="16" cy="6" r="2.5" opacity="0.4" />
        <path d="M18 14H6a4 4 0 01-.86-7.91A7 7 0 0118 10a3 3 0 010 4z" />
        <path d="M8 18v2M12 18v2M16 18v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    'snow': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 14H6a4 4 0 01-.86-7.91A7 7 0 0118 10a3 3 0 010 4z" />
        <circle cx="8" cy="18" r="1" opacity="0.7" />
        <circle cx="12" cy="20" r="1" opacity="0.7" />
        <circle cx="16" cy="18" r="1" opacity="0.7" />
      </svg>
    ),
    'snow-heavy': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 12H6a4 4 0 01-.86-7.91A7 7 0 0118 8a3 3 0 010 4z" />
        <circle cx="7" cy="16" r="1" /><circle cx="11" cy="15" r="1" /><circle cx="15" cy="16" r="1" />
        <circle cx="9" cy="19" r="1" /><circle cx="13" cy="19" r="1" /><circle cx="17" cy="18" r="1" />
      </svg>
    ),
    'snow-sun': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <circle cx="16" cy="6" r="2.5" opacity="0.4" />
        <path d="M18 14H6a4 4 0 01-.86-7.91A7 7 0 0118 10a3 3 0 010 4z" />
        <circle cx="8" cy="18" r="1" opacity="0.7" />
        <circle cx="12" cy="20" r="1" opacity="0.7" />
        <circle cx="16" cy="18" r="1" opacity="0.7" />
      </svg>
    ),
    'snow-rain': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 12H6a4 4 0 01-.86-7.91A7 7 0 0118 8a3 3 0 010 4z" />
        <path d="M8 16v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="18" r="1" opacity="0.7" />
        <path d="M16 16v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    'storm': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 12H6a4 4 0 01-.86-7.91A7 7 0 0118 8a3 3 0 010 4z" />
        <path d="M13 12l-2 5h3l-2 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
    'storm-hail': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 10H6a4 4 0 01-.86-7.91A7 7 0 0118 6a3 3 0 010 4z" />
        <path d="M13 10l-2 4h3l-1.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="8" cy="20" r="1" /><circle cx="16" cy="19" r="1" />
      </svg>
    ),
    'cloud-rain': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 14H6a4 4 0 01-.86-7.91A7 7 0 0118 10a3 3 0 010 4z" />
        <path d="M8 19v2M12 19v2M16 19v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    'cloud-lightning': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 12H6a4 4 0 01-.86-7.91A7 7 0 0118 8a3 3 0 010 4z" />
        <path d="M13 12l-2 5h3l-2 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    ),
    'fog': (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 10h16M4 14h16M6 18h12" strokeLinecap="round" />
      </svg>
    ),
    'snowflake': (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" strokeLinecap="round" />
      </svg>
    ),
  };

  return <>{icons[iconName] || icons['cloud']}</>;
};

export const EnvironmentalDataDisplay: React.FC<EnvironmentalDataDisplayProps> = ({ data, locationName, envProfile }) => {
  const [showEnvDetails, setShowEnvDetails] = useState(false);

  if (!data) {
    return (
      <div className="animate-pulse p-6 bg-slate-100 dark:bg-slate-800 rounded-2xl">
        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-slate-200 dark:bg-slate-700 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const weatherInfo = WMO_WEATHER_CODES[data.current.weather_code];
  const plantingConditions = getPlantingConditions(data);
  const uvInfo = data.current.uv_index !== undefined
    ? getUVIndexDescription(data.current.uv_index)
    : null;

  const conditionColors = {
    excellent: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700' },
    good: { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', border: 'border-teal-300 dark:border-teal-700' },
    fair: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700' },
    poor: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-700' },
  };

  const colors = conditionColors[plantingConditions.overall];

  const getAqiColor = (aqi: number) => {
    if (aqi <= 50) return { text: 'text-green-600', bg: 'bg-green-100 dark:bg-green-900/30', label: 'Good' };
    if (aqi <= 100) return { text: 'text-yellow-600', bg: 'bg-yellow-100 dark:bg-yellow-900/30', label: 'Moderate' };
    if (aqi <= 150) return { text: 'text-orange-600', bg: 'bg-orange-100 dark:bg-orange-900/30', label: 'Unhealthy (Sensitive)' };
    if (aqi <= 200) return { text: 'text-red-600', bg: 'bg-red-100 dark:bg-red-900/30', label: 'Unhealthy' };
    return { text: 'text-purple-600', bg: 'bg-purple-100 dark:bg-purple-900/30', label: 'Very Unhealthy' };
  };

  const ep = envProfile;

  return (
    <div className="space-y-6">
      {/* Main weather display */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 p-6 text-white shadow-xl">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M 10 0 L 0 0 0 10" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
            <rect width="100" height="100" fill="url(#grid)" />
          </svg>
        </div>

        <div className="relative z-10">
          {/* Location header */}
          <div className="flex items-center mb-4">
            <LocationIcon className="w-5 h-5 mr-2 opacity-80" />
            <div>
              <h2 className="text-lg font-semibold">
                {locationName || 'Your Location'}
              </h2>
              <p className="text-sm opacity-80">
                {data.latitude.toFixed(4)}°, {data.longitude.toFixed(4)}°
                {ep?.elevation ? ` • ${ep.elevation.elevation}m elevation` : ''}
                {ep?.usdaZone ? ` • Zone ${ep.usdaZone}` : ''}
              </p>
            </div>
          </div>

          {/* Main weather info */}
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-end">
                <span className="text-6xl font-bold tracking-tight">
                  {Math.round(data.current.temperature_2m)}
                </span>
                <span className="text-3xl font-light mb-2">°C</span>
              </div>
              <p className="text-lg font-medium opacity-90">
                {weatherInfo?.description || 'Unknown'}
              </p>
            </div>
            <div className="text-white/90">
              <WeatherIcon code={data.current.weather_code} className="w-20 h-20" />
            </div>
          </div>

          {/* Quick env badges */}
          <div className="mt-4 flex flex-wrap gap-2">
            {ep?.sunMoon && (
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-medium">
                ☀️ {ep.sunMoon.dayLength}h daylight
              </span>
            )}
            {ep?.sunMoon && (
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-medium">
                🌙 {ep.sunMoon.moonPhase}
              </span>
            )}
            {ep?.airQuality && (
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-medium">
                💨 AQI {ep.airQuality.aqi}
              </span>
            )}
            {ep?.koppenClass && (
              <span className="px-2 py-1 bg-white/20 rounded-full text-xs font-medium">
                🌍 {ep.koppenClass}
              </span>
            )}
          </div>

          {/* Time + sources */}
          <p className="mt-3 text-sm opacity-70">
            Updated: {new Date(data.current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {ep?.dataSources && ep.dataSources.length > 0 && (
              <> • {ep.dataSources.length} data sources active</>
            )}
          </p>
        </div>
      </div>

      {/* Weather metrics grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <WeatherCard
          icon={<WaterDropIcon className="w-6 h-6" />}
          label="Humidity"
          value={data.current.relative_humidity_2m}
          unit="%"
          subtext={data.current.relative_humidity_2m > 70 ? 'High' : data.current.relative_humidity_2m < 30 ? 'Low' : 'Normal'}
          gradient="from-blue-500 to-cyan-500"
          iconBg="bg-blue-100 dark:bg-blue-900/50"
        />

        {data.current.wind_speed_10m !== undefined && (
          <WeatherCard
            icon={<WindIcon className="w-6 h-6" />}
            label="Wind"
            value={Math.round(data.current.wind_speed_10m)}
            unit="km/h"
            subtext={data.current.wind_speed_10m > 30 ? 'Strong' : data.current.wind_speed_10m > 15 ? 'Moderate' : 'Light'}
            gradient="from-slate-500 to-slate-600"
            iconBg="bg-slate-100 dark:bg-slate-700"
          />
        )}

        {data.current.cloud_cover !== undefined && (
          <WeatherCard
            icon={<CloudIcon className="w-6 h-6" />}
            label="Cloud Cover"
            value={data.current.cloud_cover}
            unit="%"
            subtext={data.current.cloud_cover > 70 ? 'Overcast' : data.current.cloud_cover > 30 ? 'Partial' : 'Clear'}
            gradient="from-indigo-500 to-purple-500"
            iconBg="bg-indigo-100 dark:bg-indigo-900/50"
          />
        )}

        {uvInfo && (
          <WeatherCard
            icon={<SunIcon className="w-6 h-6" />}
            label="UV Index"
            value={data.current.uv_index?.toFixed(1) || 'N/A'}
            subtext={uvInfo.level}
            gradient="from-amber-500 to-orange-500"
            iconBg="bg-amber-100 dark:bg-amber-900/50"
          />
        )}
      </div>

      {/* Environmental Intelligence Section */}
      {ep && (ep.airQuality || ep.soilGrids || ep.historicalClimate || ep.biodiversity) && (
        <div className="space-y-4">
          <button
            onClick={() => setShowEnvDetails(!showEnvDetails)}
            className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 rounded-xl border border-violet-200 dark:border-violet-800 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🌐</span>
              <div className="text-left">
                <h3 className="font-semibold text-violet-800 dark:text-violet-300">Environmental Intelligence</h3>
                <p className="text-xs text-violet-600 dark:text-violet-400">
                  Real-time data from {ep.dataSources.length} sources • Air, Soil, Climate, Biodiversity
                </p>
              </div>
            </div>
            <span className={`text-violet-600 dark:text-violet-400 transition-transform ${showEnvDetails ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </button>

          {showEnvDetails && (
            <div className="space-y-4 animate-in slide-in-from-top-2">
              {/* Air Quality */}
              {ep.airQuality && (
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                      💨 Air Quality
                    </h4>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${getAqiColor(ep.airQuality.aqi).bg} ${getAqiColor(ep.airQuality.aqi).text}`}>
                      AQI {ep.airQuality.aqi} — {getAqiColor(ep.airQuality.aqi).label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                    {[{ label: 'PM2.5', val: ep.airQuality.pm25, unit: 'µg/m³' },
                      { label: 'PM10', val: ep.airQuality.pm10, unit: 'µg/m³' },
                      { label: 'Ozone', val: ep.airQuality.ozone, unit: 'µg/m³' },
                      { label: 'NO₂', val: ep.airQuality.no2, unit: 'µg/m³' },
                      { label: 'SO₂', val: ep.airQuality.so2, unit: 'µg/m³' },
                      { label: 'CO', val: ep.airQuality.co, unit: 'µg/m³' },
                    ].map(p => (
                      <div key={p.label} className="text-center p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{p.label}</p>
                        <p className="font-bold text-sm text-slate-800 dark:text-slate-200">{p.val?.toFixed(1) ?? '—'}</p>
                        <p className="text-[10px] text-slate-400">{p.unit}</p>
                      </div>
                    ))}
                  </div>

                  {/* Pollen Data */}
                  {ep.airQuality.pollen && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-2 border-t border-slate-100 dark:border-slate-700 pt-2">🌸 Pollen Forecast (grains/m³)</p>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {Object.entries(ep.airQuality.pollen).map(([type, val]) => (
                          <div key={type} className={`text-center p-1.5 rounded-md ${val > 50 ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300' : val > 10 ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'}`}>
                            <p className="text-[10px] font-medium capitalize">{type}</p>
                            <p className="text-xs font-bold">{val.toFixed(0)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 text-right">Source: Open-Meteo Air Quality API</p>
                </div>
              )}

              {/* Soil & Terrain */}
              {(ep.soilGrids || ep.soilConditions || ep.elevation) && (
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h4 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
                    🧪 Soil & Terrain
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {ep.soilGrids && (
                      <>
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Soil Type</p>
                          <p className="font-bold text-sm text-amber-800 dark:text-amber-200">{ep.soilGrids.soilClass}</p>
                        </div>
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Soil pH</p>
                          <p className="font-bold text-sm text-amber-800 dark:text-amber-200">{ep.soilGrids.ph.toFixed(1)}</p>
                          <p className="text-[10px] text-amber-500">{ep.soilGrids.ph < 6 ? 'Acidic' : ep.soilGrids.ph > 7.5 ? 'Alkaline' : 'Neutral'}</p>
                        </div>
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Texture</p>
                          <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200">
                            Sand {ep.soilGrids.sand.toFixed(0)}% | Clay {ep.soilGrids.clay.toFixed(0)}% | Silt {ep.soilGrids.silt.toFixed(0)}%
                          </p>
                        </div>
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Organic Carbon</p>
                          <p className="font-bold text-sm text-amber-800 dark:text-amber-200">{ep.soilGrids.organicCarbon.toFixed(1)} g/kg</p>
                        </div>
                      </>
                    )}
                    {ep.soilConditions && (
                      <>
                        <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Soil Temp (0-7cm)</p>
                          <p className="font-bold text-sm text-orange-800 dark:text-orange-200">{ep.soilConditions.temperature0to7cm.toFixed(1)}°C</p>
                        </div>
                        <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Soil Moisture</p>
                          <p className="font-bold text-sm text-orange-800 dark:text-orange-200">{(ep.soilConditions.moisture0to7cm * 100).toFixed(0)}%</p>
                        </div>
                        <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                          <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Evapotranspiration</p>
                          <p className="font-bold text-sm text-orange-800 dark:text-orange-200">{ep.soilConditions.evapotranspiration.toFixed(1)} mm/day</p>
                        </div>
                      </>
                    )}
                    {ep.elevation && (
                      <div className="p-3 bg-stone-50 dark:bg-stone-900/20 rounded-lg">
                        <p className="text-xs text-stone-600 dark:text-stone-400 font-medium">Elevation</p>
                        <p className="font-bold text-sm text-stone-800 dark:text-stone-200">{ep.elevation.elevation}m</p>
                        <p className="text-[10px] text-stone-500">above sea level</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 text-right">
                    Sources: {[ep.soilGrids ? 'ISRIC SoilGrids' : '', ep.soilConditions ? 'Open-Meteo' : '', ep.elevation ? 'Open-Elevation' : ''].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}

              {/* Climate Intelligence */}
              {(ep.historicalClimate || ep.sunMoon || ep.usdaZone) && (
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h4 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
                    📈 Climate Intelligence
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {ep.usdaZone && (
                      <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">USDA Zone</p>
                        <p className="font-bold text-lg text-emerald-800 dark:text-emerald-200">{ep.usdaZone}</p>
                      </div>
                    )}
                    {ep.historicalClimate && (
                      <>
                        <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                          <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">Avg Annual Temp</p>
                          <p className="font-bold text-sm text-sky-800 dark:text-sky-200">{ep.historicalClimate.avgAnnualTempC}°C</p>
                          <p className="text-[10px] text-sky-500">
                            30yr trend: {ep.historicalClimate.tempTrend30yr > 0 ? '+' : ''}{ep.historicalClimate.tempTrend30yr}°C
                          </p>
                        </div>
                        <div className="p-3 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                          <p className="text-xs text-sky-600 dark:text-sky-400 font-medium">Avg Annual Rain</p>
                          <p className="font-bold text-sm text-sky-800 dark:text-sky-200">{ep.historicalClimate.avgAnnualRainMm} mm</p>
                        </div>
                        <div className="p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg">
                          <p className="text-xs text-teal-600 dark:text-teal-400 font-medium">Growing Season</p>
                          <p className="font-bold text-sm text-teal-800 dark:text-teal-200">
                            ~{ep.historicalClimate.frostDates.growingSeasonDays} days
                          </p>
                          <p className="text-[10px] text-teal-500">
                            {ep.historicalClimate.frostDates.lastSpringFrost} → {ep.historicalClimate.frostDates.firstFallFrost}
                          </p>
                        </div>
                      </>
                    )}
                    {ep.sunMoon && (
                      <>
                        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">Daylight Today</p>
                          <p className="font-bold text-sm text-yellow-800 dark:text-yellow-200">{ep.sunMoon.dayLength} hours</p>
                          <p className="text-[10px] text-yellow-500">
                            🌅 {ep.sunMoon.sunrise} → {ep.sunMoon.sunset}
                          </p>
                        </div>
                        <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg">
                          <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">Moon Phase</p>
                          <p className="font-bold text-sm text-indigo-800 dark:text-indigo-200">{ep.sunMoon.moonPhase}</p>
                          <p className="text-[10px] text-indigo-500">{ep.sunMoon.moonIllumination}% illumination</p>
                        </div>
                      </>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 text-right">Sources: Open-Meteo Historical Archive, Sunrise-Sunset API</p>
                </div>
              )}

              {/* Biodiversity */}
              {ep.biodiversity && ep.biodiversity.totalPlantSpecies > 0 && (
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                  <h4 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2 mb-3">
                    🦋 Local Biodiversity
                  </h4>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Plant Species (10km)</p>
                      <p className="font-bold text-lg text-green-800 dark:text-green-200">{ep.biodiversity.totalPlantSpecies}</p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Total Observations</p>
                      <p className="font-bold text-lg text-green-800 dark:text-green-200">{ep.biodiversity.recentObservations.toLocaleString()}</p>
                    </div>
                  </div>
                  {ep.biodiversity.keyNativePlants.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Native Species Observed Nearby:</p>
                      <div className="flex flex-wrap gap-1">
                        {ep.biodiversity.keyNativePlants.slice(0, 12).map((sp, i) => (
                          <span key={i} className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-[11px] italic">
                            {sp}
                          </span>
                        ))}
                        {ep.biodiversity.keyNativePlants.length > 12 && (
                          <span className="px-2 py-0.5 text-slate-500 text-[11px]">+{ep.biodiversity.keyNativePlants.length - 12} more</span>
                        )}
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-2 text-right">Source: GBIF Global Biodiversity</p>
                </div>
              )}

              {/* Data Sources Footer */}
              {ep.dataSources.length > 0 && (
                <div className="flex flex-wrap gap-2 px-2">
                  {ep.dataSources.map((src, i) => (
                    <span key={i} className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full text-[10px]">
                      ✓ {src}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Planting conditions assessment */}
      <div className={`p-5 rounded-xl border-2 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className={`font-semibold ${colors.text}`}>
              Planting Conditions
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Based on current weather{ep?.airQuality ? ' & air quality' : ''}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-sm font-bold ${colors.bg} ${colors.text} capitalize`}>
            {plantingConditions.overall}
          </span>
        </div>

        {plantingConditions.reasons.length > 0 && (
          <div className="space-y-2">
            {plantingConditions.reasons.map((reason, index) => (
              <div key={index} className="flex items-start text-sm">
                <span className={`mr-2 mt-0.5 ${colors.text}`}>•</span>
                <span className="text-slate-700 dark:text-slate-300">{reason}</span>
              </div>
            ))}
          </div>
        )}

        {plantingConditions.recommendations.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-2">
              Recommendations
            </p>
            {plantingConditions.recommendations.map((rec, index) => (
              <p key={index} className="text-sm text-slate-600 dark:text-slate-400 flex items-start">
                <span className="mr-2">💡</span>
                {rec}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};