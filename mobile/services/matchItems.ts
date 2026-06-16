// ---------------------------------------------------------------------------
// services/matchItems.ts
//
// Fuzzy-matches ParsedBill items (from Gemini) to OcrBlocks (from Vision API
// or estimated from line numbers) to attach bounding box coordinates to each
// item — enabling the item ↔ image highlight synchronization feature.
// ---------------------------------------------------------------------------

import type { BillItem, OcrBlock, BoundingBox } from "../types/bill";
import { nanoid } from "../utils/nanoid";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a string for fuzzy comparison:
 * lowercase, collapse whitespace, strip punctuation.
 */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Simple longest-common-subsequence based similarity score (0–1).
 * Fast enough for bill sizes (≤ 30 items × 50 blocks).
 */
function similarity(a: string, b: string): number {
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Word overlap score
  const wordsA = new Set(na.split(" "));
  const wordsB = new Set(nb.split(" "));
  let shared = 0;
  wordsA.forEach((w) => { if (wordsB.has(w)) shared++; });
  return (2 * shared) / (wordsA.size + wordsB.size);
}

/**
 * Estimate bounding box from a line's proportional position in the image.
 * Used when Vision API bounding boxes are not available.
 *
 * @param yPct   Vertical position (0 = top, 100 = bottom)
 * @returns      Approximate % bounding box spanning full width
 */
function estimatedBox(yPct: number): BoundingBox {
  return {
    xPct: 5,
    yPct: Math.max(0, yPct - 2),
    widthPct: 90,
    heightPct: 5,
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Attaches bounding box and confidence data from OcrBlocks to ParsedBill items.
 *
 * Strategy:
 *   1. For each ParsedBill item, find the OcrBlock whose text most closely
 *      matches the item name (fuzzy similarity).
 *   2. Copy the block's bounding box and confidence to the item.
 *   3. If no block matches (score < 0.4), synthesise a position based on
 *      the item's index in the bill (evenly distributed vertically).
 *
 * @param items     ParsedBill.items from Gemini
 * @param blocks    OcrBlocks from Vision API (or line-estimate fallback)
 * @param totalLines  Total number of OCR lines (for fallback position calc)
 */
export function matchItemsToBlocks(
  items: Array<Omit<BillItem, "id" | "confidence" | "isLowConfidence" | "boundingBox">>,
  blocks: OcrBlock[],
  totalLines: number
): BillItem[] {
  const usedBlockIndices = new Set<number>();

  return items.map((raw, itemIdx) => {
    let bestScore = 0;
    let bestBlock: OcrBlock | null = null;
    let bestBlockIdx = -1;

    for (let i = 0; i < blocks.length; i++) {
      if (usedBlockIndices.has(i)) continue;
      const score = similarity(raw.name, blocks[i].text);
      if (score > bestScore) {
        bestScore = score;
        bestBlock = blocks[i];
        bestBlockIdx = i;
      }
    }

    const CONFIDENCE_THRESHOLD = 0.4;
    const matched = bestScore >= CONFIDENCE_THRESHOLD && bestBlock !== null;

    if (matched) {
      usedBlockIndices.add(bestBlockIdx);
    }

    // Derive bounding box
    const boundingBox: BoundingBox = matched && bestBlock!.boundingBox
      ? bestBlock!.boundingBox
      : matched && bestBlock
        ? estimatedBox(bestBlock.yPct)
        : estimatedBox(
            // Fallback: evenly distribute items vertically in the bill area
            // Bills typically start at ~15% from top, end at ~80%
            15 + (itemIdx / Math.max(items.length - 1, 1)) * 65
          );

    const confidence = matched ? (bestBlock!.confidence ?? 0.9) : 0.7;

    return {
      ...raw,
      id: nanoid(),
      confidence,
      lineIndex: bestBlock?.lineIndex,
      boundingBox,
      isLowConfidence: confidence < 0.8,
      isSelected: false,
    } as BillItem;
  });
}

/**
 * Build a minimal OcrBlock array from raw OCR text lines.
 * Used as fallback when Vision API is not available — assigns evenly-spaced
 * vertical positions to each line.
 */
export function buildBlocksFromRawText(rawText: string): OcrBlock[] {
  const lines = rawText.split("\n").filter((l) => l.trim().length > 0);
  return lines.map((text, idx) => ({
    lineIndex: idx,
    text,
    yPct: lines.length > 1 ? (idx / (lines.length - 1)) * 100 : 50,
    confidence: 0.85, // Gemini is generally reliable
    boundingBox: undefined, // no pixel data available
  }));
}
