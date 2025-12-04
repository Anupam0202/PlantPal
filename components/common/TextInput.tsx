import React from 'react';
import { Tooltip } from './Tooltip';
import { ClearIcon } from '../../constants';

interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  tooltip?: string;
  labelIcon?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  error?: string | null;
  helperText?: string;
  clearable?: boolean;
  onClear?: () => void;
}

export const TextInput: React.FC<TextInputProps> = ({
  label,
  id,
  tooltip,
  labelIcon,
  leftIcon,
  rightIcon,
  error,
  helperText,
  clearable = false,
  onClear,
  className = '',
  value,
  ...props
}) => {
  const inputId = id || `input-${label.toLowerCase().replace(/\s+/g, '-')}`;
  const hasError = !!error;
  const hasValue = value !== undefined && value !== '';

  return (
    <div className="w-full">
      {/* Label */}
      <label
        htmlFor={inputId}
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

      {/* Input wrapper */}
      <div className="relative">
        {/* Left icon */}
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 pointer-events-none">
            {leftIcon}
          </div>
        )}

        {/* Input */}
        <input
          id={inputId}
          type={props.type || "text"}
          value={value}
          className={`
            block w-full rounded-xl border shadow-sm
            bg-white dark:bg-slate-800
            text-slate-900 dark:text-slate-100
            placeholder-slate-400 dark:placeholder-slate-500
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-0
            ${leftIcon ? 'pl-10' : 'pl-4'}
            ${(rightIcon || (clearable && hasValue)) ? 'pr-10' : 'pr-4'}
            py-2.5 text-sm
            ${hasError
              ? 'border-red-500 dark:border-red-400 focus:ring-red-500/20 focus:border-red-500'
              : 'border-slate-300 dark:border-slate-600 focus:ring-emerald-500/20 focus:border-emerald-500 dark:focus:border-emerald-400'
            }
            ${className}
          `}
          aria-invalid={hasError}
          aria-describedby={hasError ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined}
          {...props}
        />

        {/* Right icon or clear button */}
        {(rightIcon || (clearable && hasValue)) && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {clearable && hasValue ? (
              <button
                type="button"
                onClick={onClear}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                aria-label="Clear input"
              >
                <ClearIcon className="w-5 h-5" />
              </button>
            ) : (
              <span className="text-slate-400 dark:text-slate-500 pointer-events-none">
                {rightIcon}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Error message */}
      {hasError && (
        <p
          id={`${inputId}-error`}
          className="mt-1.5 text-xs text-red-600 dark:text-red-400 flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {error}
        </p>
      )}

      {/* Helper text */}
      {helperText && !hasError && (
        <p
          id={`${inputId}-helper`}
          className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
        >
          {helperText}
        </p>
      )}
    </div>
  );
};