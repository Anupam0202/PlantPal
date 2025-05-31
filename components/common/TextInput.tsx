
import React from 'react';
import { Tooltip } from './Tooltip';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  tooltip?: string;
  labelIcon?: React.ReactNode;
  error?: string | null;
}

export const TextInput: React.FC<TextInputProps> = ({ label, id, tooltip, labelIcon, error, ...props }) => {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const hasError = !!error;

  return (
    <div className="w-full">
      <label htmlFor={inputId} className="flex items-center text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
         {labelIcon && <span className="mr-2 h-5 w-5 text-slate-500 dark:text-slate-400">{labelIcon}</span>}
        {label}
        {tooltip && <Tooltip text={tooltip} />}
      </label>
      <input
        id={inputId}
        type={props.type || "text"}
        className={`mt-1 block w-full px-3.5 py-2.5 border 
                    ${hasError 
                        ? 'border-red-500 dark:border-red-400 focus:ring-red-500 dark:focus:ring-red-400 focus:border-red-500 dark:focus:border-red-400' 
                        : 'border-slate-300 dark:border-slate-600 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-emerald-500 dark:focus:ring-emerald-400'} 
                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 
                    rounded-md shadow-sm focus:outline-none focus:ring-2 sm:text-sm transition-colors duration-150`}
        aria-invalid={hasError ? "true" : "false"}
        aria-describedby={hasError ? `${inputId}-error` : undefined}
        {...props}
      />
      {hasError && <p id={`${inputId}-error`} className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
};
