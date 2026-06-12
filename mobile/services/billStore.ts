// ---------------------------------------------------------------------------
// services/billStore.ts
//
// Tiny in-memory singleton to pass a ParsedBill from ocr.tsx → review-items.tsx
// without hitting Expo Router's URL param size limit (~2-8KB).
// ---------------------------------------------------------------------------

import type { ParsedBill } from "./parseBill";

let _bill: ParsedBill | null = null;

export const billStore = {
  set(bill: ParsedBill) {
    _bill = bill;
  },
  get(): ParsedBill | null {
    return _bill;
  },
  clear() {
    _bill = null;
  },
};
