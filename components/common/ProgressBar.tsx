import React from 'react';
import { CheckIcon } from '../../constants';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
  showSteps?: boolean;
  stepLabels?: string[];
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentStep,
  totalSteps,
  showSteps = true,
  stepLabels = ['Location', 'Preferences', 'Results']
}) => {
  const percentage = totalSteps > 0 ? Math.max(0, Math.min(100, (currentStep / totalSteps) * 100)) : 0;

  if (!showSteps) {
    // Simple progress bar
    return (
      <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden shadow-inner">
        <div
          className="bg-gradient-to-r from-emerald-400 via-teal-500 to-cyan-500 h-2.5 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    );
  }

  // Step indicator progress bar
  return (
    <div className="w-full">
      {/* Step indicators */}
      <div className="flex justify-between relative mb-2">
        {/* Background line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-700" />

        {/* Active line */}
        <div
          className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out"
          style={{ width: `${((currentStep - 1) / (totalSteps - 1)) * 100}%` }}
        />

        {stepLabels.slice(0, totalSteps).map((label, index) => {
          const stepNumber = index + 1;
          const isCompleted = stepNumber < currentStep;
          const isActive = stepNumber === currentStep;

          return (
            <div
              key={stepNumber}
              className="flex flex-col items-center relative z-10"
            >
              {/* Step circle */}
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  font-semibold text-sm transition-all duration-300
                  ${isCompleted
                    ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                    : isActive
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-500/40 ring-4 ring-emerald-500/20'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                  }
                `}
              >
                {isCompleted ? (
                  <CheckIcon className="w-5 h-5" />
                ) : (
                  stepNumber
                )}
              </div>

              {/* Step label */}
              <span
                className={`
                  mt-2 text-xs font-medium transition-colors duration-300
                  ${isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : isCompleted
                      ? 'text-emerald-500 dark:text-emerald-500'
                      : 'text-slate-400 dark:text-slate-500'
                  }
                `}
              >
                {label}
              </span>

              {/* Active glow effect */}
              {isActive && (
                <div className="absolute top-0 w-10 h-10 rounded-full bg-emerald-500/20 animate-ping" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Mini progress indicator for inline use
interface MiniProgressProps {
  progress: number; // 0-100
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export const MiniProgress: React.FC<MiniProgressProps> = ({
  progress,
  size = 'md',
  showLabel = true
}) => {
  const sizeClasses = size === 'sm' ? 'h-1.5' : 'h-2.5';

  return (
    <div className="flex items-center gap-2">
      <div className={`flex-1 bg-slate-200 dark:bg-slate-700 rounded-full ${sizeClasses} overflow-hidden`}>
        <div
          className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 min-w-[3ch]">
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
};