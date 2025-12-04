import React from 'react';
import { Tooltip } from './Tooltip';

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  tooltip?: string;
  labelIcon?: React.ReactNode;
  showMarks?: boolean;
  marks?: { value: number; label: string }[];
  variant?: string;
}

export const Slider: React.FC<SliderProps> = ({
  label,
  min,
  max,
  step,
  value,
  onChange,
  unit = '',
  id,
  tooltip,
  labelIcon,
  showMarks = true,
  marks,
  variant,
  ...props
}) => {
  const sliderId = id || `slider-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const percentage = ((value - min) / (max - min)) * 100;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(Number(e.target.value));
  };

  // Generate default marks if not provided
  const defaultMarks = [
    { value: min, label: `${min}${unit}` },
    { value: max, label: `${max}${unit}` },
  ];
  const displayMarks = marks || defaultMarks;

  return (
    <div className="w-full">
      {/* Label with value display */}
      <label
        htmlFor={sliderId}
        className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-300 mb-3"
      >
        <span className="flex items-center">
          {labelIcon && (
            <span className="mr-2 h-5 w-5 text-emerald-500 dark:text-emerald-400">
              {labelIcon}
            </span>
          )}
          {label}
          {tooltip && <Tooltip text={tooltip} />}
        </span>

        {/* Value badge */}
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm">
          {value}{unit}
        </span>
      </label>

      {/* Slider container */}
      <div className="relative pt-1 pb-6">
        {/* Track background */}
        <div className="absolute top-3 left-0 right-0 h-2 bg-slate-200 dark:bg-slate-700 rounded-full" />

        {/* Active track */}
        <div
          className="absolute top-3 left-0 h-2 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-150 ease-out"
          style={{ width: `${percentage}%` }}
        />

        {/* Input */}
        <input
          type="range"
          id={sliderId}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="relative w-full h-2 appearance-none bg-transparent cursor-pointer z-10
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-5
            [&::-webkit-slider-thumb]:h-5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-3
            [&::-webkit-slider-thumb]:border-emerald-500
            [&::-webkit-slider-thumb]:shadow-lg
            [&::-webkit-slider-thumb]:shadow-emerald-500/30
            [&::-webkit-slider-thumb]:cursor-pointer
            [&::-webkit-slider-thumb]:transition-all
            [&::-webkit-slider-thumb]:duration-150
            hover:[&::-webkit-slider-thumb]:scale-110
            hover:[&::-webkit-slider-thumb]:shadow-emerald-500/50
            focus:[&::-webkit-slider-thumb]:ring-4
            focus:[&::-webkit-slider-thumb]:ring-emerald-500/20
            [&::-moz-range-thumb]:w-5
            [&::-moz-range-thumb]:h-5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border-3
            [&::-moz-range-thumb]:border-emerald-500
            [&::-moz-range-thumb]:shadow-lg
            [&::-moz-range-thumb]:cursor-pointer
          "
          {...props}
        />

        {/* Marks */}
        {showMarks && (
          <div className="absolute left-0 right-0 top-7 flex justify-between">
            {displayMarks.map((mark, index) => {
              const markPosition = ((mark.value - min) / (max - min)) * 100;
              const isActive = value >= mark.value;

              return (
                <span
                  key={index}
                  className={`
                    text-xs transition-colors duration-150
                    ${isActive ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-slate-400 dark:text-slate-500'}
                  `}
                  style={{
                    position: index === 0 ? 'relative' : index === displayMarks.length - 1 ? 'relative' : 'absolute',
                    left: index === 0 ? 0 : index === displayMarks.length - 1 ? 'auto' : `${markPosition}%`,
                    right: index === displayMarks.length - 1 ? 0 : 'auto',
                    transform: index !== 0 && index !== displayMarks.length - 1 ? 'translateX(-50%)' : 'none',
                  }}
                >
                  {mark.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};