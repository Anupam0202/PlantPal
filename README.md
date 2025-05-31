
# PlantPal: Green Urban Planning Assistant

PlantPal is an AI-powered urban sustainability platform designed to assist city planners, community organizers, and residents in transforming urban spaces into more climate-resilient, biodiverse, and livable environments. It leverages the Gemini API and geospatial data to provide customized recommendations for native plant species and green infrastructure.

## Features

*   **AI-Powered Recommendations:** Get tailored suggestions for plants and green infrastructure powered by Google's Gemini API.
*   **Location-Based Analysis:**
    *   Automatically fetch environmental data using your current browser location.
    *   Manually input latitude and longitude for specific site analysis.
*   **Customizable Preferences:** Fine-tune recommendations based on:
    *   Sunlight exposure and hours.
    *   Watering frequency and drought tolerance.
    *   Planting area size (pre-defined or custom).
    *   Vertical height clearance.
    *   Desired plant types.
    *   Overall project area size.
    *   Specific urban planning goals (e.g., biodiversity, urban cooling).
*   **Interactive Recommendation Display:**
    *   View plant recommendations in a clean, card-based interface.
    *   Click on plants to see detailed descriptions, suitability, benefits, and maintenance tips in a modal.
    *   Mark plants as favorites.
    *   Explore relevant green infrastructure ideas.
*   **Excel Export:** Download your plant and green infrastructure recommendations as an `.xlsx` file for offline use and planning.
*   **Light & Dark Mode:** Choose your preferred theme for comfortable viewing.
*   **Responsive Design:** Works across various devices (desktop, tablet, mobile).
*   **User-Friendly Interface:** Clean, intuitive, and step-by-step process.

## Tech Stack

*   **Frontend:** React, TypeScript, Tailwind CSS
*   **AI Model:** Google Gemini API (via `@google/genai` library)
*   **Weather Data:** Open-Meteo API
*   **Excel Export:** SheetJS (xlsx)
*   **Build/Serving:** Served as static files with ES Modules via import maps.

## Prerequisites

*   A modern web browser (e.g., Chrome, Firefox, Safari, Edge).
*   A valid Gemini API Key.

## Getting Started

### 1. API Key Configuration (Administrator/Developer Task)

PlantPal requires a Google Gemini API key to function. This key **must** be configured as an environment variable named `API_KEY` by the administrator or developer *before* the application is built or served.

**The application code (`services/geminiService.ts`) is designed to read this key directly from `process.env.API_KEY`. Users of the application do not (and cannot) enter the API key through the UI.**

If you are developing or deploying this application, ensure that the environment where the application's JavaScript is processed (e.g., during a build step or on a server that pre-processes JS) has access to this `API_KEY`. For simple static serving without a build process that injects environment variables, you might need to manually replace `process.env.API_KEY` in `geminiService.ts` with your actual key (this is generally **not recommended for production** due to security concerns but might be necessary for local testing if no build process is used).

Example (conceptual, how `process.env.API_KEY` is used):
```javascript
// In services/geminiService.ts
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
```

### 2. Serving the Application

Since this project is set up with ES Modules and `importmap` in `index.html`, you can serve it using any simple HTTP server.

1.  **Clone/Download:** Get the project files (`index.html`, `index.tsx`, `App.tsx`, `components/`, `services/`, `types.ts`, `constants.ts`).
2.  **Navigate to Project Directory:** Open your terminal or command prompt and go to the root directory of the project.
3.  **Start an HTTP Server:**
    *   If you have Node.js installed, you can use `npx serve`:
        ```bash
        npx serve
        ```
    *   If you have Python installed:
        ```bash
        python -m http.server
        ```
    *   Or use any other static file server.
4.  **Access in Browser:** Open your web browser and navigate to the address provided by the server (e.g., `http://localhost:3000` or `http://localhost:8000`).

## How to Use PlantPal

1.  **Initialization:** The app will first validate the pre-configured Gemini API key.
2.  **Step 1: Location & Environment**
    *   **Use My Current Location:** Click this button and grant location permissions to automatically fetch your coordinates and local weather data.
    *   **Or Enter Manually:** Provide a location name (optional), latitude, and longitude.
    *   Click "Set Location & Continue".
3.  **Step 2: Your Preferences**
    *   The "Environmental Snapshot" will display current weather conditions for the chosen location.
    *   Fill out the form detailing your preferences for sunlight, watering, space, plant types, and project goals.
    *   Click "Get PlantPal Recommendations".
4.  **Step 3: Plant Recommendations**
    *   View the AI-generated list of recommended plants. Click on any plant card to see more details in a modal (description, suitability, benefits, maintenance).
    *   Mark plants as favorites.
    *   Review suggested Green Infrastructure Ideas.
    *   Read the concluding remarks.
    *   **Download Excel:** Save the recommendations for offline use.
    *   **Refine Preferences:** Go back to Step 2 to adjust your inputs and get new recommendations.
    *   **Start New Plan:** Reset the application and begin from Step 1.
5.  **Theme Toggle:** Use the sun/moon icon in the top right corner to switch between light and dark modes.

## Project Structure (Key Files)

```
.
├── index.html              # Main HTML entry point, includes importmap
├── index.tsx               # React root rendering
├── App.tsx                 # Main application component, manages steps and state
├── metadata.json           # Application metadata
├── Readme.md               # This file
├── requirements.txt        # List of CDN libraries used
├── components/             # UI components
│   ├── common/             # Reusable common components (Button, Select, etc.)
│   ├── ApiKeyInput.tsx     # (Note: API key input by user is NOT part of current flow)
│   ├── EnvironmentalDataDisplay.tsx
│   ├── LocationInput.tsx
│   ├── PlantCard.tsx
│   ├── PlantDetailModal.tsx
│   ├── PreferencesForm.tsx
│   └── RecommendationsDisplay.tsx
├── services/               # API interaction logic
│   ├── geminiService.ts    # Gemini API calls
│   ├── geolocationService.ts # Browser geolocation
│   └── weatherService.ts   # Open-Meteo API calls
├── types.ts                # TypeScript type definitions
└── constants.ts            # Constants, SVG icons, static options
```

Enjoy planning your green urban spaces with PlantPal!
