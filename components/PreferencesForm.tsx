
import React, { useState, useEffect } from 'react';
import type { UserPreferences } from '../types';
import { SunlightExposure, WateringFrequency, PlantingAreaSize, HeightClearance } from '../types';
import { Button } from './common/Button';
import { Select } from './common/Select';
import { Slider } from './common/Slider';
import { Checkbox, MultiCheckbox } from './common/Checkbox';
import { TextInput } from './common/TextInput';
import {
  PLANNING_GOALS,
  SUNLIGHT_EXPOSURE_OPTIONS,
  WATERING_FREQUENCY_OPTIONS,
  PLANTING_AREA_SIZE_OPTIONS,
  HEIGHT_CLEARANCE_OPTIONS,
  PLANT_TYPE_SUGGESTIONS,
  SunIcon, WaterDropIcon, RulerIcon, TreeIcon, GoalsIcon
} from '../constants';

interface PreferencesFormProps {
  onSubmit: (preferences: UserPreferences) => void;
  isLoading: boolean;
  initialPreferences?: UserPreferences | null; 
}

const FormSection: React.FC<{title: string, icon: React.ReactNode, children: React.ReactNode}> = ({title, icon, children}) => (
    <div className="p-4 sm:p-5 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-sm bg-white dark:bg-slate-800/50 hover:shadow-lg dark:hover:shadow-slate-900/50 transition-shadow duration-300">
        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-300 mb-3.5 flex items-center">
            <span className="mr-2.5 text-emerald-500 dark:text-emerald-400">{icon}</span> {/* Icon directly colored, container bg removed */}
            {title}
        </h3>
        <div className="space-y-4">
            {children}
        </div>
    </div>
);

