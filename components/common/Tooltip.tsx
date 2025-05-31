
import React from 'react';
import { InfoIcon } from '../../constants';


interface TooltipProps {
  text: string;
  children?: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top' }) => {
  const positionClasses = {
    top: 'bottom-full left-1/2 transform -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 transform -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 transform -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 transform -translate-y-1/2 ml-2',
  };
  
  return (
    <span className="relative group inline-flex align-middle ml-1.5">
      {children ? children : <InfoIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 cursor-help transition-colors" />}
      <span 
        className={`absolute ${positionClasses[position]} w-max max-w-xs p-2.5 text-xs text-white dark:text-slate-900 bg-slate-800 dark:bg-slate-200 rounded-md 
                   opacity-0 group-hover:opacity-100 transition-opacity duration-200 ease-in-out z-50 shadow-lg 
                   whitespace-normal break-words pointer-events-none`}
        role="tooltip"
      >
        {text}
      </span>
    </span>
  );
};
