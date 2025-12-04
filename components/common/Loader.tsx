import React from 'react';

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'dots' | 'plant';
  text?: string;
  loaderColor?: string;
  textColor?: string;
}

export const Loader: React.FC<LoaderProps> = ({
  size = 'md',
  variant = 'spinner',
  text,
  loaderColor = 'text-emerald-500 dark:text-emerald-400',
  textColor = 'text-slate-600 dark:text-slate-300'
}) => {
  const sizeClasses = {
    sm: 'h-6 w-6',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const renderLoader = () => {
    switch (variant) {
      case 'dots':
        return (
          <div className="flex space-x-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`${size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-3 h-3' : 'w-4 h-4'} rounded-full bg-emerald-500 dark:bg-emerald-400 animate-bounce`}
                style={{ animationDelay: `${i * 150}ms` }}
              />
            ))}
          </div>
        );

      case 'plant':
        return (
          <div className={`${sizeClasses[size]} ${loaderColor} animate-pulse`}>
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
            </svg>
          </div>
        );

      default: // spinner
        return (
          <svg
            className={`animate-spin ${sizeClasses[size]} ${loaderColor}`}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12" cy="12" r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-3 py-4" role="status" aria-live="polite">
      {renderLoader()}
      {text && (
        <p className={`${textSizeClasses[size]} ${textColor} font-medium animate-pulse`}>
          {text}
        </p>
      )}
    </div>
  );
};

// Skeleton loading component for cards
interface SkeletonProps {
  className?: string;
  animate?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', animate = true }) => (
  <div
    className={`
      bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200
      dark:from-slate-700 dark:via-slate-600 dark:to-slate-700
      rounded-lg
      ${animate ? 'animate-shimmer bg-[length:200%_100%]' : ''}
      ${className}
    `}
    style={animate ? { animation: 'shimmer 1.5s infinite' } : undefined}
  />
);

// Card skeleton for loading states
export const CardSkeleton: React.FC = () => (
  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4 border border-slate-200 dark:border-slate-700">
    <Skeleton className="h-40 w-full mb-4" />
    <Skeleton className="h-5 w-3/4 mb-2" />
    <Skeleton className="h-4 w-1/2 mb-4" />
    <Skeleton className="h-8 w-full" />
  </div>
);

// Plant card skeleton
export const PlantCardSkeleton: React.FC<{ index?: number }> = ({ index = 0 }) => (
  <div
    className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden border border-slate-200 dark:border-slate-700 animate-fade-in"
    style={{ animationDelay: `${index * 100}ms` }}
  >
    {/* Image skeleton */}
    <div className="relative h-48 overflow-hidden">
      <Skeleton className="absolute inset-0" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
    </div>

    {/* Content skeleton */}
    <div className="p-4 space-y-3">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <Skeleton className="h-5 w-3/4 mb-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      </div>

      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />

      <Skeleton className="h-9 w-full rounded-lg mt-3" />
    </div>
  </div>
);

// Image loading skeleton with shimmer
export const ImageSkeleton: React.FC<{ className?: string }> = ({ className = 'h-48' }) => (
  <div className={`relative overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800 ${className}`}>
    <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:200%_100%]" />
    <div className="absolute inset-0 flex items-center justify-center">
      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    </div>
  </div>
);