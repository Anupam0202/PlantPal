import React, { useState } from 'react';
import type { UserPreferences, SoilType, ClimateZone } from '../types';
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
  SOIL_TYPE_OPTIONS,
  CLIMATE_ZONE_OPTIONS,
  MAINTENANCE_LEVELS,
  SunIcon,
  WaterDropIcon,
  RulerIcon,
  TreeIcon,
  GoalsIcon,
  SparklesIcon,
} from '../constants';

interface PreferencesFormProps {
  onSubmit: (preferences: UserPreferences) => void;
  isLoading: boolean;
  initialPreferences?: UserPreferences | null;
}

interface FormSectionProps {
  title: string;
  description?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  isOpen?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
}

const FormSection: React.FC<FormSectionProps> = ({
  title,
  description,
  icon,
  children,
  isOpen = true,
  onToggle,
  collapsible = false
}) => (
  <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
    <button
      type="button"
      onClick={collapsible ? onToggle : undefined}
      className={`w-full p-5 flex items-center justify-between ${collapsible ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50' : 'cursor-default'} transition-colors`}
      disabled={!collapsible}
    >
      <div className="flex items-center">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/50 dark:to-teal-900/50 flex items-center justify-center mr-4">
          <span className="text-emerald-600 dark:text-emerald-400">{icon}</span>
        </div>
        <div className="text-left">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
      </div>
      {collapsible && (
        <svg
          className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </button>

    <div className={`transition-all duration-300 ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
      <div className="px-5 pb-5 space-y-5 border-t border-slate-100 dark:border-slate-700 pt-5">
        {children}
      </div>
    </div>
  </div>
);

export const PreferencesForm: React.FC<PreferencesFormProps> = ({ onSubmit, isLoading, initialPreferences }) => {
  // Form state
  const [sunlightExposure, setSunlightExposure] = useState<SunlightExposure>(initialPreferences?.sunlightExposure || SunlightExposure.FULL_SUN);
  const [sunlightHours, setSunlightHours] = useState<number>(initialPreferences?.sunlightHours || 6);
  const [wateringFrequency, setWateringFrequency] = useState<WateringFrequency>(initialPreferences?.wateringFrequency || WateringFrequency.WEEKLY);
  const [droughtTolerant, setDroughtTolerant] = useState<boolean>(initialPreferences?.droughtTolerant || false);
  const [plantingAreaSize, setPlantingAreaSize] = useState<PlantingAreaSize | string>(initialPreferences?.plantingAreaSize || PlantingAreaSize.MEDIUM);
  const [customPlantingAreaSize, setCustomPlantingAreaSize] = useState<string>(initialPreferences?.customPlantingAreaSize || '');
  const [heightClearance, setHeightClearance] = useState<HeightClearance>(initialPreferences?.heightClearance || HeightClearance.NO_LIMIT);
  const [plantType, setPlantType] = useState<string>(initialPreferences?.plantType || '');
  const [planningGoals, setPlanningGoals] = useState<string[]>(initialPreferences?.planningGoals || []);
  const [projectArea, setProjectArea] = useState<string>(initialPreferences?.projectArea || '');
  const [soilType, setSoilType] = useState<SoilType | undefined>(initialPreferences?.soilType);
  const [climateZone, setClimateZone] = useState<ClimateZone | undefined>(initialPreferences?.climateZone);
  const [maintenanceLevel, setMaintenanceLevel] = useState<'low' | 'medium' | 'high' | undefined>(initialPreferences?.maintenanceLevel);

  // Suggested plant types based on goals
  const suggestedPlantTypes = React.useMemo(() => {
    const suggestions: string[] = [];
    if (planningGoals.includes('Pollinator Support')) suggestions.push('Pollinator Plants', 'Native Wildflowers');
    if (planningGoals.includes('Food Security')) suggestions.push('Vegetables', 'Fruits', 'Herbs');
    if (planningGoals.includes('Urban Cooling')) suggestions.push('Trees (Large)', 'Trees (Medium)');
    if (planningGoals.includes('Biodiversity Enhancement')) suggestions.push('Native Wildflowers', 'Shrubs');
    return [...new Set(suggestions)];
  }, [planningGoals]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const finalPlantingAreaSize = plantingAreaSize === PlantingAreaSize.CUSTOM
      ? `Custom: ${customPlantingAreaSize.trim() || 'Not specified'}`
      : plantingAreaSize;

    onSubmit({
      sunlightExposure,
      sunlightHours,
      wateringFrequency,
      droughtTolerant,
      plantingAreaSize: finalPlantingAreaSize,
      customPlantingAreaSize: plantingAreaSize === PlantingAreaSize.CUSTOM ? customPlantingAreaSize.trim() : undefined,
      heightClearance,
      plantType: plantType.trim(),
      planningGoals,
      projectArea: projectArea.trim(),
      soilType,
      climateZone,
      maintenanceLevel,
    });
  };

  const isFormValid = planningGoals.length > 0;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Sunlight Section */}
      <FormSection
        title="Sunlight Conditions"
        description="How much sun does your space receive?"
        icon={<SunIcon className="w-6 h-6" />}
      >
        <Select
          label="Sunlight Exposure"
          options={SUNLIGHT_EXPOSURE_OPTIONS.map(s => ({ value: s, label: s }))}
          value={sunlightExposure}
          onChange={(value) => setSunlightExposure(value as SunlightExposure)}
          tooltip="Select the typical daily sunlight your planting area receives"
        />

        <Slider
          label="Hours of Direct Sunlight"
          min={0}
          max={12}
          step={1}
          value={sunlightHours}
          onChange={setSunlightHours}
          unit=" hrs"
          variant="gradient"
          showMarks
          marks={[
            { value: 0, label: '0h' },
            { value: 3, label: '3h' },
            { value: 6, label: '6h' },
            { value: 9, label: '9h' },
            { value: 12, label: '12h' },
          ]}
          tooltip="Estimate the hours of direct sun your space receives daily"
          labelIcon={<SunIcon className="w-5 h-5" />}
        />
      </FormSection>

      {/* Water Section */}
      <FormSection
        title="Watering Preferences"
        description="Your watering schedule and preferences"
        icon={<WaterDropIcon className="w-6 h-6" />}
      >
        <Select
          label="Watering Frequency"
          options={WATERING_FREQUENCY_OPTIONS.map(w => ({ value: w, label: w }))}
          value={wateringFrequency}
          onChange={(value) => setWateringFrequency(value as WateringFrequency)}
          tooltip="How often can you commit to watering?"
        />

        <Checkbox
          label="Prefer drought-tolerant plants"
          description="Great for low-maintenance gardens or water-conscious areas"
          checked={droughtTolerant}
          onChange={(e) => setDroughtTolerant(e.target.checked)}
          variant="card"
        />
      </FormSection>

      {/* Space Section */}
      <FormSection
        title="Space & Dimensions"
        description="Define your planting area"
        icon={<RulerIcon className="w-6 h-6" />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Select
            label="Planting Area Size"
            options={PLANTING_AREA_SIZE_OPTIONS.map(s => ({ value: s, label: s }))}
            value={plantingAreaSize}
            onChange={(value) => setPlantingAreaSize(value as PlantingAreaSize)}
            tooltip="Approximate size of your planting space"
          />

          <Select
            label="Height Clearance"
            options={HEIGHT_CLEARANCE_OPTIONS.map(h => ({ value: h, label: h }))}
            value={heightClearance}
            onChange={(value) => setHeightClearance(value as HeightClearance)}
            tooltip="Maximum height for plants (consider overhead structures)"
          />
        </div>

        {plantingAreaSize === PlantingAreaSize.CUSTOM && (
          <TextInput
            label="Custom Area Size"
            value={customPlantingAreaSize}
            onChange={(e) => setCustomPlantingAreaSize(e.target.value)}
            placeholder="e.g., 20 sq ft, 2m x 3m, 10 x 15 feet"
            required
            tooltip="Specify your exact planting area dimensions"
          />
        )}

        <TextInput
          label="Total Project Area"
          value={projectArea}
          onChange={(e) => setProjectArea(e.target.value)}
          placeholder="e.g., 500 sq ft backyard, 50m² rooftop"
          helperText="The overall size of your green planning project"
        />
      </FormSection>

      {/* Plant Preferences Section */}
      <FormSection
        title="Plant Preferences"
        description="What types of plants interest you?"
        icon={<TreeIcon className="w-6 h-6" />}
      >
        <TextInput
          label="Desired Plant Types"
          value={plantType}
          onChange={(e) => setPlantType(e.target.value)}
          placeholder="e.g., Flowering shrubs, Native trees, Edible herbs"
          list="plant-type-suggestions"
          helperText="Separate multiple types with commas"
        />
        <datalist id="plant-type-suggestions">
          {PLANT_TYPE_SUGGESTIONS.map(suggestion => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>

        {suggestedPlantTypes.length > 0 && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2">
              💡 Based on your goals, consider:
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestedPlantTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPlantType(prev => prev ? `${prev}, ${type}` : type)}
                  className="px-3 py-1 text-xs font-medium bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-300 dark:border-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                >
                  + {type}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Optional: Soil and Climate */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
          <Select
            label="Soil Type (Optional)"
            options={[
              { value: '', label: 'Not sure / Unknown' },
              ...SOIL_TYPE_OPTIONS.map(s => ({ value: s, label: s }))
            ]}
            value={soilType || ''}
            onChange={(value) => setSoilType(value as SoilType || undefined)}
            tooltip="If you know your soil type, it helps us recommend better-suited plants"
          />

          <Select
            label="Climate Zone (Optional)"
            options={[
              { value: '', label: 'Auto-detect from location' },
              ...CLIMATE_ZONE_OPTIONS.map(c => ({ value: c, label: c }))
            ]}
            value={climateZone || ''}
            onChange={(value) => setClimateZone(value as ClimateZone || undefined)}
            tooltip="Your climate zone affects which plants will thrive"
          />
        </div>

        {/* Maintenance Level */}
        <div className="pt-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Preferred Maintenance Level
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MAINTENANCE_LEVELS.map((level) => (
              <button
                key={level.value}
                type="button"
                onClick={() => setMaintenanceLevel(level.value as 'low' | 'medium' | 'high')}
                className={`p-4 rounded-xl border-2 transition-all duration-200 text-center ${maintenanceLevel === level.value
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 shadow-lg shadow-emerald-500/10'
                  : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 dark:hover:border-emerald-700'
                  }`}
              >
                <div className={`text-2xl mb-1 ${level.value === 'low' ? '🌿' : level.value === 'medium' ? '🌱' : '🌳'
                  }`}>
                  {level.value === 'low' ? '🌿' : level.value === 'medium' ? '🌱' : '🌳'}
                </div>
                <div className={`font-medium text-sm ${maintenanceLevel === level.value
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-slate-700 dark:text-slate-300'
                  }`}>
                  {level.label}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {level.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </FormSection>

      {/* Goals Section */}
      <FormSection
        title="Urban Planning Goals"
        description="What do you want to achieve?"
        icon={<GoalsIcon className="w-6 h-6" />}
      >
        <MultiCheckbox
          label="Select your primary goals"
          options={PLANNING_GOALS}
          selectedOptions={planningGoals}
          onChange={setPlanningGoals}
          variant="chip"
          tooltip="Choose all goals that apply to your project"
        />

        {planningGoals.length === 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center">
            <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Please select at least one goal
          </p>
        )}
      </FormSection>

      {/* Submit Button */}
      <div className="pt-4">
        <Button
          type="submit"
          variant="gradient"
          size="xl"
          fullWidth
          isLoading={isLoading}
          disabled={!isFormValid || isLoading}
          icon={<SparklesIcon className="w-5 h-5" />}
        >
          {isLoading ? 'Generating Recommendations...' : 'Get AI Plant Recommendations'}
        </Button>

        <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          Our AI will analyze your preferences and local conditions to suggest the perfect plants
        </p>
      </div>
    </form>
  );
};