import React from 'react';
import type { WeatherData } from '../types';
import { WMO_WEATHER_CODES } from '../types';
import { SunIcon, WaterDropIcon, CloudIcon, WindIcon, LocationIcon } from '../constants';
import { getPlantingConditions, getUVIndexDescription } from '../services/weatherService';

interface EnvironmentalDataDisplayProps {
  data: WeatherData | null;
  locationName?: string;
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
    'cloud-rain': (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M18 14H6a4 4 0 01-.86-7.91A7 7 0 0118 10a3 3 0 010 4z" />
        <path d="M8 19v2M12 19v2M16 19v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>
    ),
    'snowflake': (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" strokeLinecap="round" />
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
  };

  return <>{icons[iconName] || icons['cloud']}</>;
};

export const EnvironmentalDataDisplay: React.FC<EnvironmentalDataDisplayProps> = ({ data, locationName }) => {
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

          {/* Time */}
          <p className="mt-4 text-sm opacity-70">
            Updated: {new Date(data.current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

      {/* Planting conditions assessment */}
      <div className={`p-5 rounded-xl border-2 ${colors.bg} ${colors.border}`}>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className={`font-semibold ${colors.text}`}>
              Planting Conditions
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Based on current weather
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