// ---------------------------------------------------------------------------
// types/bill.ts
//
// Shared data model for the entire Billy bill-scanning pipeline.
// ---------------------------------------------------------------------------

// ── Bounding box ─────────────────────────────────────────────────────────────
// Coordinates are expressed as percentages of the image dimensions (0–100).
// This makes them resolution-independent — we can scale to any display size.

export interface BoundingBox {
  /** Left edge as % of image width */
  xPct: number;
  /** Top edge as % of image height */
  yPct: number;
  /** Width as % of image width */
  widthPct: number;
  /** Height as % of image height */
  heightPct: number;
}

// ── OCR line block ────────────────────────────────────────────────────────────
// One text line as returned by the OCR step.

export interface OcrBlock {
  /** Zero-based line index in the raw OCR output */
  lineIndex: number;
  /** Raw text of the line */
  text: string;
  /** Approximate position as % of image (0 = top, 100 = bottom) */
  yPct: number;
  /** Confidence: 0–1 (estimated from Gemini or Vision API) */
  confidence: number;
  /** Bounding box in % coordinates (optional — set when Vision API is used) */
  boundingBox?: BoundingBox;
}

// ── Parsed bill item with position data ──────────────────────────────────────

export interface BillItem {
  id: string;               // stable UUID for React keys / state management
  name: string;
  quantity: number;
  unitPrice?: number;
  amount: number;
  price: number;            // alias for amount — kept for backward compat

  // OCR verification data
  confidence: number;       // 0–1  (< 0.8 → flagged as low confidence)
  lineIndex?: number;       // which OCR line this item came from
  boundingBox?: BoundingBox; // pixel-% bounding box on original image

  // UI state (not persisted)
  isSelected?: boolean;
  isLowConfidence?: boolean;
}

export interface TaxInfo {
  name: string;
  amount: number;
}

// ── Full parsed bill ─────────────────────────────────────────────────────────

export interface ParsedBill {
  restaurant: string;
  billNumber: string;
  date: string;
  items: BillItem[];
  subtotal?: number | null;
  taxes?: TaxInfo[];
  gst?: number | null;
  serviceCharge?: number | null;
  tip?: number | null;
  total: number;

  // Source image natural dimensions (needed to scale bounding boxes)
  imageWidth?: number;
  imageHeight?: number;
}

// ── Bill split data model ────────────────────────────────────────────────────

export interface Person {
  id: string;
  name: string;
  color: string;
  /** Item IDs this person consumed */
  itemIds: string[];
}

export interface SplitResult {
  personId: string;
  personName: string;
  itemsTotal: number;
  taxShare: number;
  serviceChargeShare: number;
  total: number;
}
