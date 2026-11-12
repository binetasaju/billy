// ---------------------------------------------------------------------------
// services/billExtraction.ts — photo of a receipt → bill ready for Review
//
//   reading:   check file → compress → ML Kit text (+ optional Vision boxes)
//   building:  Gemini / offline parser → match items to the photo → billStore
//
// Used by the Preview screen's Continue button. `onStage` lets the screen show
// "Extracting bill…" while reading and "Building bill details…" after.
// ---------------------------------------------------------------------------

import * as FileSystem from "expo-file-system/legacy";
import { compressImage } from "./ocr";
import { extractTextWithMLKit } from "./mlkitOcr";
import { parseBill } from "./parseBill";
import { extractBlocksWithVision } from "./visionOcr";
import { matchItemsToBlocks, buildBlocksFromRawText } from "./matchItems";
import { billStore } from "./billStore";
import { authStore } from "./authStore";

export type ExtractionStage = "reading" | "building";

/** Thrown when the photo doesn't look like a bill. */
export const NOT_A_BILL = "BILL_NOT_DETECTED";

export class ExtractionError extends Error {
  constructor(message: string, readonly notABill = false) {
    super(message);
    this.name = "ExtractionError";
  }
}

/**
 * Read the receipt at `uri` and put the parsed bill in billStore.
 * Throws ExtractionError with a message for the person, or an AbortError
 * when `signal` is aborted.
 */
export async function extractBill(
  uri: string,
  opts: { signal?: AbortSignal; onStage?: (stage: ExtractionStage) => void } = {}
): Promise<void> {
  const { signal, onStage } = opts;
  try {
    console.time("[PIPELINE] Total");
    onStage?.("reading");

    // 1. File
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) throw new ExtractionError("The photo couldn't be found. Please take it again.");

    // 2. Compress (+ base64 only when the optional Vision API is set up)
    const compressed = await compressImage(uri);
    const visionConfigured = !!process.env.EXPO_PUBLIC_VISION_API_KEY;
    const base64 = visionConfigured
      ? await FileSystem.readAsStringAsync(compressed.uri, { encoding: "base64" as FileSystem.EncodingType })
      : "";
    if (visionConfigured && base64.length === 0) {
      throw new ExtractionError("The photo couldn't be read. Please take it again.");
    }
    if (signal?.aborted) throw abortError();

    // 3. Text on the phone (ML Kit) + optional Vision boxes, in parallel
    const ocrStart = Date.now();
    const [rawText, visionResult] = await Promise.all([
      extractTextWithMLKit(compressed.uri),
      extractBlocksWithVision(base64, signal),
    ]);
    console.log(`[PIPELINE] OCR ${Date.now() - ocrStart}ms, ${rawText.length} chars`);
    if (signal?.aborted) throw abortError();

    // 4. Build the bill
    onStage?.("building");
    const parsed = await parseBill(rawText);
    console.log("[PIPELINE] Parsed:", parsed.items.length, "items");
    if (parsed.isBill === false) throw new ExtractionError(NOT_A_BILL, true);
    if (signal?.aborted) throw abortError();

    // 5. Match items to the photo (for highlighting on Review)
    const blocks = visionResult?.blocks ?? buildBlocksFromRawText(rawText);
    const items = matchItemsToBlocks(parsed.items as any[], blocks, rawText.split("\n").length);
    const bill = { ...parsed, items, imageWidth: visionResult?.imageWidth, imageHeight: visionResult?.imageHeight };

    console.timeEnd("[PIPELINE] Total");
    billStore.set(bill, uri, visionResult?.blocks ?? null, authStore.get().user);
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.message === "OCR cancelled.") throw abortError();
    if (err instanceof ExtractionError) throw err;
    const raw = err instanceof Error ? err.message : "";
    const lower = raw.toLowerCase();
    const busy = ["503", "504", "429", "unavailable", "api error"].some((k) => lower.includes(k));
    console.error("[PIPELINE] Error:", raw);
    throw new ExtractionError(
      busy || !raw
        ? "Unable to read the receipt right now. Please try again in a few moments."
        : raw
    );
  }
}

function abortError(): Error {
  const e = new Error("Cancelled");
  e.name = "AbortError";
  return e;
}
