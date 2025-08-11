/// <reference types="react" />

/**
 * @jsx React.createElement
 * @jsxFrag React.Fragment
 */
// Fix: Added React import for JSX support.
import React from 'react';
import type { SunlightExposure, WateringFrequency, PlantingAreaSize, HeightClearance } from './types';
import { SunlightExposure as SE, WateringFrequency as WF, PlantingAreaSize as PAS, HeightClearance as HC } from './types'; // Import enum values for use

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
];

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
    "Flowers",
    "Vegetables",
    "Fruits",
    "Herbs",
    "Trees (Small)",
    "Trees (Medium)",
    "Trees (Large)",
    "Shrubs",
    "Ground Cover",
    "Vines",
    "Grasses (Ornamental)",
    "Succulents/Cacti",
    "Native Wildflowers",
    "Pollinator Plants",
];


// SVG Icons - Updated for Green Theme
export const SunIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor", // Will inherit color from parent
      className: className || "w-5 h-5"
    },
    React.createElement('path', {
      d: "M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.166 7.758a.75.75 0 001.06-1.06L5.634 5.106a.75.75 0 00-1.06 1.06L6.166 7.758z"
    })
  )
);

export const WaterDropIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: className || "w-5 h-5"
    },
     React.createElement('path', {
      d: "M12 2.25c-5.385 0-9.75 4.365-9.75 9.75 0 2.14.696 4.112 1.887 5.778.322.449.233 1.073-.202 1.399a.75.75 0 01-1.008-.29C1.15 17.191 0 14.684 0 12 0 5.373 5.373 0 12 0s12 5.373 12 12c0 2.684-1.15 5.191-2.675 6.937a.75.75 0 01-1.008.29.75.75 0 01-.202-1.399A9.68 9.68 0 0021.75 12c0-5.385-4.365-9.75-9.75-9.75zm0 3.92a3.583 3.583 0 00-2.907 5.548 5.08 5.08 0 00-.436 1.707.75.75 0 001.488.152 3.582 3.582 0 00.308-1.21A2.083 2.083 0 1112 14.57a2.083 2.083 0 01-1.573-3.39 3.582 3.582 0 00.308 1.21.75.75 0 001.488-.152 5.08 5.08 0 00-.436-1.707A3.583 3.583 0 0012 6.17z"
    })
  )
);

export const RulerIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: className || "w-5 h-5"
    },
    React.createElement('path', {
      d: "M20.25 2.25H3.75A1.5 1.5 0 002.25 3.75v16.5A1.5 1.5 0 003.75 21.75h16.5A1.5 1.5 0 0021.75 20.25V3.75A1.5 1.5 0 0020.25 2.25zM9.75 6a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3a.75.75 0 01-.75-.75zm0 3a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3A.75.75 0 019.75 9zm0 3a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3a.75.75 0 01-.75-.75zm0 3a.75.75 0 01.75-.75h3a.75.75 0 010 1.5h-3a.75.75 0 01-.75-.75zm-3-7.5a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v3a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-3zm0 4.5a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v3a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-3zm10.5-3a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v3a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-3zm0 4.5a.75.75 0 01.75-.75h.008a.75.75 0 01.75.75v3a.75.75 0 01-.75.75h-.008a.75.75 0 01-.75-.75v-3z"
    })
  )
);

export const TreeIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: className || "w-5 h-5"
    },
    React.createElement('path', {
      d: "M12 21.75c-1.32 0-2.56-.384-3.621-1.047a11.157 11.157 0 01-3.622-3.622C4.06 15.92 3.75 14.65 3.75 13.28V12A9.75 9.75 0 0113.5 2.25c3.901 0 7.25 2.356 8.625 5.759A.75.75 0 0121.39 9h0a.75.75 0 01-.668.475 9.001 9.001 0 00-7.222 7.222.75.75 0 01-.475.668h0a.75.75 0 01-.981-.736A7.412 7.412 0 0113.5 9 7.5 7.5 0 006 16.5c0 .71.098 1.398.28 2.048.195.684.713 1.202 1.398 1.398.65.182 1.339.28 2.048.28h4.547a.75.75 0 010 1.524H12z"
    }),
    React.createElement('path', {
        d: "M18 11.25a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5H18.75a.75.75 0 01-.75-.75zM14.25 15.75a.75.75 0 01.75-.75h2.25a.75.75 0 010 1.5H15a.75.75 0 01-.75-.75zM12.75 10.5a.75.75 0 00-1.5 0v3a.75.75 0 001.5 0v-3z"
    })
  )
);

export const GoalsIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: className || "w-5 h-5"
    },
    React.createElement('path', {
      d: "M10.5 1.519c.844-.277 1.758-.277 2.601 0l6.008 1.968A.75.75 0 0120.25 4.2v4.861C20.25 14.79 16.894 19.5 12 19.5s-8.25-4.71-8.25-10.44V4.2a.75.75 0 011.14-.712l6.007-1.969zm0 1.54l-5.043 1.652v4.273c0 4.737 2.93 8.697 6.543 9.919 3.613-1.222 6.543-5.182 6.543-9.919V4.71L13.1 3.058a.365.365 0 00-.698 0L10.5 3.06z"
    }),
    React.createElement('path', {
      d: "M12 6.75a.75.75 0 01.75.75v3.525l2.072 1.184a.75.75 0 01-.75 1.3L12 12.675V7.5a.75.75 0 01.75-.75z"
    })
  )
);

export const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
    React.createElement(
      'svg',
      {
        xmlns: "http://www.w3.org/2000/svg",
        fill: "none",
        viewBox: "0 0 24 24",
        strokeWidth: "1.5",
        stroke: "currentColor",
        className: className || "w-5 h-5"
      },
      React.createElement('path', {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        d: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
      })
    )
);

// Updated PlantPalIcon to a leaf
export const PlantPalIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor", // Uses text color, adaptable to green theme
      className: className || "w-12 h-12"
    },
    React.createElement('path', {
      d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"
    }),
    React.createElement('path', {
      d: "M15.813 8.313C14.75 7.016 12.375 6 12 6c-2.75 0-5.5 1.625-5.5 5.5 0 2.063 1.063 3.875 2.625 4.938.5.313.875.938.875 1.563v.5h5v-.5c0-.625.375-1.25.875-1.563C17.438 15.375 18.5 13.563 18.5 11.5c0-1.156-.375-2.25-1.063-3.188zM12 16c-1.65 0-3-1.35-3-3s1.35-3 3-3 3 1.35 3 3-1.35 3-3 3z"
    })
  )
);


export const DownloadIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 1.5,
      stroke: "currentColor",
      className: className || "w-5 h-5"
    },
    React.createElement('path', {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
    })
  )
);

// Theme Icons
export const MoonIcon: React.FC<{ className?: string }> = ({ className }) => (
  React.createElement(
    'svg',
    {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 1.5,
      stroke: "currentColor",
      className: className || "w-6 h-6"
    },
    React.createElement('path', {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z"
    })
  )
);

// ImagePlaceholderIcon and ImageErrorIcon removed as they are no longer used.

export const GEMINI_MODEL_NAME = 'gemini-1.5-flash';
export const GEMINI_IMAGE_MODEL_NAME = 'imagen-3.0-generate-002';