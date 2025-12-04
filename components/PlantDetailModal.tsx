import React from 'react';
import type { PlantInfo } from '../types';
import { Button } from './common/Button';
import { CloseIcon, HeartIcon, SparklesIcon, ExternalLinkIcon } from '../constants';
import { ImageSkeleton } from './common/Loader';

interface PlantDetailModalProps {
  plant: PlantInfo | null;
  onClose: () => void;
  onAddToFavorites: () => void;
  isFavorite: boolean;
}

const DetailSection: React.FC<{
  title: string;
  content?: string;
  icon?: React.ReactNode;
}> = ({ title, content, icon }) => {
  if (!content) return null;
  return (
    <div className="py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2 uppercase tracking-wider">
        {icon && <span className="w-4 h-4">{icon}</span>}
        {title}
      </h4>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
        {content}
      </p>
    </div>
  );
};

export const PlantDetailModal: React.FC<PlantDetailModalProps> = ({
  plant,
  onClose,
  onAddToFavorites,
  isFavorite
}) => {
  if (!plant) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plant-detail-title"
    >
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-show"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 rounded-full bg-black/20 hover:bg-black/40 text-white transition-colors backdrop-blur-sm"
          aria-label="Close modal"
        >
          <CloseIcon className="w-5 h-5" />
        </button>

        {/* Favorite button */}
        <button
          onClick={onAddToFavorites}
          className={`
            absolute top-4 left-4 z-20 p-2 rounded-full transition-all backdrop-blur-sm
            ${isFavorite
              ? 'bg-rose-500 text-white'
              : 'bg-black/20 hover:bg-black/40 text-white'
            }
          `}
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        >
          <HeartIcon className="w-5 h-5" filled={isFavorite} />
        </button>

        {/* Header with image */}
        <div className="relative h-64 overflow-hidden">
          {plant.imageLoading ? (
            <ImageSkeleton className="w-full h-full" />
          ) : plant.imageUrl ? (
            <>
              <img
                src={plant.imageUrl}
                alt={plant.commonName}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
            </>
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <span className="text-8xl">🌿</span>
            </div>
          )}

          {/* Plant name overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <h2
              id="plant-detail-title"
              className="text-2xl md:text-3xl font-bold text-white mb-1"
            >
              {plant.commonName}
            </h2>
            {plant.scientificName && (
              <p className="text-white/80 italic">
                {plant.scientificName}
              </p>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-16rem)]">
          {/* Quick stats */}
          {(plant.growthRate || plant.category) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {plant.category && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                  {plant.category}
                </span>
              )}
              {plant.growthRate && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300">
                  {plant.growthRate} growth
                </span>
              )}
            </div>
          )}

          {/* Detail sections */}
          <div className="space-y-1">
            <DetailSection
              title="Description"
              content={plant.description}
              icon={<SparklesIcon className="w-4 h-4" />}
            />
            <DetailSection
              title="Suitability"
              content={plant.suitability}
            />
            <DetailSection
              title="Key Benefits"
              content={plant.keyBenefits}
            />
            <DetailSection
              title="Maintenance Tips"
              content={plant.maintenanceTips}
            />
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <Button
              onClick={onAddToFavorites}
              variant={isFavorite ? "secondary" : "primary"}
              size="lg"
              fullWidth
              icon={<HeartIcon className="w-5 h-5" filled={isFavorite} />}
            >
              {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            </Button>
            <Button
              as="a"
              href={`https://www.google.com/search?q=${encodeURIComponent(plant.commonName + ' plant care')}`}
              target="_blank"
              rel="noopener noreferrer"
              variant="outline"
              size="lg"
              fullWidth
              icon={<ExternalLinkIcon className="w-5 h-5" />}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              Learn More
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};