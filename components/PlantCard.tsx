
import React from 'react';
import type { PlantInfo } from '../types';

interface PlantCardProps {
  plant: PlantInfo;
  isSelected: boolean;
  onClick: () => void;
  onAddToFavorites: () => void;
  isFavorite: boolean;
}

export const PlantCard: React.FC<PlantCardProps> = ({ plant, isSelected, onClick, onAddToFavorites, isFavorite }) => {
  return (
    <div
      className={`bg-white dark:bg-slate-700 rounded-xl shadow-lg p-3.5 sm:p-4 cursor-pointer transition-all duration-200 group
                  border ${isSelected
                    ? 'ring-2 ring-emerald-500 dark:ring-emerald-400 bg-emerald-50 dark:bg-emerald-800/30 border-transparent' // Selected: strong ring, distinct bg tint, transparent base border
                    : 'border-slate-200 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20' // Normal/Hover: subtle tint and border change
                  }`}
      onClick={onClick}
      role="button"
      aria-pressed={isSelected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      aria-label={`View details for ${plant.commonName}`}
    >
      <div className="flex flex-col justify-center min-h-[60px]">
        <h3 className={`text-md sm:text-lg font-semibold truncate transition-colors ${isSelected ? 'text-emerald-700 dark:text-emerald-100' : 'text-slate-800 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-300'}`} title={plant.commonName}>
          {plant.commonName}
        </h3>
        {plant.scientificName && (
          <p className={`text-xs italic truncate transition-colors ${isSelected ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400 group-hover:text-emerald-500 dark:group-hover:text-emerald-400'}`} title={plant.scientificName}>
            {plant.scientificName}
          </p>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddToFavorites();
        }}
        className={`w-full mt-2 py-1.5 px-2.5 text-xs font-medium rounded-md transition-all duration-200 ease-in-out group
                    focus:outline-none focus:ring-2 focus:ring-offset-1 ${isFavorite ? 'dark:focus:ring-offset-emerald-800/30' : 'dark:focus:ring-offset-slate-700'}
                    ${isFavorite
                      ? 'bg-emerald-500 text-white hover:bg-emerald-600 focus:ring-emerald-400'
                      : `bg-slate-200 dark:bg-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-500 focus:ring-slate-400 dark:focus:ring-slate-500 ${
                          isSelected ? '!bg-emerald-100 dark:!bg-emerald-700/50 !text-emerald-700 dark:!text-emerald-200 hover:!bg-emerald-200 dark:hover:!bg-emerald-600/50' : ''
                        }`
                    }`}
        aria-label={isFavorite ? `Remove ${plant.commonName} from favorites` : `Add ${plant.commonName} to favorites`}
        aria-pressed={isFavorite}
      >
        <span className="flex items-center justify-center">
          {isFavorite ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          )}
          {isFavorite ? 'Favorited' : 'Favorite'}
        </span>
      </button>
    </div>
  );
};