export const PreferencesForm: React.FC<PreferencesFormProps> = ({ onSubmit, isLoading, initialPreferences }) => {
  const [sunlightExposure, setSunlightExposure] = useState<SunlightExposure>(initialPreferences?.sunlightExposure || SunlightExposure.FULL_SUN);
  const [sunlightHours, setSunlightHours] = useState<number>(initialPreferences?.sunlightHours || 6);
  const [wateringFrequency, setWateringFrequency] = useState<WateringFrequency>(initialPreferences?.wateringFrequency || WateringFrequency.WEEKLY);
  const [droughtTolerant, setDroughtTolerant] = useState<boolean>(initialPreferences?.droughtTolerant || false);
  
  const initialPAS = initialPreferences?.plantingAreaSize || PlantingAreaSize.MEDIUM;
  const isCustomInitial = typeof initialPAS === 'string' && initialPAS.startsWith("Custom:");
  const [plantingAreaSize, setPlantingAreaSize] = useState<PlantingAreaSize | string>(isCustomInitial ? PlantingAreaSize.CUSTOM : initialPAS);
  const [customPlantingAreaSize, setCustomPlantingAreaSize] = useState<string>(isCustomInitial ? (initialPreferences?.customPlantingAreaSize || '') : (initialPreferences?.customPlantingAreaSize || ''));
  
  const [heightClearance, setHeightClearance] = useState<HeightClearance>(initialPreferences?.heightClearance || HeightClearance.NO_LIMIT);
  const [plantType, setPlantType] = useState<string>(initialPreferences?.plantType || '');
  const [planningGoals, setPlanningGoals] = useState<string[]>(initialPreferences?.planningGoals || []);
  const [projectArea, setProjectArea] = useState<string>(initialPreferences?.projectArea || '');

  useEffect(() => {
    if (initialPreferences) {
        setSunlightExposure(initialPreferences.sunlightExposure);
        setSunlightHours(initialPreferences.sunlightHours);
        setWateringFrequency(initialPreferences.wateringFrequency);
        setDroughtTolerant(initialPreferences.droughtTolerant);
        
        const currentPAS = initialPreferences.plantingAreaSize;
        if (typeof currentPAS === 'string' && currentPAS.startsWith("Custom:")) {
            setPlantingAreaSize(PlantingAreaSize.CUSTOM);
            setCustomPlantingAreaSize(initialPreferences.customPlantingAreaSize || '');
        } else {
            setPlantingAreaSize(currentPAS as PlantingAreaSize); 
            setCustomPlantingAreaSize(initialPreferences.customPlantingAreaSize || '');
        }
        
        setHeightClearance(initialPreferences.heightClearance);
        setPlantType(initialPreferences.plantType);
        setPlanningGoals(initialPreferences.planningGoals);
        setProjectArea(initialPreferences.projectArea);
    }
  }, [initialPreferences]);


  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalPAS = plantingAreaSize === PlantingAreaSize.CUSTOM 
      ? `Custom: ${customPlantingAreaSize.trim() || 'Not specified'}` 
      : plantingAreaSize;

    onSubmit({
      sunlightExposure,
      sunlightHours,
      wateringFrequency,
      droughtTolerant,
      plantingAreaSize: finalPAS,
      customPlantingAreaSize: plantingAreaSize === PlantingAreaSize.CUSTOM ? customPlantingAreaSize.trim() : undefined,
      heightClearance,
      plantType: plantType.trim(),
      planningGoals,
      projectArea: projectArea.trim(),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 mt-6">
      <FormSection title="Sunlight Conditions" icon={<SunIcon className="w-5 h-5" />}>
        <Select
          label="Sunlight Exposure"
          options={SUNLIGHT_EXPOSURE_OPTIONS.map(s => ({ value: s, label: s }))}
          value={sunlightExposure}
          onChange={(e) => setSunlightExposure(e.target.value as SunlightExposure)}
          tooltip="Select the option that best describes daily direct sunlight."
        />
        <Slider
          label="Hours of Direct Sunlight"
          min={0} max={12} step={1}
          value={sunlightHours}
          onChange={(e) => setSunlightHours(parseInt(e.target.value))}
          unit=" hours/day"
          tooltip="Estimate total direct sun hours. Observe your space throughout the day."
        />
      </FormSection>

      <FormSection title="Watering Habits" icon={<WaterDropIcon className="w-5 h-5" />}>
        <Select
          label="Watering Frequency Commitment"
          options={WATERING_FREQUENCY_OPTIONS.map(w => ({ value: w, label: w }))}
          value={wateringFrequency}
          onChange={(e) => setWateringFrequency(e.target.value as WateringFrequency)}
          tooltip="How often can you realistically water?"
        />
        <Checkbox
          label="Prefer drought-tolerant plants?"
          checked={droughtTolerant}
          onChange={(e) => setDroughtTolerant(e.target.checked)}
          tooltip="Drought-tolerant plants are great for low-maintenance or dry areas."
        />
      </FormSection>

      <FormSection title="Space Availability" icon={<RulerIcon className="w-5 h-5" />}>
        <Select
          label="Planting Area Size"
          options={PLANTING_AREA_SIZE_OPTIONS.map(s => ({ value: s, label: s }))}
          value={plantingAreaSize}
          onChange={(e) => {
              const newSize = e.target.value as PlantingAreaSize;
              setPlantingAreaSize(newSize);
          }}
          tooltip="Estimate ground space. Consider width and depth."
        />
        {plantingAreaSize === PlantingAreaSize.CUSTOM && (
          <TextInput
              label="Specify Custom Area Size"
              value={customPlantingAreaSize}
              onChange={(e) => setCustomPlantingAreaSize(e.target.value)}
              placeholder="e.g., 20 sq ft, or 2m x 3m plot"
              tooltip="Enter dimensions or total area if 'Custom Size' is selected."
              required
          />
        )}
        <Select
          label="Vertical Height Clearance"
          options={HEIGHT_CLEARANCE_OPTIONS.map(h => ({ value: h, label: h }))}
          value={heightClearance}
          onChange={(e) => setHeightClearance(e.target.value as HeightClearance)}
          tooltip="Any limits on how tall plants can grow (e.g., under balconies, power lines)?"
        />
      </FormSection>

       <FormSection title="Plant & Project Details" icon={<TreeIcon className="w-5 h-5" />}>
          <TextInput
              label="Desired Plant Type(s)"
              value={plantType}
              onChange={(e) => setPlantType(e.target.value)}
              placeholder="e.g., Flowers, Native Shrubs"
              list="plant-type-suggestions"
              tooltip="What kind of plants are you interested in? List multiple types separated by commas."
          />
          <datalist id="plant-type-suggestions">
              {PLANT_TYPE_SUGGESTIONS.map(suggestion => <option key={suggestion} value={suggestion} />)}
          </datalist>
          <TextInput
              label="Overall Project Area Size"
              value={projectArea}
              onChange={(e) => setProjectArea(e.target.value)}
              placeholder="e.g., 50 sq m, 10ft x 20ft"
              tooltip="Approximate total size of your urban greening project."
          />
      </FormSection>

      <FormSection title="Urban Planning Goals" icon={<GoalsIcon className="w-5 h-5" />}>
        <MultiCheckbox
          label="Primary Goals (select all that apply):"
          options={PLANNING_GOALS}
          selectedOptions={planningGoals}
          onChange={setPlanningGoals}
          tooltip="Choose goals your project aims to achieve. This helps tailor recommendations."
          maxHeight="max-h-52" 
        />
      </FormSection>

      <Button type="submit" variant="primary" size="lg" isLoading={isLoading} className="w-full !mt-8 py-3 text-base">
        {isLoading ? 'Generating...' : 'Get PlantPal Recommendations'}
      </Button>
    </form>
  );
};