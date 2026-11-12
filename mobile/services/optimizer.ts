// ---------------------------------------------------------------------------
// services/optimizer.ts — AI auto-crop
//
// Asks Gemini (vision) where the receipt is in the photo and crops to it.
// Only runs when the user taps "Auto-crop (AI)" on the Preview screen.
//
// Uses a "-latest" model alias so a retired model version can't silently
// break it again (gemini-2.0-flash was retired and every call failed).
// The lite model is fast (~2 s) and accurate for boxes; the full flash model
// was often overloaded (503 after ~30 s). Requests time out after 30 s.
// ---------------------------------------------------------------------------
import * as ImageManipulator from "expo-image-manipulator";
import { devLog } from "../utils/devLog";
import { callGeminiWithFallback, geminiConfigured } from "./gemini";

const TIMEOUT_MS = 30_000;

// Gemini's native box format: [ymin, xmin, ymax, xmax] on a 0–1000 scale.
const OPTIMIZE_PROMPT = `
Find the paper receipt / bill in this image.
Return ONLY JSON: {"box_2d": [ymin, xmin, ymax, xmax]}
with integer coordinates from 0 to 1000 for the tightest box around the whole receipt
(include every printed line, from the top header to the last line).
If there is no receipt, return {"box_2d": [0, 0, 1000, 1000]}.
`.trim();

/** Receipt box as 0–1 fractions of the image. */
export interface CropBox {
  yMin: number;
  xMin: number;
  yMax: number;
  xMax: number;
}

export type AutoCropResult =
  | { status: "cropped"; uri: string }
  | { status: "no-change"; uri: string; message: string }
  | { status: "error"; uri: string; message: string };

/**
 * Read a crop box from Gemini's reply. Accepts {"box_2d": [...]}, a bare
 * [ymin, xmin, ymax, xmax] array, or {yMin, xMin, yMax, xMax}; 0–1 or 0–1000
 * scale; with or without ```json fences. Returns null if unusable.
 */
export function parseCropBox(text: string | undefined | null): CropBox | null {
  if (!text) return null;
  let clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let data: any;
  try {
    data = JSON.parse(clean);
  } catch {
    const m = clean.match(/\[[^\]]+\]|\{[^}]+\}/);
    if (!m) return null;
    try { data = JSON.parse(m[0]); } catch { return null; }
  }
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "object") data = data[0];

  const isBox = (a: unknown): a is number[] => Array.isArray(a) && a.length === 4;
  let v: number[] | null = null;
  if (isBox(data)) v = data;
  else if (data && isBox(data.box_2d)) v = data.box_2d;
  // Models don't always use the requested key ("box", "bbox", …).
  else if (data && typeof data === "object" && Object.values(data).some(isBox)) {
    v = Object.values(data).find(isBox) as number[];
  }
  else if (data && ["yMin", "xMin", "yMax", "xMax"].every((k) => typeof data[k] === "number")) {
    v = [data.yMin, data.xMin, data.yMax, data.xMax];
  }
  if (!v || !v.every((n) => typeof n === "number" && Number.isFinite(n))) return null;

  const scale = v.some((n) => n > 1.5) ? 1000 : 1;
  const [y0, x0, y1, x1] = v.map((n) => Math.min(1, Math.max(0, n / scale)));
  const box = { yMin: Math.min(y0, y1), xMin: Math.min(x0, x1), yMax: Math.max(y0, y1), xMax: Math.max(x0, x1) };
  // Reject degenerate boxes (less than 5% of the image in either direction).
  if (box.yMax - box.yMin < 0.05 || box.xMax - box.xMin < 0.05) return null;
  return box;
}

/**
 * Pixel crop for a box, with a little padding so edge text isn't cut.
 * Returns null when the crop would remove almost nothing (< 3% each side).
 */
export function boxToPixelCrop(box: CropBox, width: number, height: number, pad = 0.02) {
  const startX = Math.max(0, box.xMin - pad);
  const startY = Math.max(0, box.yMin - pad);
  const endX = Math.min(1, box.xMax + pad);
  const endY = Math.min(1, box.yMax + pad);
  if (startX < 0.03 && startY < 0.03 && endX > 0.97 && endY > 0.97) return null;

  const originX = Math.round(startX * width);
  const originY = Math.round(startY * height);
  return {
    originX,
    originY,
    width: Math.max(1, Math.min(width - originX, Math.round(endX * width) - originX)),
    height: Math.max(1, Math.min(height - originY, Math.round(endY * height) - originY)),
  };
}

export async function autoCropReceipt(uri: string): Promise<AutoCropResult> {
  if (!geminiConfigured()) {
    return { status: "error", uri, message: "AI isn't set up (no Gemini API key)." };
  }

  try {
    // Real size, in the same (EXIF-corrected) space the crop is applied in.
    const info = await ImageManipulator.manipulateAsync(uri, [], {});
    // Small copy for the model — boxes don't need full resolution.
    const small = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 800 } }],
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!small.base64) throw new Error("Could not prepare the image.");

    // Tries the backup models when the first is busy or out of quota.
    const response = await callGeminiWithFallback(
      {
        contents: [{ parts: [
          { inline_data: { mime_type: "image/jpeg", data: small.base64 } },
          { text: OPTIMIZE_PROMPT },
        ] }],
        generationConfig: { temperature: 0, response_mime_type: "application/json" },
      },
      TIMEOUT_MS
    );

    if (!response.ok) {
      const body = await response.text();
      console.warn(`[AutoCrop] Gemini ${response.status}:`, body.slice(0, 300));
      return {
        status: "error",
        uri,
        message: response.status === 429
          ? "Today's AI limit is reached. Use Adjust Crop instead."
          : `AI auto-crop failed (${response.status}). Use Adjust Crop instead.`,
      };
    }

    const json = await response.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    devLog("[AutoCrop] Response:", text?.slice(0, 200));
    const box = parseCropBox(text);
    if (!box) {
      return { status: "no-change", uri, message: "Couldn't find the receipt. Use Adjust Crop to crop by hand." };
    }

    const crop = boxToPixelCrop(box, info.width, info.height);
    if (!crop) {
      return { status: "no-change", uri, message: "The receipt already fills the photo — no crop needed." };
    }

    const result = await ImageManipulator.manipulateAsync(uri, [{ crop }], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return { status: "cropped", uri: result.uri };
  } catch (err) {
    console.error("[AutoCrop] Error:", err);
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      status: "error",
      uri,
      message: timedOut
        ? "AI auto-crop took too long. Try again, or use Adjust Crop."
        : "AI auto-crop failed. Check your internet and try again, or use Adjust Crop.",
    };
  }
}

/** Back-compat wrapper: returns the cropped uri, or the original on any failure. */
export async function optimizeReceipt(uri: string): Promise<string> {
  return (await autoCropReceipt(uri)).uri;
}
