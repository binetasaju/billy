import * as ImageManipulator from "expo-image-manipulator";
import { Platform } from "react-native";

// We can reuse the same model, but we just need a fast JSON response.
const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const OPTIMIZE_PROMPT = `
You are an expert document detection model.
Find the receipt or document in this image.
Return ONLY valid JSON with the bounding box coordinates normalized between 0.0 and 1.0.

JSON schema:
{
  "yMin": 0.0,
  "xMin": 0.0,
  "yMax": 1.0,
  "xMax": 1.0
}

If no receipt is found, return { "yMin": 0, "xMin": 0, "yMax": 1, "xMax": 1 }.
`;

export async function optimizeReceipt(uri: string): Promise<string> {
  console.log("[Optimizer] Starting receipt detection...");

  // 1. Get image dimensions
  // On React Native, we can use ImageManipulator just to read the size by doing a no-op manipulation.
  const info = await ImageManipulator.manipulateAsync(uri, [], {});
  const width = info.width;
  const height = info.height;

  // 2. Compress image for faster Gemini processing (we don't need high res for bounding boxes)
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 800 } }],
    { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );

  const base64 = compressed.base64;
  if (!base64) throw new Error("Failed to get base64 for optimizer.");

  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("[Optimizer] No API key, skipping optimization.");
    return uri; // Fallback to original image
  }

  const requestBody = {
    contents: [
      {
        parts: [
          { text: OPTIMIZE_PROMPT },
          { inline_data: { mime_type: "image/jpeg", data: base64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      response_mime_type: "application/json",
    },
  };

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  try {
    console.time("[Optimizer] Gemini Detection");
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    console.timeEnd("[Optimizer] Gemini Detection");

    if (!response.ok) {
      console.warn("[Optimizer] Gemini API error, skipping crop.");
      return uri;
    }

    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!text) {
      console.warn("[Optimizer] Empty response, skipping crop.");
      return uri;
    }

    const box = JSON.parse(text);
    
    // Safety check - if bounding box is full image or invalid, skip crop
    if (!box || typeof box.xMin !== "number" || box.yMin === 0 && box.xMin === 0 && box.yMax === 1 && box.xMax === 1) {
      console.log("[Optimizer] No meaningful crop found. Using original.");
      return uri;
    }

    // 3. Calculate pixel crop
    // Add a tiny bit of padding (e.g. 1%) so we don't cut off text edges
    const padX = 0.02;
    const padY = 0.02;
    
    const startX = Math.max(0, box.xMin - padX);
    const startY = Math.max(0, box.yMin - padY);
    const endX = Math.min(1, box.xMax + padX);
    const endY = Math.min(1, box.yMax + padY);

    const cropOriginX = Math.round(startX * width);
    const cropOriginY = Math.round(startY * height);
    const cropWidth = Math.round((endX - startX) * width);
    const cropHeight = Math.round((endY - startY) * height);

    console.log("[Optimizer] Cropping at:", { cropOriginX, cropOriginY, cropWidth, cropHeight });

    // TODO: Implement ML Kit for true perspective correction and straightening.
    // Currently, this only does a rectangular crop around the detected receipt.

    // 4. Perform the actual high-res crop on the ORIGINAL uri
    const finalCropped = await ImageManipulator.manipulateAsync(
      uri,
      [
        {
          crop: {
            originX: cropOriginX,
            originY: cropOriginY,
            width: cropWidth,
            height: cropHeight,
          },
        },
      ],
      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
    );

    return finalCropped.uri;

  } catch (err) {
    console.error("[Optimizer] Error during optimization:", err);
    return uri; // Fail gracefully
  }
}
