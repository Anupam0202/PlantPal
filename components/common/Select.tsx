
import React from 'react';
import { Tooltip } from './Tooltip';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  options: { value: string; label: string }[];
  tooltip?: string;
  labelIcon?: React.ReactNode;
  placeholder?: string; 
}

export const Select: React.FC<SelectProps> = ({ label, options, id, tooltip, labelIcon, ...props }) => {
  const selectId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="w-full">
      <label htmlFor={selectId} className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
        {labelIcon && <span className="mr-2 h-5 w-5 text-slate-500 dark:text-slate-400">{labelIcon}</span>}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className="relative">
        <select
          id={selectId}
          className="mt-1 block w-full pl-3 pr-10 py-2.5 text-base border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-emerald-500 dark:focus:border-emerald-400 sm:text-sm rounded-md shadow-sm appearance-none"
          {...props}
        >
          {props.placeholder && <option value="" disabled hidden>{props.placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value} className="dark:bg-slate-700">
              {option.label}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-700 dark:text-slate-400">
          <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
    </div>
  );
};
