import React, { useState, useRef, useEffect } from 'react';
import { InfoIcon } from '../../constants';

type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';
type TooltipVariant = 'default' | 'info' | 'success' | 'warning';

interface TooltipProps {
  text: string;
  children?: React.ReactNode;
  position?: TooltipPosition;
  variant?: TooltipVariant;
  showArrow?: boolean;
}

export const Tooltip: React.FC<TooltipProps> = ({
  text,
  children,
  position = 'top',
  variant = 'default',
  showArrow = true
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const variantStyles: Record<TooltipVariant, string> = {
    default: 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900',
    info: 'bg-blue-600 dark:bg-blue-400 text-white dark:text-blue-900',
    success: 'bg-emerald-600 dark:bg-emerald-400 text-white dark:text-emerald-900',
    warning: 'bg-amber-500 dark:bg-amber-400 text-white dark:text-amber-900',
  };

  const getPositionClasses = (pos: TooltipPosition): string => {
    const positions: Record<TooltipPosition, string> = {
      top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
      bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
      left: 'right-full top-1/2 -translate-y-1/2 mr-2',
      right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    };
    return positions[pos];
  };

  const getArrowClasses = (pos: TooltipPosition): string => {
    const baseClasses = 'absolute w-0 h-0 border-solid';
    const variantColor = variant === 'default'
      ? 'border-slate-800 dark:border-slate-200'
      : variant === 'info'
        ? 'border-blue-600 dark:border-blue-400'
        : variant === 'success'
          ? 'border-emerald-600 dark:border-emerald-400'
          : 'border-amber-500 dark:border-amber-400';

    const arrows: Record<TooltipPosition, string> = {
      top: `${baseClasses} -bottom-1.5 left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-t-[6px] border-l-transparent border-r-transparent ${variantColor.replace('border-', 'border-t-')}`,
      bottom: `${baseClasses} -top-1.5 left-1/2 -translate-x-1/2 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent ${variantColor.replace('border-', 'border-b-')}`,
      left: `${baseClasses} -right-1.5 top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-l-[6px] border-t-transparent border-b-transparent ${variantColor.replace('border-', 'border-l-')}`,
      right: `${baseClasses} -left-1.5 top-1/2 -translate-y-1/2 border-t-[6px] border-b-[6px] border-r-[6px] border-t-transparent border-b-transparent ${variantColor.replace('border-', 'border-r-')}`,
    };
    return arrows[pos];
  };

  // Adjust position if tooltip would overflow viewport
  useEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newPosition = position;

      if (position === 'top' && tooltipRect.top < 0) {
        newPosition = 'bottom';
      } else if (position === 'bottom' && tooltipRect.bottom > viewportHeight) {
        newPosition = 'top';
      } else if (position === 'left' && tooltipRect.left < 0) {
        newPosition = 'right';
      } else if (position === 'right' && tooltipRect.right > viewportWidth) {
        newPosition = 'left';
      }

      setAdjustedPosition(newPosition);
    }
  }, [isVisible, position]);

  return (
    <span
      className="relative inline-flex align-middle ml-1"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
      ref={triggerRef}
    >
      {children ? (
        <span className="cursor-help">{children}</span>
      ) : (
        <InfoIcon className="w-4 h-4 text-slate-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 cursor-help transition-colors" />
      )}

      <span
        ref={tooltipRef}
        className={`
          absolute ${getPositionClasses(adjustedPosition)}
          px-3 py-2 text-xs font-medium rounded-lg shadow-lg
          ${variantStyles[variant]}
          transition-all duration-200 ease-out
          ${isVisible ? 'opacity-100 visible scale-100' : 'opacity-0 invisible scale-95'}
          z-50 whitespace-normal max-w-xs
          pointer-events-none
        `}
        role="tooltip"
      >
        {text}
        {showArrow && (
          <span className={getArrowClasses(adjustedPosition)} />
        )}
      </span>
    </span>
  );
};