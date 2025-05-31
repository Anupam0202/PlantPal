
import React from 'react';

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ currentStep, totalSteps }) => {
  const percentage = totalSteps > 0 ? Math.max(0, Math.min(100, (currentStep / totalSteps) * 100)) : 0;

  return (
    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden shadow-inner">
      <div
        className="bg-gradient-to-r from-emerald-400 to-green-500 dark:from-emerald-500 dark:to-green-600 h-2.5 rounded-full transition-all duration-500 ease-out"
        style={{ width: `${percentage}%` }}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progress: ${Math.round(percentage)}%`}
      >
      </div>
    </div>
  );
};
