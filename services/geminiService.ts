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
  const userApiKey = getUserApiKey();
  if (userApiKey) {
    return new GoogleGenAI({ apiKey: userApiKey });
  }
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("No API key available. Please provide your Gemini API key to use PlantPal.");
  }
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
      message.includes('exceeded') ||
      message.includes('permission_denied') ||
      message.includes('billing') ||
      message.includes('too many requests');
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

      return textResponse;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Model ${modelName} failed:`, errorMessage);
      lastError = error instanceof Error ? error : new Error(String(error));
      errors.push(`${modelName}: ${errorMessage.substring(0, 100)}`);

      if (isModelNotFoundError(error) || isRateLimitError(error)) {
        if (i < GEMINI_MODELS.length - 1) {
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

// Get AI-generated garden insights
export const getGardenInsights = async (prompt: string): Promise<string> => {
  const ai = getGenAIClient();
  const errors: string[] = [];

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const modelName = GEMINI_MODELS[i];
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: { temperature: 0.6, topP: 0.9, topK: 30 },
      });
      if (response.text) return response.text;
      throw new Error('Empty response from Gemini API.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${modelName}: ${msg.substring(0, 80)}`);
      if (i < GEMINI_MODELS.length - 1 && (isModelNotFoundError(error) || isRateLimitError(error))) {
        await delay(500);
        continue;
      }
      // Last model or non-recoverable error
      if (i === GEMINI_MODELS.length - 1 || (!isModelNotFoundError(error) && !isRateLimitError(error))) {
        // Check if it's a quota issue
        const allQuota = errors.every(e => e.toLowerCase().includes('429') || e.toLowerCase().includes('quota') || e.toLowerCase().includes('exceeded') || e.toLowerCase().includes('rate limit'));
        if (allQuota || isRateLimitError(error)) {
          throw new QuotaExceededError('API quota exceeded. Please provide your own Gemini API key to continue.');
        }
        throw new Error(`Unable to generate insights: ${msg}`);
      }
    }
  }
  throw new Error('Unable to generate garden insights at this time.');
};

// Analyze image with Gemini Vision
export const analyzeImageWithAI = async (base64Data: string, mimeType: string, prompt: string): Promise<string> => {
  const ai = getGenAIClient();
  const errors: string[] = [];

  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const modelName = GEMINI_MODELS[i];
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [{
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } }
          ]
        }],
        config: { temperature: 0.3, topP: 0.9, topK: 30 },
      });
      if (response.text) return response.text;
      throw new Error('Empty response from Gemini API.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${modelName}: ${msg.substring(0, 80)}`);
      if (i < GEMINI_MODELS.length - 1 && (isModelNotFoundError(error) || isRateLimitError(error))) {
        await delay(500);
        continue;
      }
      if (i === GEMINI_MODELS.length - 1 || (!isModelNotFoundError(error) && !isRateLimitError(error))) {
        const allQuota = errors.every(e => e.toLowerCase().includes('429') || e.toLowerCase().includes('quota') || e.toLowerCase().includes('exceeded') || e.toLowerCase().includes('rate limit'));
        if (allQuota || isRateLimitError(error)) {
          throw new QuotaExceededError('API quota exceeded. Please provide your own Gemini API key to continue.');
        }
        throw new Error(`Unable to analyze image: ${msg}`);
      }
    }
  }
  throw new Error('Unable to analyze image at this time.');
};