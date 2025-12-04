import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Button } from './common/Button';
import { Loader } from './common/Loader';
import { MiniProgress } from './common/ProgressBar';
import { PlantCard } from './PlantCard';
import { PlantDetailModal } from './PlantDetailModal';
import type { LocationData, UserPreferences, PlantInfo, InfrastructureInfo, ViewMode } from '../types';
import {
  PlantPalIcon,
  DownloadIcon,
  RefreshIcon,
  GridIcon,
  ListIcon,
  HeartIcon,
  ShareIcon,
  SparklesIcon,
} from '../constants';
import { generatePlantImage } from '../services/geminiService';

// Parser for Gemini response
const parseGeminiRecommendations = (markdownText: string | null): {
  plants: PlantInfo[];
  infrastructure: InfrastructureInfo[];
  conclusion: string | null;
} => {
  if (!markdownText) return { plants: [], infrastructure: [], conclusion: null };

  const plants: PlantInfo[] = [];
  const infrastructure: InfrastructureInfo[] = [];
  let conclusion: string | null = null;

  const lines = markdownText.split('\n');
  let currentPlant: Partial<PlantInfo> = {};
  let currentPlantPropertyKey: 'description' | 'suitability' | 'keyBenefits' | 'maintenanceTips' | null = null;

  let parsingStage: 'plants' | 'infrastructure' | 'conclusion' | '' = '';
  let currentInfra: Partial<InfrastructureInfo> = {};
  let currentInfraPropertyKey: 'explanation' | null = null;

  const pushCurrentPlant = () => {
    if (currentPlant.commonName) {
      if (currentPlant.description) currentPlant.description = currentPlant.description.trim();
      if (currentPlant.suitability) currentPlant.suitability = currentPlant.suitability.trim();
      if (currentPlant.keyBenefits) currentPlant.keyBenefits = currentPlant.keyBenefits.trim();
      if (currentPlant.maintenanceTips) currentPlant.maintenanceTips = currentPlant.maintenanceTips.trim();
      plants.push(currentPlant as PlantInfo);
    }
    currentPlant = {};
    currentPlantPropertyKey = null;
  };

  const pushCurrentInfra = () => {
    if (currentInfra.title) {
      if (currentInfra.explanation) currentInfra.explanation = currentInfra.explanation.trim();
      infrastructure.push(currentInfra as InfrastructureInfo);
    }
    currentInfra = {};
    currentInfraPropertyKey = null;
  };

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Check for section headers
    if (trimmedLine.match(/^### Green Infrastructure Ideas/i)) {
      pushCurrentPlant();
      parsingStage = 'infrastructure';
      continue;
    } else if (trimmedLine.match(/^### Conclusion/i)) {
      pushCurrentPlant();
      pushCurrentInfra();
      parsingStage = 'conclusion';
      conclusion = '';
      continue;
    } else if (parsingStage === '' && trimmedLine.match(/^\d\.\s+\*\*(.+?)\*\*\s*\((.+?)\)/)) {
      parsingStage = 'plants';
    }

    // Parse based on current stage
    if (parsingStage === 'plants' || (parsingStage === '' && trimmedLine.startsWith('1.'))) {
      const plantNameMatch = trimmedLine.match(/^\d\.\s+\*\*(.+?)\*\*\s*\((.+?)\)/);
      if (plantNameMatch) {
        pushCurrentPlant();
        currentPlant = {
          id: `plant-${plants.length + 1}-${plantNameMatch[1].trim().toLowerCase().replace(/\s+/g, '-')}`,
          commonName: plantNameMatch[1].trim(),
          scientificName: plantNameMatch[2].trim(),
          imageLoading: false,
          imageError: false,
        };
        continue;
      }

      const propertyMatch = trimmedLine.match(/^(?:\d\.\s+)?\*\*(Description|Suitability|Key Benefits|Maintenance Tips):\*\*\s*(.*)/i);
      if (propertyMatch && currentPlant.commonName) {
        const [, key, value] = propertyMatch;
        const rawKey = key.toLowerCase().replace(/\s+/g, '');

        currentPlantPropertyKey = null;
        if (rawKey === 'description') {
          currentPlant.description = value.trim();
          currentPlantPropertyKey = 'description';
        } else if (rawKey === 'suitability') {
          currentPlant.suitability = value.trim();
          currentPlantPropertyKey = 'suitability';
        } else if (rawKey === 'keybenefits') {
          currentPlant.keyBenefits = value.trim();
          currentPlantPropertyKey = 'keyBenefits';
        } else if (rawKey === 'maintenancetips') {
          currentPlant.maintenanceTips = value.trim();
          currentPlantPropertyKey = 'maintenanceTips';
        }
      } else if (currentPlant.commonName && currentPlantPropertyKey && trimmedLine.length > 0 && !trimmedLine.match(/^\d\.\s+\*\*(.+?)\*\*/)) {
        if (currentPlant[currentPlantPropertyKey]) {
          currentPlant[currentPlantPropertyKey] += ' ' + trimmedLine;
        } else {
          currentPlant[currentPlantPropertyKey] = trimmedLine;
        }
      }

    } else if (parsingStage === 'infrastructure') {
      const infraTitleMatch = trimmedLine.match(/-\s+\*\*(.+?)\*\*:/);
      if (infraTitleMatch) {
        pushCurrentInfra();
        currentInfra = {
          id: `infra-${infrastructure.length + 1}-${infraTitleMatch[1].trim().toLowerCase().replace(/\s+/g, '-')}`,
          title: infraTitleMatch[1].trim(),
          explanation: trimmedLine.substring(infraTitleMatch[0].length).trim(),
        };
        currentInfraPropertyKey = 'explanation';
      } else if (currentInfra.title && currentInfraPropertyKey === 'explanation' && trimmedLine.length > 0 && !trimmedLine.startsWith('- **')) {
        currentInfra.explanation = (currentInfra.explanation || '') + ' ' + trimmedLine;
      }
    } else if (parsingStage === 'conclusion') {
      if (conclusion === null) conclusion = '';
      conclusion += line + '\n';
    }
  }

  // Push any remaining items
  pushCurrentPlant();
  pushCurrentInfra();

  return { plants, infrastructure, conclusion: conclusion ? conclusion.trim() : null };
};

interface RecommendationsDisplayProps {
  recommendations: string | null;
  isLoading: boolean;
  error: string | null;
  onReset: () => void;
  onRefine: () => void;
  location: LocationData | null;
  preferences: UserPreferences | null;
}

export const RecommendationsDisplay: React.FC<RecommendationsDisplayProps> = ({
  recommendations: rawRecommendations,
  isLoading,
  error,
  onReset,
  onRefine,
  location,
  preferences,
}) => {
  const [selectedPlant, setSelectedPlant] = useState<PlantInfo | null>(null);
  const [favoritedPlants, setFavoritedPlants] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [plantsWithImages, setPlantsWithImages] = useState<PlantInfo[]>([]);
  const [imageGenerationProgress, setImageGenerationProgress] = useState({ current: 0, total: 0 });
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);

  // Parse recommendations
  const { plants: parsedPlants, infrastructure, conclusion } = useMemo(() => {
    return parseGeminiRecommendations(rawRecommendations);
  }, [rawRecommendations]);

  // Generate images for plants
  const generateImagesForPlants = useCallback(async (plants: PlantInfo[]) => {
    if (plants.length === 0) return;

    setIsGeneratingImages(true);
    setImageGenerationProgress({ current: 0, total: plants.length });

    // Initialize plants with loading state
    const initialPlants = plants.map(p => ({ ...p, imageLoading: true }));
    setPlantsWithImages(initialPlants);

    for (let i = 0; i < plants.length; i++) {
      const plant = plants[i];

      try {
        const result = await generatePlantImage(plant.commonName, plant.scientificName);

        setPlantsWithImages(prev => prev.map(p =>
          p.id === plant.id
            ? {
              ...p,
              imageUrl: result.success ? result.imageUrl : undefined,
              imageLoading: false,
              imageError: !result.success,
            }
            : p
        ));
      } catch (err) {
        console.error(`Failed to generate image for ${plant.commonName}:`, err);
        setPlantsWithImages(prev => prev.map(p =>
          p.id === plant.id
            ? { ...p, imageLoading: false, imageError: true }
            : p
        ));
      }

      setImageGenerationProgress({ current: i + 1, total: plants.length });

      // Add delay between requests to avoid rate limiting
      if (i < plants.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    setIsGeneratingImages(false);
  }, []);

  // Effect to generate images when plants change
  useEffect(() => {
    if (parsedPlants.length > 0 && plantsWithImages.length === 0) {
      generateImagesForPlants(parsedPlants);
    }
  }, [parsedPlants, plantsWithImages.length, generateImagesForPlants]);

  // Use plants with images if available, otherwise parsed plants
  const displayPlants = plantsWithImages.length > 0 ? plantsWithImages : parsedPlants;

  // Filter plants
  const filteredPlants = useMemo(() => {
    if (!showFavoritesOnly) return displayPlants;
    return displayPlants.filter(p => favoritedPlants.includes(p.id));
  }, [displayPlants, showFavoritesOnly, favoritedPlants]);

  const toggleFavorite = (plantId: string) => {
    setFavoritedPlants(prev =>
      prev.includes(plantId) ? prev.filter(id => id !== plantId) : [...prev, plantId]
    );
  };

  const handleShare = async () => {
    const shareData = {
      title: 'PlantPal Recommendations',
      text: `Check out my plant recommendations from PlantPal! I got ${displayPlants.length} great plant suggestions.`,
      url: window.location.href,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or share failed
        console.log('Share cancelled or failed');
      }
    } else {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(`${shareData.text}\n${shareData.url}`);
        alert('Link copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy to clipboard');
      }
    }
  };

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    // Plants sheet
    const plantsData = displayPlants.map(p => ({
      "Common Name": p.commonName,
      "Scientific Name": p.scientificName || '',
      "Description": p.description || '',
      "Suitability": p.suitability || '',
      "Key Benefits": p.keyBenefits || '',
      "Maintenance Tips": p.maintenanceTips || '',
      "Favorite": favoritedPlants.includes(p.id) ? 'Yes' : 'No',
    }));
    const wsPlants = XLSX.utils.json_to_sheet(plantsData);
    XLSX.utils.book_append_sheet(wb, wsPlants, "Plant Recommendations");

    // Infrastructure sheet
    if (infrastructure.length > 0) {
      const infraData = infrastructure.map(i => ({
        "Title": i.title,
        "Explanation": i.explanation || '',
      }));
      const wsInfra = XLSX.utils.json_to_sheet(infraData);
      XLSX.utils.book_append_sheet(wb, wsInfra, "Green Infrastructure");
    }

    // Location & Preferences sheet
    if (location && preferences) {
      const contextData = [{
        "Location": location.name || `${location.latitude}, ${location.longitude}`,
        "Latitude": location.latitude,
        "Longitude": location.longitude,
        "Sunlight": preferences.sunlightExposure,
        "Watering": preferences.wateringFrequency,
        "Area Size": preferences.plantingAreaSize,
        "Plant Types": preferences.plantType,
        "Goals": preferences.planningGoals.join(', '),
      }];
      const wsContext = XLSX.utils.json_to_sheet(contextData);
      XLSX.utils.book_append_sheet(wb, wsContext, "Context");
    }

    // Conclusion sheet
    if (conclusion) {
      const wsConclusion = XLSX.utils.json_to_sheet([{ "Conclusion": conclusion }]);
      XLSX.utils.book_append_sheet(wb, wsConclusion, "Conclusion");
    }

    XLSX.writeFile(wb, `PlantPal_Recommendations_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 mb-6 animate-pulse">
          <SparklesIcon className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Crafting Your Recommendations
        </h3>
        <Loader size="md" text="Analyzing your preferences..." />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 mb-6">
          <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-red-700 dark:text-red-400 mb-2">
          Something Went Wrong
        </h3>
        <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl text-sm mb-6 max-w-md mx-auto">
          {error}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={onRefine} variant="outline" size="lg">
            Adjust Preferences
          </Button>
          <Button onClick={onReset} variant="danger" size="lg">
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!rawRecommendations || displayPlants.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700 mb-6">
          <PlantPalIcon className="w-10 h-10 text-slate-400" />
        </div>
        <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-200 mb-2">
          No Recommendations Yet
        </h3>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Try adjusting your preferences to get plant suggestions.
        </p>
        <Button onClick={onRefine} variant="primary" size="lg">
          Update Preferences
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center px-4 py-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-sm font-medium mb-4 shadow-lg shadow-emerald-500/25">
          <SparklesIcon className="w-4 h-4 mr-2" />
          AI-Powered Recommendations
        </div>
        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-white mb-2">
          Your Perfect Plants
        </h2>
        <p className="text-slate-500 dark:text-slate-400">
          Based on your location, preferences, and goals, here are {displayPlants.length} plants that will thrive in your space.
        </p>
      </div>

      {/* Image generation progress */}
      {isGeneratingImages && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
              <SparklesIcon className="w-4 h-4 text-white animate-pulse" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Generating plant images ({imageGenerationProgress.current}/{imageGenerationProgress.total})
              </p>
              <MiniProgress
                progress={(imageGenerationProgress.current / imageGenerationProgress.total) * 100}
                size="sm"
                showLabel={false}
              />
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3">
        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-white dark:bg-slate-700 p-1 shadow-sm">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'grid'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              aria-label="Grid view"
            >
              <GridIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-colors ${viewMode === 'list'
                ? 'bg-emerald-500 text-white'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              aria-label="List view"
            >
              <ListIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Favorites filter */}
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`
              flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${showFavoritesOnly
                ? 'bg-rose-500 text-white'
                : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
              }
            `}
          >
            <HeartIcon className="w-4 h-4" filled={showFavoritesOnly} />
            <span className="hidden sm:inline">Favorites</span>
            {favoritedPlants.length > 0 && (
              <span className={`
                px-1.5 py-0.5 rounded-full text-xs
                ${showFavoritesOnly ? 'bg-white/20' : 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'}
              `}>
                {favoritedPlants.length}
              </span>
            )}
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button onClick={handleShare} variant="ghost" size="sm" icon={<ShareIcon className="w-4 h-4" />}>
            <span className="hidden sm:inline">Share</span>
          </Button>
          <Button onClick={handleDownloadExcel} variant="secondary" size="sm" icon={<DownloadIcon className="w-4 h-4" />}>
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </div>

      {/* Plants grid/list */}
      {filteredPlants.length > 0 ? (
        <div className={
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
            : 'space-y-3'
        }>
          {filteredPlants.map((plant, index) => (
            <PlantCard
              key={plant.id}
              plant={plant}
              isSelected={selectedPlant?.id === plant.id}
              onClick={() => setSelectedPlant(plant)}
              onAddToFavorites={() => toggleFavorite(plant.id)}
              isFavorite={favoritedPlants.includes(plant.id)}
              index={index}
              viewMode={viewMode}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
          <HeartIcon className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-slate-500 dark:text-slate-400">
            No favorite plants yet. Click the heart icon on any plant to save it.
          </p>
          <button
            onClick={() => setShowFavoritesOnly(false)}
            className="mt-3 text-emerald-600 dark:text-emerald-400 font-medium hover:underline"
          >
            Show all plants
          </button>
        </div>
      )}

      {/* Infrastructure Ideas */}
      {infrastructure.length > 0 && (
        <div className="mt-10">
          <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center">
              <PlantPalIcon className="w-6 h-6 text-white" />
            </span>
            Green Infrastructure Ideas
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {infrastructure.map((item, index) => (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <h4 className="font-semibold text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-sm">
                    {index + 1}
                  </span>
                  {item.title}
                </h4>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Conclusion */}
      {conclusion && (
        <div className="mt-8 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl p-6 border border-emerald-100 dark:border-emerald-800">
          <h3 className="text-lg font-semibold text-emerald-800 dark:text-emerald-300 mb-3">
            Final Thoughts
          </h3>
          <div className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
            {conclusion.split('\n').filter(p => p.trim()).map((paragraph, i) => (
              <p key={i} className="mb-2 last:mb-0">{paragraph}</p>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row justify-center gap-3 pt-6 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onRefine} variant="outline" size="lg" icon={<RefreshIcon className="w-5 h-5" />}>
          Refine Preferences
        </Button>
        <Button onClick={handleDownloadExcel} variant="secondary" size="lg" icon={<DownloadIcon className="w-5 h-5" />}>
          Download Excel
        </Button>
        <Button onClick={onReset} variant="primary" size="lg">
          Start New Plan
        </Button>
      </div>

      {/* Disclaimer */}
      <p className="text-center text-xs text-slate-400 dark:text-slate-500 italic pt-4">
        PlantPal provides AI-generated suggestions. Always consult local horticultural experts for specific advice.
      </p>

      {/* Plant detail modal */}
      {selectedPlant && (
        <PlantDetailModal
          plant={selectedPlant}
          onClose={() => setSelectedPlant(null)}
          onAddToFavorites={() => toggleFavorite(selectedPlant.id)}
          isFavorite={favoritedPlants.includes(selectedPlant.id)}
        />
      )}
    </div>
  );
};