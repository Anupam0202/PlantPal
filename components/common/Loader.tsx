
import React from 'react';

interface LoaderProps {
    size?: 'sm' | 'md' | 'lg';
    text?: string;
    loaderColor?: string; // e.g., 'text-emerald-600'
    textColor?: string;   // e.g., 'text-slate-700'
}

export const Loader: React.FC<LoaderProps> = ({ size = 'md', text, loaderColor, textColor }) => {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
  };
  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  }

  const finalLoaderColor = loaderColor || 'text-emerald-600 dark:text-emerald-400';
  const finalTextColor = textColor || 'text-slate-700 dark:text-slate-300';


  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-4">
      <svg 
        className={`animate-spin ${sizeClasses[size]} ${finalLoaderColor}`} 
        xmlns="http://www.w3.org/2000/svg" 
        fill="none" 
        viewBox="0 0 24 24"
        role="status"
        aria-live="polite"
        aria-label={text || "Loading"}
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      {text && <p className={`${textSizeClasses[size]} ${finalTextColor} font-medium`}>{text}</p>}
    </div>
  );
};
