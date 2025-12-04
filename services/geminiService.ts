import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GEMINI_MODEL_NAME, GEMINI_IMAGE_FALLBACK_MODELS } from '../constants';
import type { ImageGenerationResult } from '../types';

// Initialize the GenAI client
const getGenAIClient = (): GoogleGenAI => {
  if (!process.env.API_KEY) {
    console.error("API_KEY environment variable is not set.");
    throw new Error("API_KEY environment variable is not set. Please add GEMINI_API_KEY to your .env file.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

// Get plant recommendations from Gemini
export const getPlantRecommendationsFromGemini = async (prompt: string): Promise<string> => {
  const ai = getGenAIClient();
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: GEMINI_MODEL_NAME,
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
    console.error("Error fetching recommendations from Gemini:", error);
    if (error instanceof Error) {
      throw new Error(`Gemini API error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with Gemini API.");
  }
};

// Generate plant image using Gemini/Imagen API
export const generatePlantImage = async (
  plantName: string,
  scientificName?: string
): Promise<ImageGenerationResult> => {
  // Check if API key is available
  if (!process.env.API_KEY) {
    console.warn("No API key available for image generation");
    return {
      success: false,
      error: "API key not configured for image generation",
    };
  }

  const ai = getGenAIClient();

  // Build detailed prompt for better image quality
  const prompt = `A beautiful, detailed botanical illustration of ${plantName}${scientificName ? ` (${scientificName})` : ''
    }. Show the plant in a natural garden setting with vibrant colors, 
  healthy green leaves, and any flowers or features typical of this species. 
  Professional quality, photorealistic style with soft natural lighting. 
  The plant should be the main focus, well-centered in the frame.`;

  // Try each model in the fallback list
  for (const modelName of GEMINI_IMAGE_FALLBACK_MODELS) {
    try {
      console.log(`Attempting image generation for "${plantName}" with model: ${modelName}`);

      const response = await ai.models.generateImages({
        model: modelName,
        prompt: prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: "1:1",
          outputMimeType: "image/png",
        },
      });

      // Check if we got valid images
      if (response.generatedImages && response.generatedImages.length > 0) {
        const imageData = response.generatedImages[0];

        // Handle different response formats
        if (imageData.image?.imageBytes) {
          // Convert bytes to base64
          const bytes: unknown = imageData.image.imageBytes;
          let base64String: string;

          if (typeof bytes === 'string') {
            // Already a base64 string
            base64String = bytes;
          } else if (bytes instanceof Uint8Array) {
            // Convert Uint8Array to base64
            base64String = btoa(
              Array.from(bytes)
                .map((byte: number) => String.fromCharCode(byte))
                .join('')
            );
          } else if (bytes instanceof ArrayBuffer) {
            // Convert ArrayBuffer to base64
            base64String = btoa(
              Array.from(new Uint8Array(bytes))
                .map((byte: number) => String.fromCharCode(byte))
                .join('')
            );
          } else {
            // Try to handle as array-like object
            const byteArray = Array.isArray(bytes) ? bytes as number[] : Object.values(bytes as object) as number[];
            base64String = btoa(
              byteArray.map((byte: number) => String.fromCharCode(byte)).join('')
            );
          }

          const imageUrl = `data:image/png;base64,${base64String}`;

          console.log(`Successfully generated image for ${plantName}`);
          return {
            success: true,
            imageUrl,
          };
        }
      }

      console.log(`No valid image data from model ${modelName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Image generation failed with model ${modelName}:`, errorMessage);
      // Continue to next model in fallback list
    }
  }

  // All Imagen models failed - return with informative message
  console.log(`All image generation models failed for ${plantName}`);
  return {
    success: false,
    error: "Image generation not available. Your Gemini API key may not have access to the Imagen models.",
  };
};

// Batch generate images for multiple plants with rate limiting
export const generatePlantImages = async (
  plants: Array<{ id: string; commonName: string; scientificName?: string }>,
  onProgress?: (completed: number, total: number) => void,
  onImageGenerated?: (plantId: string, result: ImageGenerationResult) => void
): Promise<Map<string, ImageGenerationResult>> => {
  const results = new Map<string, ImageGenerationResult>();
  const total = plants.length;
  let completed = 0;

  // Process sequentially with delay to avoid rate limiting
  for (const plant of plants) {
    try {
      // Add delay between requests (2 seconds) to avoid rate limiting
      if (completed > 0) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      const result = await generatePlantImage(plant.commonName, plant.scientificName);
      results.set(plant.id, result);

      completed++;
      onProgress?.(completed, total);
      onImageGenerated?.(plant.id, result);
    } catch (error) {
      console.error(`Failed to generate image for ${plant.commonName}:`, error);
      const errorResult: ImageGenerationResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.set(plant.id, errorResult);
      completed++;
      onProgress?.(completed, total);
      onImageGenerated?.(plant.id, errorResult);
    }
  }

  return results;
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