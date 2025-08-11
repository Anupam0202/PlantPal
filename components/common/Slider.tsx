
import React from 'react';
import { Tooltip } from './Tooltip';

interface SliderProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  tooltip?: string;
  labelIcon?: React.ReactNode;
}

export const Slider: React.FC<SliderProps> = ({ label, min, max, step, value, unit, id, tooltip, labelIcon, ...props }) => {
  const sliderId = id || `slider-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="w-full">
      <label htmlFor={sliderId} className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {labelIcon && <span className="mr-2 h-5 w-5 text-slate-500 dark:text-slate-400">{labelIcon}</span>}
        {label}: <span className="ml-2 font-bold text-emerald-600 dark:text-emerald-400">{value}{unit}</span>
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className="relative pt-1">
        <input
          type="range"
          id={sliderId}
          min={min}
          max={max}
          step={step}
          value={value}
          className="w-full h-3 bg-slate-200 dark:bg-slate-600 rounded-lg appearance-none cursor-pointer accent-emerald-600 dark:accent-emerald-500 focus:outline-none focus:ring-2 focus:ring-offset-1 dark:focus:ring-offset-slate-800 focus:ring-emerald-500 dark:focus:ring-emerald-400"
          {...props}
        />
        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mt-1.5">
          <span>{min}{unit}</span>
          <span>{max}{unit}</span>
        </div>
      </div>
    </div>
  );
};
