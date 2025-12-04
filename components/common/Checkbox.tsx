import React from 'react';
import { Tooltip } from './Tooltip';
import { CheckIcon } from '../../constants';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  tooltip?: string;
  labelIcon?: React.ReactNode;
  variant?: 'default' | 'card';
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  description,
  id,
  tooltip,
  labelIcon,
  variant = 'default',
  className = '',
  checked,
  ...props
}) => {
  const checkboxId = id || `checkbox-${label.toLowerCase().replace(/\s+/g, '-')}`;

  if (variant === 'card') {
    return (
      <label
        htmlFor={checkboxId}
        className={`
          relative flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer
          transition-all duration-200
          ${checked
            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 shadow-md shadow-emerald-500/10'
            : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700 bg-white dark:bg-slate-800'
          }
          ${className}
        `}
      >
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          className="sr-only"
          {...props}
        />
        <div
          className={`
            flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center
            transition-all duration-200
            ${checked
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'
            }
          `}
        >
          {checked && <CheckIcon className="w-4 h-4" />}
        </div>
        <div className="flex flex-col">
          <span className={`
            font-medium text-sm
            ${checked ? 'text-emerald-700 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}
          `}>
            {labelIcon && <span className="mr-2">{labelIcon}</span>}
            {label}
          </span>
          {description && (
            <span className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {description}
            </span>
          )}
        </div>
        {tooltip && <Tooltip text={tooltip} />}
      </label>
    );
  }

  return (
    <div className={`flex items-center py-1 ${className}`}>
      <div className="relative flex items-center">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          className="
            appearance-none w-5 h-5 border-2 rounded-md cursor-pointer
            border-slate-300 dark:border-slate-600
            bg-white dark:bg-slate-700
            checked:bg-emerald-500 checked:border-emerald-500
            focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500
            dark:focus:ring-offset-slate-900
            transition-all duration-200
          "
          {...props}
        />
        {checked && (
          <CheckIcon className="absolute left-0.5 top-0.5 w-4 h-4 text-white pointer-events-none" />
        )}
      </div>
      <label
        htmlFor={checkboxId}
        className="ml-3 flex items-center text-sm text-slate-700 dark:text-slate-300 cursor-pointer"
      >
        {labelIcon && (
          <span className="mr-2 h-5 w-5 text-emerald-500 dark:text-emerald-400">
            {labelIcon}
          </span>
        )}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
    </div>
  );
};

// Multi-select checkbox group
interface MultiCheckboxProps {
  label: string;
  options: string[];
  selectedOptions: string[];
  onChange: (selected: string[]) => void;
  tooltip?: string;
  labelIcon?: React.ReactNode;
  maxHeight?: string;
  variant?: 'default' | 'chip';
}

export const MultiCheckbox: React.FC<MultiCheckboxProps> = ({
  label,
  options,
  selectedOptions,
  onChange,
  tooltip,
  labelIcon,
  maxHeight = 'max-h-52',
  variant = 'default'
}) => {
  const handleCheckboxChange = (option: string) => {
    const newSelectedOptions = selectedOptions.includes(option)
      ? selectedOptions.filter(item => item !== option)
      : [...selectedOptions, option];
    onChange(newSelectedOptions);
  };

  if (variant === 'chip') {
    return (
      <div className="w-full">
        <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
          {labelIcon && (
            <span className="mr-2 h-5 w-5 text-emerald-500 dark:text-emerald-400">
              {labelIcon}
            </span>
          )}
          {label}
          {tooltip && <Tooltip text={tooltip} />}
        </label>
        <div className="flex flex-wrap gap-2">
          {options.map(option => {
            const isSelected = selectedOptions.includes(option);
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleCheckboxChange(option)}
                className={`
                  px-3 py-1.5 rounded-full text-sm font-medium
                  transition-all duration-200
                  ${isSelected
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-500/20'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                  }
                `}
              >
                {isSelected && <span className="mr-1">✓</span>}
                {option}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <label className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
        {labelIcon && (
          <span className="mr-2 h-5 w-5 text-emerald-500 dark:text-emerald-400">
            {labelIcon}
          </span>
        )}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <div
        className={`
          ${maxHeight} overflow-y-auto 
          border border-slate-200 dark:border-slate-700 
          p-3 rounded-xl 
          bg-white dark:bg-slate-800
          shadow-sm
        `}
      >
        <div className="space-y-2">
          {options.length > 0 ? options.map(option => {
            const isSelected = selectedOptions.includes(option);
            return (
              <label
                key={option}
                className={`
                  flex items-center gap-3 p-2 rounded-lg cursor-pointer
                  transition-colors duration-150
                  ${isSelected
                    ? 'bg-emerald-50 dark:bg-emerald-900/20'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'
                  }
                `}
              >
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleCheckboxChange(option)}
                    className="
                      appearance-none w-5 h-5 border-2 rounded-md cursor-pointer
                      border-slate-300 dark:border-slate-600
                      bg-white dark:bg-slate-700
                      checked:bg-emerald-500 checked:border-emerald-500
                      transition-all duration-200
                    "
                  />
                  {isSelected && (
                    <CheckIcon className="absolute left-0.5 top-0.5 w-4 h-4 text-white pointer-events-none" />
                  )}
                </div>
                <span className={`
                  text-sm
                  ${isSelected ? 'text-emerald-700 dark:text-emerald-300 font-medium' : 'text-slate-700 dark:text-slate-300'}
                `}>
                  {option}
                </span>
              </label>
            );
          }) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
              No options available.
            </p>
          )}
        </div>
      </div>
      {selectedOptions.length > 0 && (
        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
          {selectedOptions.length} selected
        </p>
      )}
    </div>
  );
};