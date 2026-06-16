// ---------------------------------------------------------------------------
// services/visionOcr.ts
//
// Google Cloud Vision API integration — returns text blocks with bounding boxes.
//
// This is OPTIONAL. If EXPO_PUBLIC_VISION_API_KEY is not set, the pipeline
// falls back to position estimation from Gemini's line-indexed output.
//
// REST docs: https://cloud.google.com/vision/docs/reference/rest/v1/images/annotate
// ---------------------------------------------------------------------------

import type { OcrBlock, BoundingBox } from "../types/bill";

const VISION_API_URL =
  "https://vision.googleapis.com/v1/images:annotate";

// ---------------------------------------------------------------------------
// Types — Vision API response shapes
// ---------------------------------------------------------------------------

interface Vertex {
  x?: number;
  y?: number;
}

interface BoundingPoly {
  vertices: Vertex[];
}

interface TextAnnotation {
  description: string;
  boundingPoly: BoundingPoly;
  confidence?: number;
}

interface VisionResponse {
  responses: Array<{
    textAnnotations?: TextAnnotation[];
    fullTextAnnotation?: {
      pages?: Array<{
        width: number;
        height: number;
        blocks?: any[];
      }>;
    };
    error?: { message: string; code: number };
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert Vision API vertices (pixels) to percentage bounding box.
 * Requires knowing the natural image dimensions.
 */
function verticesToBoundingBox(
  vertices: Vertex[],
  imageWidth: number,
  imageHeight: number
): BoundingBox {
  const xs = vertices.map((v) => v.x ?? 0);
  const ys = vertices.map((v) => v.y ?? 0);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    xPct: (minX / imageWidth) * 100,
    yPct: (minY / imageHeight) * 100,
    widthPct: ((maxX - minX) / imageWidth) * 100,
    heightPct: ((maxY - minY) / imageHeight) * 100,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Calls Google Cloud Vision API TEXT_DETECTION and returns an array of
 * OcrBlocks — one per detected line, with bounding boxes in % coordinates.
 *
 * Returns null if no Vision API key is configured (graceful degradation).
 *
 * @param base64      Base64-encoded image (no data: prefix)
 * @returns           Array of OcrBlock, or null if Vision API unavailable
 */
export async function extractBlocksWithVision(
  base64: string,
  signal?: AbortSignal
): Promise<{ blocks: OcrBlock[]; imageWidth: number; imageHeight: number } | null> {
  const apiKey = process.env.EXPO_PUBLIC_VISION_API_KEY;
  if (!apiKey) {
    console.log("[Vision] No EXPO_PUBLIC_VISION_API_KEY — skipping Vision API.");
    return null;
  }

  console.time("[Vision] API call");

  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [
          { type: "TEXT_DETECTION", maxResults: 50 },
          { type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 },
        ],
        imageContext: {
          languageHints: ["en", "hi"], // English + Hindi for Indian bills
        },
      },
    ],
  };

  try {
    const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });

    console.timeEnd("[Vision] API call");

    if (!response.ok) {
      const err = await response.text();
      console.error("[Vision] API error:", response.status, err);
      return null; // Non-fatal — fall back to Gemini-only mode
    }

    const data: VisionResponse = await response.json();
    const result = data.responses?.[0];

    if (result?.error) {
      console.error("[Vision] Response error:", result.error.message);
      return null;
    }

    const annotations = result?.textAnnotations;
    if (!annotations || annotations.length < 2) {
      console.warn("[Vision] No text annotations returned.");
      return null;
    }

    // Annotation[0] is the full concatenated text — skip it.
    // Annotations[1..N] are individual words/lines.
    // We use fullTextAnnotation page dimensions for accurate scaling.
    const page = result?.fullTextAnnotation?.pages?.[0];
    const imageWidth = page?.width ?? 1000;
    const imageHeight = page?.height ?? 1000;

    console.log("[Vision] Image dimensions:", imageWidth, "×", imageHeight);
    console.log("[Vision] Text blocks found:", annotations.length - 1);

    const blocks: OcrBlock[] = annotations.slice(1).map((ann, idx) => {
      const box = verticesToBoundingBox(
        ann.boundingPoly?.vertices ?? [],
        imageWidth,
        imageHeight
      );
      return {
        lineIndex: idx,
        text: ann.description,
        yPct: box.yPct + box.heightPct / 2, // midpoint Y
        confidence: ann.confidence ?? 0.9,
        boundingBox: box,
      };
    });

    return { blocks, imageWidth, imageHeight };
  } catch (error: any) {
    if (error.name === "AbortError") {
      console.warn("[Vision] Request cancelled.");
    } else {
      console.error("[Vision] Network or parsing error:", error);
    }
    return null;
  }
}
