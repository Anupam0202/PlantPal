
import React from 'react';
import { Tooltip } from './Tooltip';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  tooltip?: string;
  labelIcon?: React.ReactNode;
}

export const Checkbox: React.FC<CheckboxProps> = ({ label, id, tooltip, labelIcon, ...props }) => {
  const checkboxId = id || `checkbox-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className="flex items-center py-1">
      <input
        id={checkboxId}
        type="checkbox"
        className="h-4 w-4 text-emerald-600 border-slate-300 dark:border-slate-500 rounded focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-slate-700 dark:checked:bg-emerald-500 dark:checked:border-emerald-500 shadow-sm cursor-pointer"
        {...props}
      />
      <label htmlFor={checkboxId} className="ml-2.5 flex items-center text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
        {labelIcon && <span className="mr-1.5 h-5 w-5 text-slate-500 dark:text-slate-400">{labelIcon}</span>}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
    </div>
  );
};


interface MultiCheckboxProps {
  label: string;
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
  tooltip?: string;
  labelIcon?: React.ReactNode;
  maxHeight?: string; // e.g., 'max-h-48'
}

export const MultiCheckbox: React.FC<MultiCheckboxProps> = ({ label, options, selectedOptions, onChange, tooltip, labelIcon, maxHeight = 'max-h-48' }) => {
  const handleCheckboxChange = (option: string) => {
    const newSelectedOptions = selectedOptions.includes(option)
      ? selectedOptions.filter(item => item !== option)
      : [...selectedOptions, option];
    onChange(newSelectedOptions);
  };

  return (
    <div className="w-full">
      <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        {labelIcon && <span className="mr-2 h-5 w-5 text-slate-500 dark:text-slate-400">{labelIcon}</span>}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div className={`space-y-2 ${maxHeight} overflow-y-auto border border-slate-300 dark:border-slate-600 p-3.5 rounded-md bg-white dark:bg-slate-700 shadow-sm`}>
        {options.length > 0 ? options.map(option => (
          <div key={option} className="flex items-center">
            <input
              id={`multicheck-${option.toLowerCase().replace(/\s+/g, '-')}`}
              type="checkbox"
              checked={selectedOptions.includes(option)}
              onChange={() => handleCheckboxChange(option)}
              className="h-4 w-4 text-emerald-600 border-slate-300 dark:border-slate-500 rounded focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 bg-white dark:bg-slate-600 dark:checked:bg-emerald-500 dark:checked:border-emerald-500 cursor-pointer"
            />
            <label htmlFor={`multicheck-${option.toLowerCase().replace(/\s+/g, '-')}`} className="ml-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
              {option}
            </label>
          </div>
        )) : (
          <p className="text-xs text-slate-500 dark:text-slate-400">No options available.</p>
        )}
      </div>
    </div>
  );
};
