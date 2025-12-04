import React from 'react';
import type { PlantInfo } from '../types';
import { HeartIcon, ChevronRightIcon } from '../constants';
import { ImageSkeleton } from './common/Loader';

interface PlantCardProps {
  plant: PlantInfo;
  isSelected: boolean;
  onClick: () => void;
  onAddToFavorites: () => void;
  isFavorite: boolean;
  index?: number;
  viewMode?: 'grid' | 'list';
}

export const PlantCard: React.FC<PlantCardProps> = ({
  plant,
  isSelected,
  onClick,
  onAddToFavorites,
  isFavorite,
  index = 0,
  viewMode = 'grid'
}) => {
  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToFavorites();
  };

  if (viewMode === 'list') {
    return (
      <div
        onClick={onClick}
        className={`
          flex items-center gap-4 p-4 rounded-xl cursor-pointer
          transition-all duration-300 ease-out
          bg-white dark:bg-slate-800 border
          ${isSelected
            ? 'border-emerald-500 shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-500/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-md'
          }
          animate-fade-in
        `}
        style={{ animationDelay: `${index * 50}ms` }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      >
        {/* Image */}
        <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 relative">
          {plant.imageLoading ? (
            <ImageSkeleton className="w-full h-full" />
          ) : plant.imageUrl ? (
            <img
              src={plant.imageUrl}
              alt={plant.commonName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center">
              <span className="text-2xl">🌱</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 truncate">
            {plant.commonName}
          </h3>
          {plant.scientificName && (
            <p className="text-xs text-slate-500 dark:text-slate-400 italic truncate">
              {plant.scientificName}
            </p>
          )}
          {plant.description && (
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
              {plant.description}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleFavoriteClick}
            className={`
              p-2 rounded-full transition-all duration-200
              ${isFavorite
                ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/30'
                : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-700'
              }
            `}
          >
            <HeartIcon className="w-5 h-5" filled={isFavorite} />
          </button>
          <ChevronRightIcon className="w-5 h-5 text-slate-400" />
        </div>
      </div>
    );
  }

  // Grid view (default)
  return (
    <div
      onClick={onClick}
      className={`
        group relative rounded-xl overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        bg-white dark:bg-slate-800 border
        ${isSelected
          ? 'border-emerald-500 shadow-xl shadow-emerald-500/20 ring-2 ring-emerald-500/20 scale-[1.02]'
          : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-xl hover:-translate-y-1'
        }
        animate-plant-grow
      `}
      style={{ animationDelay: `${index * 100}ms` }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      aria-label={`View details for ${plant.commonName}`}
    >
      {/* Favorite button - top right */}
      <button
        onClick={handleFavoriteClick}
        className={`
          absolute top-3 right-3 z-20 p-2 rounded-full
          transition-all duration-200 backdrop-blur-sm
          ${isFavorite
            ? 'bg-rose-500 text-white shadow-lg'
            : 'bg-white/80 dark:bg-slate-800/80 text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-700'
          }
        `}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
      >
        <HeartIcon className="w-5 h-5" filled={isFavorite} />
      </button>

      {/* Image container */}
      <div className="relative h-48 overflow-hidden">
        {plant.imageLoading ? (
          <ImageSkeleton className="w-full h-full" />
        ) : plant.imageUrl ? (
          <>
            <img
              src={plant.imageUrl}
              alt={plant.commonName}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />
          </>
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 flex items-center justify-center">
            <div className="text-center">
              <span className="text-5xl block mb-2">🌿</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {plant.imageError ? 'Image unavailable' : 'Generating image...'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className={`
          font-semibold text-lg mb-0.5 truncate transition-colors
          ${isSelected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'}
        `}>
          {plant.commonName}
        </h3>

        {plant.scientificName && (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic truncate mb-2">
            {plant.scientificName}
          </p>
        )}

        {plant.description && (
          <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 mb-3">
            {plant.description}
          </p>
        )}

        {/* View details prompt */}
        <div className={`
          flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-medium
          transition-all duration-200
          ${isSelected
            ? 'bg-emerald-500 text-white'
            : 'bg-slate-100 dark:bg-slate-700/50 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white'
          }
        `}>
          <span>View Details</span>
          <ChevronRightIcon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};

// Skeleton component for loading state
export const PlantCardSkeleton: React.FC<{ index?: number; viewMode?: 'grid' | 'list' }> = ({
  index = 0,
  viewMode = 'grid'
}) => {
  if (viewMode === 'list') {
    return (
      <div
        className="flex items-center gap-4 p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-fade-in"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="w-20 h-20 rounded-lg bg-slate-200 dark:bg-slate-700 animate-pulse" />
        <div className="flex-1">
          <div className="h-5 w-2/3 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
          <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl overflow-hidden bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 animate-fade-in"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <div className="h-48 bg-slate-200 dark:bg-slate-700 animate-pulse" />
      <div className="p-4">
        <div className="h-5 w-3/4 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
        <div className="h-3 w-1/2 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-3" />
        <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-2" />
        <div className="h-4 w-5/6 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-3" />
        <div className="h-9 w-full bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
      </div>
    </div>
  );
};