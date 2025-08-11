
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
  size?: 'sm' | 'md' | 'lg' | 'icon'; 
  isLoading?: boolean;
  children?: React.ReactNode; 
  icon?: React.ReactNode; 
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  className,
  icon,
  ...props
}) => {
  const baseStyles = "font-medium rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-all duration-200 ease-in-out disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center shadow-sm hover:shadow-md";

  const variantStyles = {
    primary: "bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-500 border border-transparent disabled:bg-emerald-400 dark:bg-emerald-600 dark:hover:bg-emerald-700 dark:focus:ring-emerald-500 dark:disabled:bg-emerald-700",
    secondary: "bg-emerald-400 text-white hover:bg-emerald-500 focus:ring-emerald-400 border border-transparent disabled:bg-emerald-300 dark:bg-emerald-500 dark:hover:bg-emerald-600 dark:focus:ring-emerald-400 dark:disabled:bg-emerald-600",
    danger: "bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 border border-transparent disabled:bg-red-400 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-500 dark:disabled:bg-red-700",
    ghost: "bg-transparent text-emerald-600 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-800/50 focus:ring-emerald-500 border border-transparent",
    outline: "bg-transparent text-emerald-600 dark:text-emerald-300 border border-emerald-500 dark:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-800/30 focus:ring-emerald-500",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs tracking-wide",
    md: "px-4 py-2 text-sm tracking-wide",
    lg: "px-5 py-2.5 text-base tracking-wide",
    icon: "p-2", 
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className || ''}`}
      disabled={props.disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <svg className={`animate-spin h-5 w-5 ${variant === 'primary' || variant === 'secondary' || variant === 'danger' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      ) : (
        <>
          {icon && <span className={`${children && size !== 'icon' ? 'mr-2' : ''} h-5 w-5 flex items-center justify-center`}>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
};
