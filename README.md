<div align="center">

# 🌿 PlantPal

### AI-Powered Green Urban Planning Assistant

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-6.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Gemini AI](https://img.shields.io/badge/Gemini_AI-2.0-4285F4?logo=google&logoColor=white)](https://ai.google.dev/)

*Transform urban spaces into climate-resilient, biodiverse, and livable environments*

<img width="1907" height="858" alt="Image" src="https://github.com/user-attachments/assets/ece20b46-d688-4048-a409-96e783168fe4" />

</div>

---

## ✨ Overview

PlantPal is an AI-powered urban sustainability platform designed to assist city planners, community organizers, and residents in creating greener urban spaces. It leverages **Google's Gemini AI** and real-time weather data to provide customized recommendations for native plant species and green infrastructure suited to your specific location and preferences.

## 🚀 Features

### 🤖 AI-Powered Intelligence
- **Smart Plant Recommendations**: Get tailored suggestions powered by Google's Gemini 2.0 AI
- **Model Fallback System**: Automatic fallback between multiple Gemini models for reliability
- **Custom API Key Support**: Use your own Gemini API key if the default quota is exceeded

### 📍 Location-Aware Analysis
- **Auto-detect Location**: Use browser geolocation for instant setup
- **City Search**: Search for any city worldwide
- **Manual Coordinates**: Enter latitude/longitude for precise locations
- **Real-time Weather**: Live weather data from Open-Meteo API

### 🎛️ Comprehensive Preferences
- Sunlight exposure and daily hours
- Watering frequency and drought tolerance
- Planting area size (preset or custom dimensions)
- Height clearance requirements
- Desired plant types with smart suggestions
- Soil type and climate zone (optional)
- Maintenance level preference
- Urban planning goals (biodiversity, cooling, pollinators, etc.)

### 📊 Interactive Results
- **Grid & List Views**: Switch between display modes
- **Favorites System**: Save plants you love
- **Plant Details Modal**: In-depth info for each recommendation
- **Green Infrastructure Ideas**: Beyond just plants
- **Excel Export**: Download recommendations as `.xlsx` file
- **Social Sharing**: Share your recommendations easily

### 🎨 Premium User Experience
- **Dark/Light Mode**: Comfortable viewing any time
- **Fully Responsive**: Works on desktop, tablet, and mobile
- **Smooth Animations**: Delightful micro-interactions
- **Accessibility**: ARIA labels and keyboard navigation
- **Error Boundaries**: Graceful error handling

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | React 19 |
| **Language** | TypeScript 5 |
| **Styling** | Tailwind CSS |
| **AI Model** | Google Gemini API (`@google/genai`) |
| **Weather** | Open-Meteo API |
| **Excel Export** | SheetJS (xlsx) |
| **Build Tool** | Vite 6 |

---

## 📖 How to Use

### Step 1: Set Your Location
Choose one of three methods:
- 🔵 **Auto Detect** - Use GPS for current location
- 🔍 **Search** - Find any city by name
- ✏️ **Manual** - Enter coordinates directly

### Step 2: Configure Preferences
- View the **Environmental Snapshot** with current weather
- Fill out your preferences for sunlight, water, space, and goals
- Get AI-suggested plant types based on your goals
- Click **"Get AI Plant Recommendations"**

### Step 3: Explore Recommendations
- Browse recommended plants in grid or list view
- ❤️ Mark favorites to save for later
- Click any plant for detailed information
- Review green infrastructure ideas
- 📥 **Download Excel** for offline planning
- 🔄 **Refine Preferences** for different results

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

5. **Open in browser**
   
   Navigate to `http://localhost:3000`

### Build for Production

```bash
npm run build
npm run preview
```

---

## 📁 Project Structure

```
PlantPal/
├── 📄 index.html              # HTML entry with meta tags & favicon
├── 📄 index.tsx               # React root with ErrorBoundary
├── 📄 App.tsx                 # Main app component & routing
├── 📄 index.css               # Design system & animations
├── 📄 types.ts                # TypeScript definitions
├── 📄 constants.ts            # Constants, icons, options
├── 📄 vite.config.ts          # Vite configuration
│
├── 📁 components/
│   ├── 📁 common/             # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Checkbox.tsx
│   │   ├── Loader.tsx
│   │   ├── ProgressBar.tsx
│   │   ├── Select.tsx
│   │   ├── Slider.tsx
│   │   ├── TextInput.tsx
│   │   └── Tooltip.tsx
│   │
│   ├── ApiKeyModal.tsx        # API key input modal
│   ├── EnvironmentalDataDisplay.tsx
│   ├── ErrorBoundary.tsx      # React error boundary
│   ├── LocationInput.tsx
│   ├── PlantCard.tsx
│   ├── PlantDetailModal.tsx
│   ├── PreferencesForm.tsx
│   ├── RecommendationsDisplay.tsx
│   └── ThemeToggle.tsx
│
└── 📁 services/
    ├── geminiService.ts       # Gemini AI with fallback & key management
    ├── geolocationService.ts  # Browser geolocation utilities
    └── weatherService.ts      # Open-Meteo weather API
```

---

## 🔑 API Key Management

PlantPal supports multiple API key scenarios:

1. **Environment Variable**: Set `GEMINI_API_KEY` in `.env` (recommended for development)
2. **User-Provided Key**: If quota is exceeded, users can enter their own API key
3. **LocalStorage Persistence**: User keys are stored locally for convenience

### Getting a Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Sign in with your Google account
3. Click "Create API Key"
4. Copy the key and add to your `.env` file

---

## 🎯 Key Improvements (v2.0)

- ✅ **Robust AI Integration**: Model fallback system with rate limiting handling
- ✅ **User API Key Support**: Prompt for API key when quota exceeded
- ✅ **Enhanced Accessibility**: ARIA labels, keyboard navigation
- ✅ **Mobile Optimization**: Responsive layouts, 44px touch targets
- ✅ **SEO Improvements**: Meta tags, Open Graph, favicon
- ✅ **Error Boundaries**: Graceful error handling with recovery
- ✅ **PWA Ready**: Mobile web app meta tags
- ✅ **Security**: `.gitignore` to protect sensitive files

---


## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<div align="center">

### 🌱 Cultivating a greener tomorrow, one plant at a time.

Made with 💚 by Anupam

*AI recommendations are suggestions only. Always consult local horticultural experts for specific advice.*

</div>
