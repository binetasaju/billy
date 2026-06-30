// ---------------------------------------------------------------------------
// services/recalculateBillTotals.ts
//
// Pure function to recalculate a bill's totals after an item mutation
// (add/edit/delete). Preserves original extracted charges (like GST) 
// but updates subtotal, total, and automatically corrects mathematical
// inconsistencies.
// ---------------------------------------------------------------------------

import type { ParsedBill } from "../types/bill";

export function recalculateBillTotals(bill: ParsedBill): ParsedBill {
  // 1. Calculate new subtotal from all current items
  const subtotal = bill.items.reduce((sum, item) => sum + (item.price || 0), 0);
  
  // 2. Sum up all static charges (GST, Service Charge, etc)
  const chargesTotal = (bill.charges || []).reduce((sum, charge) => sum + (charge.amount || 0), 0);
  
  // 3. Prevent negative totals (e.g. if a massive discount outweighs the subtotal)
  let total = subtotal + chargesTotal;
  if (total < 0) {
    total = 0;
  }

  // 4. Determine consistency
  const expectedTotal = subtotal + chargesTotal;
  const isConsistent = Math.abs(expectedTotal - total) < 0.01;
  
  if (!isConsistent) {
    console.warn(`[recalculate] Inconsistency detected! Expected ${expectedTotal}, got ${total}. Auto-correcting.`);
  }

  // 5. Update legacy scalar fields just in case they are used elsewhere
  const gst = (bill.charges || [])
    .filter((c) => /cgst|sgst|igst|gst|vat|cess/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  const serviceCharge = (bill.charges || [])
    .filter((c) => /service.?charge|packaging|delivery|convenience/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  const tip = (bill.charges || [])
    .filter((c) => /tip/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  const discount = (bill.charges || [])
    .filter((c) => /discount|round.?off|rounding/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  return {
    ...bill,
    subtotal,
    total,
    gst,
    serviceCharge,
    tip,
    discount,
  };
}
