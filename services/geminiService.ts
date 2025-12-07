import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODELS } from '../constants';

// LocalStorage key for user's API key
const USER_API_KEY_STORAGE_KEY = 'plantpal-user-gemini-api-key';

// Custom error class for quota exceeded
export class QuotaExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

// API Key Management Functions
export const getUserApiKey = (): string | null => {
  try {
    return localStorage.getItem(USER_API_KEY_STORAGE_KEY);
  } catch {
    return null;
  }
};

export const setUserApiKey = (apiKey: string): void => {
  try {
    localStorage.setItem(USER_API_KEY_STORAGE_KEY, apiKey);
  } catch (error) {
    console.error('Failed to save API key to localStorage:', error);
  }
};

export const clearUserApiKey = (): void => {
  try {
    localStorage.removeItem(USER_API_KEY_STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear API key from localStorage:', error);
  }
};

// Check if a user API key is set
export const hasUserApiKey = (): boolean => {
  return !!getUserApiKey();
};

// Initialize the GenAI client - prioritizes user's API key over environment variable
const getGenAIClient = (): GoogleGenAI => {
  // First, check for user-provided API key in localStorage
  const userApiKey = getUserApiKey();
  if (userApiKey) {
    console.log('Using user-provided API key');
    return new GoogleGenAI({ apiKey: userApiKey });
  }

  // Fall back to environment variable
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY environment variable is not set.");
    throw new Error("GEMINI_API_KEY environment variable is not set. Please add GEMINI_API_KEY to your .env file.");
  }
  console.log('Using environment API key');
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
};

// Check if error is a model-related error that should trigger fallback
const isModelNotFoundError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('not found') ||
      message.includes('not supported') ||
      message.includes('does not exist') ||
      message.includes('invalid model');
  }
  return false;
};

// Check if error is a rate limit error (429)
const isRateLimitError = (error: unknown): boolean => {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('429') ||
      message.includes('quota') ||
      message.includes('rate limit') ||
      message.includes('resource_exhausted') ||
      message.includes('exceeded');
  }
  return false;
};

// Helper to add delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Get plant recommendations from Gemini with model fallback
export const getPlantRecommendationsFromGemini = async (prompt: string): Promise<string> => {
  const ai = getGenAIClient();
  let lastError: Error | null = null;
  const errors: string[] = [];

  // Try each model in order until one works
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const modelName = GEMINI_MODELS[i];
    try {
      console.log(`Trying model: ${modelName}`);
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
        }
      });

      const textResponse = response.text;

      if (textResponse === undefined || textResponse === null) {
        throw new Error("Received an empty or undefined response from Gemini API.");
      }

      console.log(`Successfully used model: ${modelName}`);
      return textResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Model ${modelName} failed:`, errorMessage);
      lastError = error instanceof Error ? error : new Error(String(error));
      errors.push(`${modelName}: ${errorMessage.substring(0, 100)}`);

      // If it's a model-not-found or rate limit error, try the next model
      // (different models have separate quotas)
      if (isModelNotFoundError(error) || isRateLimitError(error)) {
        // Add a small delay before trying the next model to avoid hammering the API
        if (i < GEMINI_MODELS.length - 1) {
          console.log(`Waiting 1s before trying next model...`);
          await delay(1000);
        }
        continue;
      }

      // For other errors (network, auth, etc.), throw immediately
      throw new Error(`Gemini API error: ${lastError.message}`);
    }
  }

  // All models failed - provide helpful error message
  console.error("All Gemini models failed:", errors);

  // Check if all failures were rate limits - throw special error for UI handling
  const allRateLimited = errors.every(e => e.toLowerCase().includes('429') || e.toLowerCase().includes('quota'));
  if (allRateLimited) {
    throw new QuotaExceededError(
      `API quota exceeded for all models. You can add your own API key to continue using PlantPal.`
    );
  }

  throw new Error(`All Gemini models failed. Last error: ${lastError?.message || 'Unknown error'}`);
};

// Helper function to build enhanced recommendation prompt
export const buildRecommendationPrompt = (
  latitude: number,
  longitude: number,
  locationName: string | undefined,
  temperature: number,
  humidity: number,
  weatherDescription: string | undefined,
  preferences: {
    sunlightExposure: string;
    sunlightHours: number;
    wateringFrequency: string;
    droughtTolerant: boolean;
    plantingAreaSize: string;
    heightClearance: string;
    plantType: string;
    planningGoals: string[];
    projectArea: string;
  }
): string => {
  return `You are PlantPal, an expert AI assistant for urban sustainability and green planning.
Generate plant and green infrastructure recommendations based on the following information:

**Location:**
- Coordinates: Latitude ${latitude.toFixed(4)}, Longitude ${longitude.toFixed(4)}.
- Name/Description: ${locationName || 'Not specified'}.

**Current Environmental Conditions:**
- Temperature: ${temperature}°C
- Relative Humidity: ${humidity}%
- Weather: ${weatherDescription || 'Unknown'}

**User Preferences & Project Details:**
- Sunlight Exposure: ${preferences.sunlightExposure}
- Hours of Direct Sunlight: ${preferences.sunlightHours} hours/day
- Watering Frequency: ${preferences.wateringFrequency}
- Drought Tolerance Preference: ${preferences.droughtTolerant ? 'Yes, prefers drought-tolerant plants' : 'No, fine with regular watering'}
- Planting Area Size: ${preferences.plantingAreaSize}
- Max Plant Height: ${preferences.heightClearance}
- Desired Plant Type(s): ${preferences.plantType.trim() || 'Any suitable type'}
- Overall Project Area (approximate): ${preferences.projectArea.trim() || 'Not specified'}
- Key Urban Planning Goals: ${preferences.planningGoals.length > 0 ? preferences.planningGoals.join(', ') : 'General beautification and sustainability'}

**Recommendation Guidelines:**
- Prioritize native or well-adapted species for the specified location and climate.
- Consider typical soil types and topography for urban/regional areas.
- Aim to enhance local biodiversity and ecological resilience.
- Suggest plants that are relatively low-maintenance and suitable for urban environments.

**Output Format (Use Markdown - CRITICAL: FOLLOW THIS STRUCTURE PRECISELY):**
Provide a list of 5-7 specific plant recommendations. For each plant, use the following numbered format:

1. **Common Name** (Scientific Name)
2. **Description:** Brief overview of the plant (2-3 sentences).
3. **Suitability:** Why it fits the user's criteria.
4. **Key Benefits:** e.g., Pollinator-friendly, edible, air purifying, etc.
5. **Maintenance Tips:** Brief, essential care notes.

Then, include a section titled:
### Green Infrastructure Ideas
Suggest 2-3 green infrastructure ideas relevant to the user's goals. For each:
- **Idea Title:** (e.g., **Rain Garden**)
- **Explanation:** Why it is suitable.

Finally, conclude with:
### Conclusion
A friendly, encouraging remark and a reminder to consult local experts.
`;
};