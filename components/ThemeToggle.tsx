import React from 'react';
import type { Theme } from '../types';
import { SunIcon, MoonIcon } from '../constants';

interface ThemeToggleProps {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, toggleTheme }) => {
  return (
    <button
      onClick={toggleTheme}
      className={`
        absolute top-0 right-0 sm:top-2 sm:right-2
        p-3 rounded-xl
        bg-white/80 dark:bg-slate-800/80
        backdrop-blur-sm
        border border-slate-200 dark:border-slate-700
        shadow-lg hover:shadow-xl
        transition-all duration-300
        group
        focus:outline-none focus:ring-2 focus:ring-emerald-500/50
      `}
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      <div className="relative w-6 h-6">
        {/* Sun icon */}
        <SunIcon
          className={`
            absolute inset-0 w-6 h-6
            text-amber-500
            transition-all duration-300
            ${theme === 'light'
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 rotate-90 scale-50'
            }
          `}
        />

        {/* Moon icon */}
        <MoonIcon
          className={`
            absolute inset-0 w-6 h-6
            text-indigo-400
            transition-all duration-300
            ${theme === 'dark'
              ? 'opacity-100 rotate-0 scale-100'
              : 'opacity-0 -rotate-90 scale-50'
            }
          `}
        />
      </div>

      {/* Glow effect */}
      <div className={`
        absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100
        transition-opacity duration-300
        ${theme === 'light'
          ? 'bg-amber-500/10'
          : 'bg-indigo-500/10'
        }
      `} />
    </button>
  );
};