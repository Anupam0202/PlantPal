<img width="854" height="866" alt="Screenshot 2025-08-12 004422" src="https://github.com/user-attachments/assets/fdd7ea88-5db7-480d-9dae-c2016f091929" />


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

## How to Use PlantPal

1.  **Step 1: Location & Environment**
    *   **Use My Current Location:** Click this button and grant location permissions to automatically fetch your coordinates and local weather data.
    *   **Or Enter Manually:** Provide a location name (optional), latitude, and longitude.
    *   Click "Set Location & Continue".
2.  **Step 2: Your Preferences**
    *   The "Environmental Snapshot" will display current weather conditions for the chosen location.
    *   Fill out the form detailing your preferences for sunlight, watering, space, plant types, and project goals.
    *   Click "Get PlantPal Recommendations".
3.  **Step 3: Plant Recommendations**
    *   View the AI-generated list of recommended plants. Click on any plant card to see more details in a modal (description, suitability, benefits, maintenance).
    *   Mark plants as favorites.
    *   Review suggested Green Infrastructure Ideas.
    *   Read the concluding remarks.
    *   **Download Excel:** Save the recommendations for offline use.
    *   **Refine Preferences:** Go back to Step 2 to adjust your inputs and get new recommendations.
    *   **Start New Plan:** Reset the application and begin from Step 1.
4.  **Theme Toggle:** Use the sun/moon icon in the top right corner to switch between light and dark modes.

## Local Development

To run PlantPal locally, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/plantpal.git
    cd plantpal
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up your API Key:**
    Create a `.env` file in the root of the project and add your Gemini API key:
    ```
    API_KEY=YOUR_GEMINI_API_KEY
    ```
4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  Open your browser and navigate to `http://localhost:3000`.

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
