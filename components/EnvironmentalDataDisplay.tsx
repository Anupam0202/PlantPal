
import React from 'react';
import type { WeatherData } from '../types';
import { SunIcon, WaterDropIcon, PlantPalIcon } from '../constants'; 

interface DataCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  cardClassName?: string;
  // Removed iconContainerClassName as it's no longer used
  textClassName?: string;
  valueTextClassName?: string; 
}

// Define the props type
interface EnvironmentalDataDisplayProps {
  data: WeatherData | null;
  locationName?: string;
}

const DataCard: React.FC<DataCardProps> = 
  ({ title, value, unit, icon, cardClassName = 'bg-white dark:bg-slate-700', textClassName='text-slate-500 dark:text-slate-400', valueTextClassName='text-emerald-600 dark:text-emerald-300' }) => (
    <div className={`p-4 rounded-lg shadow-md flex items-center space-x-3 transition-all duration-300 hover:shadow-lg ${cardClassName} border border-slate-200 dark:border-slate-600`}>
        {icon && <div className="text-emerald-500 dark:text-emerald-400">{icon}</div>} {/* Icon is directly colored */}
        <div>
            <p className={`text-xs font-medium ${textClassName}`}>{title}</p>
            <p className={`text-lg font-semibold ${valueTextClassName}`}>
                {value}
                {unit && <span className="ml-0.5 text-xs font-normal text-slate-500 dark:text-slate-400">{unit}</span>}
            </p>
        </div>
    </div>
);

// Custom Weather Icon component
const WeatherConditionIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15L8.63604 8.63604C9.26006 8.01199 10.2399 8.01199 10.864 8.63604L15.364 13.136M15.364 13.136L16.2221 14C17.2992 15.0771 19 14.5993 19 13.002L19 7C19 5.34315 17.6569 4 16 4H8C6.34315 4 5 5.34315 5 7V17C5 18.6569 6.34315 20 8 20H16C17.6569 20 19 18.6569 19 17V15.75M15.364 13.136L11 17.5M10.5 6H13.5" />
  </svg>
);


export const EnvironmentalDataDisplay: React.FC<EnvironmentalDataDisplayProps> = ({ data, locationName }) => {
  if (!data) {
    return <p className="text-center text-slate-500 dark:text-slate-400 py-4">Loading environmental data...</p>;
  }

  return (
    <div className="mb-6 p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/50 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
      <div className="flex items-center mb-3.5">
        <PlantPalIcon className="w-7 h-7 text-emerald-600 dark:text-emerald-400 mr-2.5" />
        <div>
            <h2 className="text-lg sm:text-xl font-semibold text-emerald-700 dark:text-emerald-300">Environmental Snapshot</h2>
            {locationName && <p className="text-xs text-slate-500 dark:text-slate-400">For: <span className="font-medium">{locationName}</span> (Lat: {data.latitude.toFixed(2)}, Lon: {data.longitude.toFixed(2)})</p>}
        </div>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <DataCard 
            title="Temperature" 
            value={data.current.temperature_2m} 
            unit="°C"
            icon={<SunIcon className="w-6 h-6" />}
            cardClassName="bg-white dark:bg-slate-700/60"
            valueTextClassName="text-emerald-600 dark:text-emerald-300"
        />
        <DataCard 
            title="Humidity" 
            value={data.current.relative_humidity_2m} 
            unit="%"
            icon={<WaterDropIcon className="w-6 h-6" />}
            cardClassName="bg-white dark:bg-slate-700/60"
            valueTextClassName="text-green-600 dark:text-green-300"
        />
        <DataCard 
            title="Weather" 
            value={data.current.weather_description || 'N/A'}
            icon={<WeatherConditionIcon />}
            cardClassName="bg-white dark:bg-slate-700/60"
            valueTextClassName="text-teal-600 dark:text-teal-300"
        />
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 mt-3 text-center">
        As of {new Date(data.current.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (Open-Meteo).
      </p>
    </div>
  );
};