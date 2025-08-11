
import React from 'react';
import type { Theme } from '../types';
import { Button } from './common/Button';
import { SunIcon, MoonIcon } from '../constants'; 

interface ThemeToggleProps {
  theme: Theme;
  toggleTheme: () => void;
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ theme, toggleTheme }) => {
  return (
    <Button
      onClick={toggleTheme}
      variant="ghost"
      size="icon"
      className="absolute top-4 right-4 sm:top-6 sm:right-6 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/60 focus:ring-emerald-500 dark:focus:ring-emerald-400"
      aria-label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
    >
      {theme === 'light' ? <MoonIcon className="w-5 h-5" /> : <SunIcon className="w-5 h-5" />}
    </Button>
  );
};
