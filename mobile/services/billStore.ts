// ---------------------------------------------------------------------------
// services/billStore.ts
//
// In-memory singleton that passes data from ocr.tsx → review-items.tsx,
// bypassing Expo Router's URL param size limit.
//
// Stores: ParsedBill (with bounding boxes) + source image URI + OCR blocks.
// ---------------------------------------------------------------------------

import type { ParsedBill, OcrBlock, Person, BillItem } from "../types/bill";
import type { User } from "../types/user";
import { recalculateBillTotals } from "./recalculateBillTotals";

interface StoreState {
  bill: ParsedBill;
  /** The original, unedited OCR result. Useful for debugging and resetting. */
  originalBill: ParsedBill;
  /** Original (uncompressed) image URI — shown in the review screen */
  imageUri: string;
  /** OCR blocks from Vision API — null if Vision API not configured */
  ocrBlocks: OcrBlock[] | null;
  /** Whether Vision API was used (true) or Gemini fallback (false) */
  hasBoundingBoxes: boolean;

  // Split Session State
  payerId: string | null;
  participants: Person[];
  splitMethod: "equal" | "itemwise" | null;
}

let _state: StoreState | null = null;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((listener) => listener());
}

export const billStore = {
  set(
    bill: ParsedBill,
    imageUri: string,
    ocrBlocks: OcrBlock[] | null = null,
    currentUser?: User | null,
  ) {
    console.log("[Store] Saving image URI:", imageUri);
    const meParticipant: Person = {
      id: currentUser?.uid ?? "me",
      name: currentUser?.name ?? "Me",
      color: "#1D4ED8",
      itemIds: [],
      isCurrentUser: true,
    };
    _state = {
      bill,
      originalBill: JSON.parse(JSON.stringify(bill)), // Deep clone to preserve original
      imageUri,
      ocrBlocks,
      hasBoundingBoxes: ocrBlocks !== null && ocrBlocks.some((b) => !!b.boundingBox),
      payerId: null,
      participants: [meParticipant],
      splitMethod: null,
    };
    _notify();
  },
  get(): StoreState | null {
    return _state;
  },
  subscribe(listener: () => void) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  // ── Bill Mutations (Source of Truth) ──────────────────────────────────────
  
  updateBill(updatedBill: ParsedBill) {
    if (!_state) return;
    _state = { ..._state, bill: recalculateBillTotals(updatedBill) };
    _notify();
  },

  addItem(item: BillItem) {
    if (!_state) return;
    const newBill = { ..._state.bill, items: [..._state.bill.items, item] };
    _state = { ..._state, bill: recalculateBillTotals(newBill) };
    _notify();
  },

  editItem(itemId: string, updates: Partial<BillItem>) {
    if (!_state) return;
    const newItems = _state.bill.items.map((it) =>
      it.id === itemId ? { ...it, ...updates, amount: updates.price ?? it.price } : it
    );
    const newBill = { ..._state.bill, items: newItems };
    _state = { ..._state, bill: recalculateBillTotals(newBill) };
    _notify();
  },

  removeItem(itemId: string) {
    if (!_state) return;
    const newItems = _state.bill.items.filter((it) => it.id !== itemId);
    const newBill = { ..._state.bill, items: newItems };
    _state = { ..._state, bill: recalculateBillTotals(newBill) };
    _notify();
  },

  // ── Other Updates ─────────────────────────────────────────────────────────

  updateRestaurantName(name: string) {
    if (_state) {
      _state = { ..._state, bill: { ..._state.bill, restaurant: name } };
      _notify();
    }
  },
  updatePayer(payerId: string) {
    if (_state) {
      _state = { ..._state, payerId };
      _notify();
    }
  },
  clearPayer() {
    if (_state) {
      _state = { ..._state, payerId: null };
      _notify();
    }
  },
  setSplitMethod(method: "equal" | "itemwise") {
    if (_state) {
      _state = { ..._state, splitMethod: method };
      _notify();
    }
  },
  addParticipant(person: Person) {
    if (_state) {
      _state = { ..._state, participants: [..._state.participants, person] };
      _notify();
    }
  },
  clear() {
    _state = null;
    _notify();
  },
};
