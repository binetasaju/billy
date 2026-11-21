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
import type { BillGroup, ContactGroup } from "../types/group";
import { membersToParticipants } from "./contactGroupStore";
import { payerOf } from "./billEditing";
import { recalculateBillTotals } from "./recalculateBillTotals";
import { devLog } from "../utils/devLog";

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
  splitMethod: "equal" | "itemwise" | "custom" | null;
  /**
   * The reusable ContactGroup these participants were prefilled from, if any.
   * Carried through to the BillGroup as a backward reference — participants
   * remain this bill's own, and editing them never touches the group.
   */
  contactGroupId: string | null;
  /** Set when editing a saved bill: saving updates it instead of creating one. */
  editingGroupId?: string | null;
  /** Custom-split amounts to prefill when editing a custom bill. */
  customAmounts?: Record<string, number> | null;
  /**
   * "Split an Amount" from a saved group: no receipt — just a title and a
   * total, split with custom amounts.
   */
  amountOnly?: boolean;
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
    devLog("[Store] Saving image URI:", imageUri);
    const meParticipant: Person = {
      id: currentUser?.uid ?? "me",
      name: currentUser?.name ?? "Me",
      color: "#0A0A0A",
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
      contactGroupId: null,
      editingGroupId: null,
      customAmounts: null,
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

  addCharge(charge: { name: string; amount: number }) {
    if (!_state) return;
    const newBill = { ..._state.bill, charges: [...(_state.bill.charges ?? []), charge] };
    _state = { ..._state, bill: recalculateBillTotals(newBill) };
    _notify();
  },

  removeCharge(index: number) {
    if (!_state) return;
    const newCharges = (_state.bill.charges ?? []).filter((_, i) => i !== index);
    _state = { ..._state, bill: recalculateBillTotals({ ..._state.bill, charges: newCharges }) };
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
  setContactGroupId(contactGroupId: string | null) {
    if (_state) {
      _state = { ..._state, contactGroupId };
      _notify();
    }
  },
  setSplitMethod(method: "equal" | "itemwise" | "custom") {
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
  /** Load a saved bill back into the split flow for editing. */
  loadForEdit(group: BillGroup) {
    if (!group.billSnapshot) return;
    const bill = JSON.parse(JSON.stringify(group.billSnapshot)) as ParsedBill;
    _state = {
      bill,
      originalBill: JSON.parse(JSON.stringify(bill)),
      imageUri: "",
      ocrBlocks: null,
      hasBoundingBoxes: false,
      payerId: payerOf(group),
      participants: group.participants.map((p) => ({ ...p, itemIds: [...p.itemIds] })),
      splitMethod: group.splitMethod ?? (group.participants.some((p) => p.itemIds.length > 0) ? "itemwise" : "equal"),
      contactGroupId: group.contactGroupId ?? null,
      editingGroupId: group.id,
      customAmounts: group.customAmounts ?? null,
      amountOnly: group.splitMethod === "custom",
    };
    _notify();
  },

  /** Start "Split an Amount" for a saved group: you paid, members share. */
  startAmountSplit(group: ContactGroup, currentUser: User) {
    const me: Person = {
      id: currentUser.uid,
      name: currentUser.name || "Me",
      color: "#0A0A0A",
      itemIds: [],
      isCurrentUser: true,
      upiId: currentUser.upiId,
    };
    const bill: ParsedBill = {
      isBill: true,
      restaurant: "",
      billNumber: "",
      date: new Date().toISOString().slice(0, 10),
      items: [],
      subtotal: 0,
      charges: [],
      total: 0,
      printedTotal: null,
    };
    _state = {
      bill,
      originalBill: JSON.parse(JSON.stringify(bill)),
      imageUri: "",
      ocrBlocks: null,
      hasBoundingBoxes: false,
      payerId: me.id,
      participants: membersToParticipants(group.members, [me]),
      splitMethod: "custom",
      contactGroupId: group.id,
      editingGroupId: null,
      customAmounts: null,
      amountOnly: true,
    };
    _notify();
  },

  /** Amount-only splits: the title + total become the bill's single line. */
  setAmountOnlyTotal(title: string, total: number) {
    if (!_state) return;
    const name = title.trim() || "Amount";
    const items: BillItem[] = total > 0
      ? [{ id: "amount", name, price: total, amount: total, quantity: 1, confidence: 1 } as BillItem]
      : [];
    const bill = recalculateBillTotals({ ..._state.bill, restaurant: title.trim(), items, charges: [] });
    _state = { ..._state, bill };
    _notify();
  },

  clear() {
    _state = null;
    _notify();
  },
};
