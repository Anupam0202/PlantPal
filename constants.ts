import React from 'react';
import type { SunlightExposure, WateringFrequency, PlantingAreaSize, HeightClearance } from './types';
import { SunlightExposure as SE, WateringFrequency as WF, PlantingAreaSize as PAS, HeightClearance as HC } from './types';

// Gemini Model Configuration with Fallbacks
export const GEMINI_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro',
  'gemini-pro',
] as const;

export const GEMINI_MODEL_NAME = GEMINI_MODELS[0];

// Image Generation Models
export const GEMINI_IMAGE_MODEL_NAME = 'imagen-3.0-generate-002';
export const GEMINI_IMAGE_FALLBACK_MODELS = [
  'imagen-3.0-generate-002',
  'imagen-3.0-generate-001',
] as const;

// Planning Goals
export const PLANNING_GOALS: string[] = [
  "Biodiversity Enhancement",
  "Flood Mitigation",
  "Urban Cooling",
  "Air Quality Improvement",
  "Wildlife Habitat",
  "Community Garden",
  "Water Conservation",
  "Soil Health Improvement",
  "Native Species Restoration",
  "Carbon Sequestration",
  "Noise Reduction",
  "Mental Health & Wellbeing",
  "Food Security",
  "Pollinator Support",
  "Aesthetic Beautification",
];

// Form Options
export const SUNLIGHT_EXPOSURE_OPTIONS: SunlightExposure[] = [
  SE.FULL_SUN,
  SE.PARTIAL_SHADE,
  SE.FULL_SHADE,
];

export const WATERING_FREQUENCY_OPTIONS: WateringFrequency[] = [
  WF.DAILY,
  WF.EVERY_FEW_DAYS,
  WF.WEEKLY,
  WF.BI_WEEKLY_OR_LESS,
];

export const PLANTING_AREA_SIZE_OPTIONS: PlantingAreaSize[] = [
  PAS.SMALL,
  PAS.MEDIUM,
  PAS.LARGE,
  PAS.CUSTOM,
];

export const HEIGHT_CLEARANCE_OPTIONS: HeightClearance[] = [
  HC.NO_LIMIT,
  HC.UNDER_3_FT,
  HC.BETWEEN_3_AND_6_FT,
  HC.OVER_6_FT,
];

export const PLANT_TYPE_SUGGESTIONS: string[] = [
  "Flowers", "Vegetables", "Fruits", "Herbs", "Trees (Small)", "Trees (Medium)",
  "Trees (Large)", "Shrubs", "Ground Cover", "Vines", "Grasses (Ornamental)",
  "Succulents/Cacti", "Native Wildflowers", "Pollinator Plants", "Edible Plants",
  "Medicinal Plants", "Aquatic Plants", "Shade Plants",
];

export const SOIL_TYPE_OPTIONS: string[] = [
  "Clay", "Sandy", "Loamy", "Silty", "Peaty", "Chalky", "Unknown/Mixed",
];

export const CLIMATE_ZONE_OPTIONS: string[] = [
  "Tropical", "Subtropical", "Mediterranean", "Temperate", "Continental",
  "Arid/Desert", "Semi-Arid", "Oceanic", "Subarctic",
];

export const MAINTENANCE_LEVELS = [
  { value: 'low', label: 'Low', description: 'Minimal care needed' },
  { value: 'medium', label: 'Medium', description: 'Regular attention' },
  { value: 'high', label: 'High', description: 'Frequent care required' },
] as const;

// ===== ICON COMPONENTS =====
interface IconProps {
  className?: string;
  filled?: boolean;
}

export const SunIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "currentColor",
  className: className
}, React.createElement('path', {
  d: "M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.166 7.758a.75.75 0 001.06-1.06L5.634 5.106a.75.75 0 00-1.06 1.06L6.166 7.758z"
}));

export const MoonIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
}));

export const WaterDropIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "currentColor",
  className: className
}, React.createElement('path', {
  fillRule: "evenodd",
  d: "M12 2.25c-2.429 0-4.817.178-7.152.521C2.87 3.061 1.5 4.795 1.5 6.741v6.018c0 1.946 1.37 3.68 3.348 3.97 2.335.343 4.723.521 7.152.521s4.817-.178 7.152-.521c1.978-.29 3.348-2.024 3.348-3.97V6.741c0-1.946-1.37-3.68-3.348-3.97A49.145 49.145 0 0012 2.25zM8.25 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25zm5.625 1.125a1.125 1.125 0 10-2.25 0 1.125 1.125 0 002.25 0zM15.75 8.625a1.125 1.125 0 100 2.25 1.125 1.125 0 000-2.25z",
  clipRule: "evenodd"
}), React.createElement('path', {
  d: "M2.25 18.563A48.7 48.7 0 0012 20.25a48.7 48.7 0 009.75-1.688v1.688a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25v-1.688z"
}));

export const RulerIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15"
}));

export const TreeIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z"
}));

export const GoalsIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M3 3v1.5M3 21v-6m0 0l2.77-.693a9 9 0 016.208.682l.108.054a9 9 0 006.086.71l3.114-.732a48.524 48.524 0 01-.005-10.499l-3.11.732a9 9 0 01-6.085-.711l-.108-.054a9 9 0 00-6.208-.682L3 4.5M3 15V4.5"
}));

export const InfoIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
}));

export const PlantPalIcon: React.FC<IconProps> = ({ className = "w-12 h-12" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "currentColor",
  className: className
}, React.createElement('path', {
  d: "M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z"
}));

export const LeafIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "currentColor",
  className: className
}, React.createElement('path', {
  d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
}));

export const DownloadIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
}));

export const LocationIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z"
}), React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z"
}));

export const HeartIcon: React.FC<IconProps> = ({ className = "w-5 h-5", filled = false }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: filled ? "currentColor" : "none",
  viewBox: "0 0 24 24",
  strokeWidth: filled ? 0 : 1.5,
  stroke: filled ? "none" : "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
}));

export const ShareIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z"
}));

export const RefreshIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
}));

export const CloseIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M6 18L18 6M6 6l12 12"
}));

export const CheckIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 2,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M4.5 12.75l6 6 9-13.5"
}));

export const SparklesIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
}));

export const GridIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
}));

export const ListIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
}));

export const FilterIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z"
}));

export const ExternalLinkIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
}));

export const ImageIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
}));

export const ChevronDownIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 2,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M19.5 8.25l-7.5 7.5-7.5-7.5"
}));

export const ChevronRightIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 2,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M8.25 4.5l7.5 7.5-7.5 7.5"
}));

export const SearchIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
}));

export const ClearIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
}));

export const LoadingSpinnerIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  className: `animate-spin ${className}`,
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24"
}, React.createElement('circle', {
  className: "opacity-25",
  cx: "12",
  cy: "12",
  r: "10",
  stroke: "currentColor",
  strokeWidth: "4"
}), React.createElement('path', {
  className: "opacity-75",
  fill: "currentColor",
  d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
}));

export const CloudIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z"
}));

export const WindIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => React.createElement('svg', {
  xmlns: "http://www.w3.org/2000/svg",
  fill: "none",
  viewBox: "0 0 24 24",
  strokeWidth: 1.5,
  stroke: "currentColor",
  className: className
}, React.createElement('path', {
  strokeLinecap: "round",
  strokeLinejoin: "round",
  d: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"
}));
