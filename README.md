<div align="center">

# 🌿 PlantPal

### The AI-Powered Living Ecosystem Assistant

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-2.0-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

*Transform urban spaces into climate-resilient, biodiverse, and livable environments using real-time environmental data.*

</div>

---

## ✨ Overview

PlantPal is an advanced, AI-powered urban sustainability platform. It goes beyond simple plant recommendations by dynamically integrating **8+ free real-time APIs** covering hyper-local weather, soil composition, air quality, solar positioning, and biodiversity. 

Powered by **Google's Gemini 2.0 AI**, PlantPal synthesizes this immense wealth of environmental data against your personal preferences to generate deeply personalized, location-aware answers. Every recommendation is specific to **you, your location, and this precise moment in time**.

## 🚀 Features

### 🧠 Environmental Intelligence
- **Real-Time Weather & Air Quality**: Integrates Open-Meteo to track live temperature, humidity, UV index, PM2.5/PM10 pollutants, Ozone, and live pollen counts.
- **Satellite Soil Analysis**: Utilizes ISRIC SoilGrids to instantly determine your local soil class, pH, texture breakdown (sand/silt/clay), and organic carbon without requiring manual tests.
- **Micro-Climate & Topography**: Fetches elevation data and runs calculations for precise sunrise, sunset, daylight hours, and moon phrasing (using Open-Elevation and Sunrise-Sunset APIs).
- **Climate Trend Forecaster**: Leverages 30-year CMIP6 climate models to predict temperature shifts, identify hardiness zones, and forecast frost dates—helping you plant for the future, not just today.
- **Local Biodiversity Mapping**: Queries the GBIF network to determine exactly how many native plants and animals live within 10km of your backyard.

### 🌿 The Garden Toolkit
- **Plant Doctor (Health Scanner)**: Upload a photo of a sick plant. The Gemini AI will diagnose the issue by cross-referencing visual symptoms with your live local weather (e.g., high humidity = fungal risk).
- **Carbon Dashboard**: Quantify your garden's exact CO₂ sequestration impact and see how it combats your neighborhood's live Air Quality Index.
- **Pollinator Pathway**: Calculates "hunger gaps" in your garden's blooming schedule and recommends specific native plants to attract the exact insect species currently living in your zip code.
- **Harvest Tracker**: Log your edible yields. The AI acts as a chef to provide garden-to-table recipes and preservation strategies tailored to your growing season.
- **Companion Matrix**: Discover which plants thrive together and which are antagonistic.

### 🛠️ Advanced Design Tools
- **Micro-Climate Mapper**: Divide your yard into distinct zones (hot/dry, cool/shady) and get recommendations tailored to the exact topography of each corner.
- **Community Green Map**: Visualize what your neighbors are planting to coordinate local ecosystem corridors.
- **Time-Lapse Simulator**: Fast-forward 1, 5, or 10 years to see how your trees and shrubs will mature over time.
- **Voice Assistant**: A hands-free dictation tool for logging garden tasks while your hands are covered in dirt.

---

## 🛠️ Tech Stack & Real-Time Data Integrations

### Core Technology
| Category | Technology |
|----------|------------|
| **Framework** | React 19 + TypeScript 5 |
| **Styling** | Tailwind CSS (Dark/Light mode native) |
| **AI Model** | Google Gemini API (`@google/genai`) |
| **State Management**| React `useState` / `useMemo` / LocalStorage Cache |
| **Build Tool** | Vite 6 |

### Real-Time Data Pipeline
| Provider | Data Fetched |
|----------|--------------|
| **Open-Meteo Weather** | Live temp, humidity, wind, 7-day forecast |
| **Open-Meteo Air Quality** | US/EU AQI, PM2.5, PM10, Ozone, Pollen (Alder, Birch, Grass, etc.) |
| **Open-Meteo Soil** | Soil temps (0-28cm), volumetric moisture, evapotranspiration |
| **Open-Meteo Climate** | 30-year historical trends, 2050/2080 CMIP6 projections, frost dates |
| **ISRIC SoilGrids** | Global 250m resolution soil classification, pH, organics |
| **GBIF API** | Local biodiversity metrics, native species lists, invasive alerts |
| **Sunrise-Sunset API** | Solar noon, twilight, absolute daylight hours, moon phases |
| **Open-Elevation** | Topographical meters above sea level |

---

## 📖 How to Use

### Step 1: Establish Your Location
PlantPal requires a location to function. Click "Use Current Location" (GPS) or manually search for your city.
*The app will instantly fire parallel requests to all 8 APIs to build your unique "Environmental Profile."*

### Step 2: Set Preferences
Browse your Environmental Snapshot. Tell PlantPal your specific constraints:
- Available sunlight hours
- Drought tolerance and watering habits
- Project size and max plant heights
- Urban planning goals (e.g., "attract birds" or "block wind")

### Step 3: Get AI Recommendations
PlantPal synthesizes your preferences with the massive environmental profile dataset. The Gemini AI will return highly practical, location-native plant recommendations and green infrastructure ideas (like building a rain garden or a hugelkultur mound).

### Step 4: Manage Your Living Spaces
Save plants to your **Garden Dashboard**. Use the sidebar to track harvests, diagnose diseases with the **Plant Doctor**, or map out a **Pollinator Pathway**.

---

## 💻 Local Development

### Prerequisites
- Node.js 18+ 
- npm or yarn
- Gemini API key ([Get one free here](https://aistudio.google.com/app/apikey))

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/plantpal.git
   cd plantpal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   Create a `.env` file in the project root:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open in browser** Navigate to `http://localhost:5173`

---

## 🔑 AI Fallback System & Quota Management

Because PlantPal relies heavily on LLM generation, it is built to be resilient:
1. **Model Fallback**: If `gemini-2.5-flash` is unavailable, it automatically degrades to `gemini-2.0-pro-exp`, then `gemini-2.5-pro` to ensure the user always gets a response.
2. **User API Key Support**: If the developer's default API key hits a rate limit (Quota Exceeded), a graceful modal appears allowing the user to safely inject their own personal Gemini API key to continue uninterrupted.
3. **Smart Data Caching**: Heavy environmental API calls are cached in `localStorage`. Fast-moving data (AQI) lives for 15 minutes, while static data (SoilGrids, Elevation) lives for 30 days to save bandwidth.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<div align="center">

### 🌱 Cultivating a greener tomorrow, one plant at a time.

Made with 💚 by Anupam

*AI recommendations are suggestions only. Always consult local horticultural experts and community resources before undertaking major landscaping projects.*

</div>
