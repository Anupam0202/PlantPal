
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_NAME } from '../constants';

// Fix: Initialize client using API_KEY from process.env as per guidelines.
const getGenAIClient = () => {
  // Guideline: API key must be obtained exclusively from process.env.API_KEY.
  // Guideline: Assume process.env.API_KEY is pre-configured, valid, and accessible.
  if (!process.env.API_KEY) {
    // This check is for robustness, though guidelines say to assume it's present.
    // In a production build, this might be optimized out or handled by build process.
    console.error("API_KEY environment variable is not set.");
    throw new Error("API_KEY environment variable is not set.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Fix: Removed apiKey parameter, uses getGenAIClient which relies on process.env.API_KEY.
// Fix: Updated contents to be a simple string as per basic text prompt examples.
export const getPlantRecommendationsFromGemini = async (prompt: string): Promise<string> => {
  const ai = getGenAIClient();
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: GEMINI_MODEL_NAME,
        // Fix: Simplified content structure for basic text prompt.
        contents: prompt,
        config: {
            temperature: 0.7, // Allow for some creativity in recommendations
            topP: 0.95,
            topK: 40,
            // maxOutputTokens: 2048, // Adjust as needed for response length
        }
    });
    
    // Fix: Directly access the text property as per new guidelines (already correct).
    const textResponse = response.text;

    if (textResponse === undefined || textResponse === null) { // Check for undefined or null specifically
        throw new Error("Received an empty or undefined response from Gemini API.");
    }
    return textResponse;

  } catch (error) {
    console.error("Error fetching recommendations from Gemini:", error);
    if (error instanceof Error) {
        // Propagate a more specific error message if possible, or keep it generic.
        throw new Error(`Gemini API error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with Gemini API.");
  }
};