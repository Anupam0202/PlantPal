
import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx'; // Added for Excel export
import { Button } from './common/Button';
import { Loader } from './common/Loader';
import type { LocationData, UserPreferences, PlantInfo, InfrastructureInfo } from '../types';
import { PlantCard } from './PlantCard';
import { PlantDetailModal } from './PlantDetailModal';
import { PlantPalIcon, DownloadIcon } from '../constants'; 

// Helper function to parse Gemini's Markdown response
const parseGeminiRecommendations = (markdownText: string | null): { plants: PlantInfo[], infrastructure: InfrastructureInfo[], conclusion: string | null } => {
  if (!markdownText) return { plants: [], infrastructure: [], conclusion: null };

  const plants: PlantInfo[] = [];
  let infrastructure: InfrastructureInfo[] = [];
  let conclusion: string | null = null;

  const lines = markdownText.split('\n');
  let currentPlant: Partial<PlantInfo> = {};
  let currentPlantPropertyKey: 'description' | 'suitability' | 'keyBenefits' | 'maintenanceTips' | null = null;
  
  let parsingStage = ''; // 'plants', 'infrastructure', 'conclusion'
  let currentInfra: Partial<InfrastructureInfo> = {};
  let currentInfraPropertyKey: 'explanation' | null = null;


  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.match(/^### Green Infrastructure Ideas/i)) {
      parsingStage = 'infrastructure';
      if (currentPlant.commonName) { 
        if(currentPlant.description) currentPlant.description = currentPlant.description.trim();
        if(currentPlant.suitability) currentPlant.suitability = currentPlant.suitability.trim();
        if(currentPlant.keyBenefits) currentPlant.keyBenefits = currentPlant.keyBenefits.trim();
        if(currentPlant.maintenanceTips) currentPlant.maintenanceTips = currentPlant.maintenanceTips.trim();
        plants.push(currentPlant as PlantInfo);
      }
      currentPlant = {};
      currentPlantPropertyKey = null;
      currentInfraPropertyKey = null; 
      continue;
    } else if (trimmedLine.match(/^### Conclusion/i)) {
      parsingStage = 'conclusion';
      if (currentPlant.commonName) { 
         if(currentPlant.description) currentPlant.description = currentPlant.description.trim();
         if(currentPlant.suitability) currentPlant.suitability = currentPlant.suitability.trim();
         if(currentPlant.keyBenefits) currentPlant.keyBenefits = currentPlant.keyBenefits.trim();
         if(currentPlant.maintenanceTips) currentPlant.maintenanceTips = currentPlant.maintenanceTips.trim();
        plants.push(currentPlant as PlantInfo);
      }
      currentPlant = {};
      currentPlantPropertyKey = null;

      if (currentInfra.title) { 
        if (currentInfra.explanation) currentInfra.explanation = currentInfra.explanation.trim();
        infrastructure.push(currentInfra as InfrastructureInfo);
      }
      currentInfra = {};
      currentInfraPropertyKey = null;
      conclusion = ''; 
      continue;
    } else if (parsingStage === '' && trimmedLine.match(/^\d\.\s+\*\*(.+?)\*\*\s*\((.+?)\)/)) {
        parsingStage = 'plants'; 
    }


    if (parsingStage === 'plants' || (parsingStage === '' && trimmedLine.startsWith('1.'))) {
      const plantNameMatch = trimmedLine.match(/^\d\.\s+\*\*(.+?)\*\*\s*\((.+?)\)/);
      if (plantNameMatch) {
        if (currentPlant.commonName) {
            if(currentPlant.description) currentPlant.description = currentPlant.description.trim();
            if(currentPlant.suitability) currentPlant.suitability = currentPlant.suitability.trim();
            if(currentPlant.keyBenefits) currentPlant.keyBenefits = currentPlant.keyBenefits.trim();
            if(currentPlant.maintenanceTips) currentPlant.maintenanceTips = currentPlant.maintenanceTips.trim();
            plants.push(currentPlant as PlantInfo);
        }
        currentPlant = {
          id: plantNameMatch[1].trim().toLowerCase().replace(/\s+/g, '-'),
          commonName: plantNameMatch[1].trim(),
          scientificName: plantNameMatch[2].trim(),
        };
        currentPlantPropertyKey = null; 
        continue;
      }
      
      const propertyMatch = trimmedLine.match(/^(?:\d\.\s+)?\*\*(Description|Suitability|Key Benefits|Maintenance Tips):\*\*\s*(.*)/i);
      if(propertyMatch && currentPlant.commonName) {
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
      } else if (currentPlant.commonName && currentPlantPropertyKey && trimmedLine.length > 0 && !trimmedLine.match(/^\d\.\s+\*\*(.+?)\*\*\s*\((.+?)\)/) ) {
        // This is a continuation line for the currentPlantPropertyKey
        if (currentPlant[currentPlantPropertyKey]) {
             currentPlant[currentPlantPropertyKey] += " " + trimmedLine.trim();
        } else {
            // Should not happen if currentPlantPropertyKey is set correctly after initial assignment
            currentPlant[currentPlantPropertyKey] = trimmedLine.trim();
        }
      }

    } else if (parsingStage === 'infrastructure') {
      const infraTitleMatch = trimmedLine.match(/-\s+\*\*(.+?)\*\*:/); 
      if (infraTitleMatch) {
        if (currentInfra.title) {
            if(currentInfra.explanation) currentInfra.explanation = currentInfra.explanation.trim();
            infrastructure.push(currentInfra as InfrastructureInfo);
        }
        currentInfra = { 
          id: infraTitleMatch[1].trim().toLowerCase().replace(/\s+/g, '-'),
          title: infraTitleMatch[1].trim(), 
          explanation: trimmedLine.substring(infraTitleMatch[0].length).trim()
        };
        currentInfraPropertyKey = 'explanation';
      } else if (currentInfra.title && currentInfraPropertyKey === 'explanation' && trimmedLine.length > 0 && !trimmedLine.startsWith('- **')) {
         currentInfra.explanation = (currentInfra.explanation || "") + ` ${trimmedLine.trim()}`;
      }
    } else if (parsingStage === 'conclusion') {
      if (conclusion === null) conclusion = ''; 
      conclusion += line + '\n'; 
    }
  }

  if (currentPlant.commonName) {
    if(currentPlant.description) currentPlant.description = currentPlant.description.trim();
    if(currentPlant.suitability) currentPlant.suitability = currentPlant.suitability.trim();
    if(currentPlant.keyBenefits) currentPlant.keyBenefits = currentPlant.keyBenefits.trim();
    if(currentPlant.maintenanceTips) currentPlant.maintenanceTips = currentPlant.maintenanceTips.trim();
    plants.push(currentPlant as PlantInfo);
  }
  if (currentInfra.title) {
    if (currentInfra.explanation) currentInfra.explanation = currentInfra.explanation.trim();
    infrastructure.push(currentInfra as InfrastructureInfo);
  }
  
  infrastructure = infrastructure.map(item => ({
      ...item,
      explanation: item.explanation?.replace(new RegExp(`^${item.title}\\s*:\\s*`, 'i'), '').trim()
  }));


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
  preferences
}) => {
  const [selectedPlant, setSelectedPlant] = useState<PlantInfo | null>(null);
  const [favoritedPlants, setFavoritedPlants] = useState<string[]>([]);

  const { plants, infrastructure, conclusion } = useMemo(() => {
    return parseGeminiRecommendations(rawRecommendations);
  }, [rawRecommendations]);

  const toggleFavorite = (plantId: string) => {
    setFavoritedPlants(prev =>
      prev.includes(plantId) ? prev.filter(id => id !== plantId) : [...prev, plantId]
    );
  };

  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    // Plants sheet
    const plantsData = plants.map(p => ({
      "Common Name": p.commonName,
      "Scientific Name": p.scientificName,
      "Description": p.description,
      "Suitability": p.suitability,
      "Key Benefits": p.keyBenefits,
      "Maintenance Tips": p.maintenanceTips,
    }));
    const wsPlants = XLSX.utils.json_to_sheet(plantsData);
    XLSX.utils.book_append_sheet(wb, wsPlants, "Plant Recommendations");

    // Infrastructure sheet
    if (infrastructure.length > 0) {
      const infraData = infrastructure.map(i => ({
        "Title": i.title,
        "Explanation": i.explanation,
      }));
      const wsInfra = XLSX.utils.json_to_sheet(infraData);
      XLSX.utils.book_append_sheet(wb, wsInfra, "Green Infrastructure");
    }
    
    // Conclusion sheet
    if (conclusion) {
        const wsConclusion = XLSX.utils.json_to_sheet([{ Message: conclusion }]);
        XLSX.utils.book_append_sheet(wb, wsConclusion, "Conclusion");
    }

    XLSX.writeFile(wb, `PlantPal_Recommendations_${new Date().toISOString().split('T')[0]}.xlsx`);
  };


  if (isLoading) {
    return <div className="text-center py-12"><Loader size="lg" text="Crafting your PlantPal recommendations..." /></div>;
  }

  if (error) {
    return (
      <div className="text-center py-10 px-4">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500 dark:text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-xl font-semibold text-red-700 dark:text-red-400 mb-2">Oh no! Something went awry.</h3>
        <p className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-800/30 p-3 rounded-md text-sm mb-6 shadow-sm border border-red-200 dark:border-red-600/30">Details: {error}</p>
        <div className="flex flex-col sm:flex-row justify-center space-y-3 sm:space-y-0 sm:space-x-4">
            <Button onClick={onRefine} variant="secondary" size="md">Adjust & Retry</Button>
            <Button onClick={onReset} variant="danger" size="md">Start Over</Button>
        </div>
      </div>
    );
  }

  if (!rawRecommendations || plants.length === 0) {
    return (
      <div className="text-center py-10 px-4">
         <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-slate-400 dark:text-slate-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-slate-500 dark:text-slate-400 text-lg mb-6">No recommendations found. Try refining preferences.</p>
        <Button onClick={onRefine} variant="primary" size="lg">Adjust Preferences</Button>
      </div>
    );
  }
  
  const subtitleText = selectedPlant 
    ? `Details for ${selectedPlant.commonName}` 
    : (preferences?.plantType 
        ? `Based on your preference for ${preferences.plantType.toLowerCase()}` 
        : "Based on your unique preferences");


  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-emerald-700 dark:text-emerald-300 mb-1 tracking-tight">
          Plant Recommendations
        </h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm sm:text-md">{subtitleText}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
        {plants.map((plant) => (
          <PlantCard
            key={plant.id}
            plant={plant}
            isSelected={selectedPlant?.id === plant.id}
            onClick={() => setSelectedPlant(plant)}
            onAddToFavorites={() => toggleFavorite(plant.id)}
            isFavorite={favoritedPlants.includes(plant.id)}
          />
        ))}
      </div>

      {infrastructure.length > 0 && (
        <div className="pt-4">
          <h3 className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 mb-3 text-center sm:text-left">Green Infrastructure Ideas</h3>
          <div className="space-y-4">
            {infrastructure.map(item => (
              <div key={item.id} className="p-4 bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600/70 rounded-lg shadow-sm">
                <div className="flex items-center mb-1.5">
                    <PlantPalIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 mr-2 flex-shrink-0" />
                    <h4 className="font-semibold text-emerald-700 dark:text-emerald-300 text-md">{item.title}</h4>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed ml-7">{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {conclusion && (
         <div className="pt-4">
            <h3 className="text-xl sm:text-2xl font-bold text-emerald-700 dark:text-emerald-300 mb-3 text-center sm:text-left">Final Thoughts</h3>
            <div className="p-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg text-sm text-slate-700 dark:text-slate-300 leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                {conclusion.split('\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
         </div>
      )}


      <div className="flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-4 pt-4">
        <Button onClick={onRefine} variant="outline" size="lg" className="shadow-sm w-full sm:w-auto">
          Refine Preferences
        </Button>
        <Button onClick={handleDownloadExcel} variant="secondary" size="lg" className="shadow-sm w-full sm:w-auto" icon={<DownloadIcon />}>
            Download Excel
        </Button>
        <Button onClick={onReset} variant="primary" size="lg" className="shadow-sm w-full sm:w-auto">
          Start New Plan
        </Button>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500 text-center pt-1 italic">
        PlantPal provides AI suggestions. Always verify with local horticultural experts.
      </p>

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