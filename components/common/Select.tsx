import React from 'react';
import { Tooltip } from './Tooltip';
import { ChevronDownIcon } from '../../constants';

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  tooltip?: string;
  labelIcon?: React.ReactNode;
  placeholder?: string;
  error?: string | null;
}

export const Select: React.FC<SelectProps> = ({
  label,
  options,
  onChange,
  id,
  tooltip,
  labelIcon,
  placeholder,
  error,
  className = '',
  ...props
}) => {
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const hasError = !!error;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onChange(e.target.value);
  };

  return (
    <div className="w-full">
      {/* Label */}
      <label
        htmlFor={selectId}
        className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5"
      >
        {labelIcon && (
          <span className="mr-2 h-5 w-5 text-emerald-500 dark:text-emerald-400">
            {labelIcon}
          </span>
        )}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>

      {/* Select wrapper */}
      <div className="relative">
        <select
          id={selectId}
          onChange={handleChange}
          className={`
            block w-full rounded-xl border shadow-sm appearance-none cursor-pointer
            bg-white dark:bg-slate-800
            text-slate-900 dark:text-slate-100
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0
            pl-4 pr-10 py-2.5 text-sm
            ${hasError
              ? 'border-red-500 dark:border-red-400 focus:ring-red-500/20 focus:border-red-500'
              : 'border-slate-300 dark:border-slate-600 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-400'
            }
            ${className}
          `}
          {...props}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              className="bg-white dark:bg-slate-800"
            >
              {option.label}
            </option>
          ))}
        </select>

        {/* Custom dropdown arrow */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 dark:text-slate-500">
          <ChevronDownIcon className="w-5 h-5" />
        </div>
      </div>

      {/* Error message */}
      {hasError && (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
};