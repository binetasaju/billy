// ---------------------------------------------------------------------------
// services/billStore.ts
//
// In-memory singleton that passes data from ocr.tsx → review-items.tsx,
// bypassing Expo Router's URL param size limit.
//
// Stores: ParsedBill (with bounding boxes) + source image URI + OCR blocks.
// ---------------------------------------------------------------------------

import type { ParsedBill, OcrBlock } from "../types/bill";

interface StoreState {
  bill: ParsedBill;
  /** Original (uncompressed) image URI — shown in the review screen */
  imageUri: string;
  /** OCR blocks from Vision API — null if Vision API not configured */
  ocrBlocks: OcrBlock[] | null;
  /** Whether Vision API was used (true) or Gemini fallback (false) */
  hasBoundingBoxes: boolean;
}

let _state: StoreState | null = null;

export const billStore = {
  set(
    bill: ParsedBill,
    imageUri: string,
    ocrBlocks: OcrBlock[] | null = null
  ) {
    console.log("[Store] Saving image URI:", imageUri);
    _state = {
      bill,
      imageUri,
      ocrBlocks,
      hasBoundingBoxes: ocrBlocks !== null && ocrBlocks.some((b) => !!b.boundingBox),
    };
  },
  get(): StoreState | null {
    return _state;
  },
  clear() {
    _state = null;
  },
};
