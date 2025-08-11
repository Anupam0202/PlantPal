import React from 'react';
import type { PlantInfo } from '../types';
import { Button } from './common/Button';
// Image related icons (PlantPalIcon, ImagePlaceholderIcon, ImageErrorIcon) are removed as image display is removed.

interface PlantDetailModalProps {
  plant: PlantInfo | null;
  onClose: () => void;
  onAddToFavorites: () => void;
  isFavorite: boolean;
}

const DetailSection: React.FC<{ title: string; content?: string }> = ({ title, content }) => {
  if (!content) return null;
  return (
    <div className="py-1"> {/* Added padding for better separation */}
      <h4 className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-1 uppercase tracking-wider">{title}</h4> {/* Enhanced title styling */}
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">{content}</p> {/* Dark mode text and pre-line for newlines */}
    </div>
  );
};

export const PlantDetailModal: React.FC<PlantDetailModalProps> = ({ plant, onClose, onAddToFavorites, isFavorite }) => {
  if (!plant) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-800/75 dark:bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="plant-detail-title"
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-5 sm:p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto transform transition-all duration-300 ease-out scale-95 opacity-0 animate-modalShow border border-slate-200 dark:border-slate-700 flex flex-col" // Added flex flex-col
        onClick={(e) => e.stopPropagation()}
        style={{animationName: 'modalShowAnim', animationDuration: '0.3s', animationFillMode: 'forwards'}}
      >
        <style>{`
          @keyframes modalShowAnim {
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <div className="flex justify-between items-start mb-3 sm:mb-4 flex-shrink-0">
          <div>
            <h2 id="plant-detail-title" className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-300">{plant.commonName}</h2>
            {plant.scientificName && <p className="text-xs text-slate-500 dark:text-slate-400 italic">({plant.scientificName})</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors p-1 -mr-1 -mt-1 rounded-full focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
            aria-label="Close plant details"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Image display section removed */}

        <div className="space-y-3 sm:space-y-4 flex-grow overflow-y-auto pr-1"> {/* Added pr-1 for scrollbar spacing */}
          <DetailSection title="Description" content={plant.description} />
          <DetailSection title="Suitability" content={plant.suitability} />
          <DetailSection title="Key Benefits" content={plant.keyBenefits} />
          <DetailSection title="Maintenance Tips" content={plant.maintenanceTips} />
        </div>

        <div className="mt-5 sm:mt-6 flex-shrink-0"> {/*Ensure button is always at bottom */}
            <Button
                onClick={onAddToFavorites}
                variant={isFavorite ? "secondary" : "primary"}
                size="md"
                className="w-full"
                icon={isFavorite ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                )}
            >
                {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
            </Button>
        </div>
      </div>
    </div>
  );
};