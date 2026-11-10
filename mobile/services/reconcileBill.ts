// ---------------------------------------------------------------------------
// services/reconcileBill.ts
//
// Checks extracted charges against the total PRINTED on the receipt.
//
// Many Indian receipts print a GST breakdown even when prices are tax-
// inclusive ("CGST 2.5% incl. 12.00"). If those lines are treated as extra
// charges the bill gets taxed twice. The printed total is the ground truth:
//
//   items ≈ printed total            → taxes were only a breakdown → drop them
//   items + charges ≈ printed total  → charges are real → keep them
//   neither                          → keep, but flag the mismatch for review
// ---------------------------------------------------------------------------

import type { ChargeInfo } from "../types/bill";

/** ₹1 slack for rounding / round-off lines. */
const TOLERANCE = 1;

/**
 * True for tax lines (CGST, SGST, IGST, GST, VAT, Cess).
 * Deliberately does NOT match "GSTIN" (the tax registration number).
 */
export function isTaxCharge(name: string): boolean {
  return /(^|[^a-z])(c|s|i|ut)?gst(?!in)|\bvat\b|\bcess\b/i.test(name);
}

export interface ReconcileResult {
  charges: ChargeInfo[];
  /** Tax lines were found but are already included in the item prices. */
  taxInclusive: boolean;
  /** items + charges still differ from the printed total by more than ₹1. */
  mismatch: boolean;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE;

export function reconcileCharges(
  itemsTotal: number,
  charges: ChargeInfo[],
  printedTotal: number | null | undefined
): ReconcileResult {
  if (printedTotal == null || !(printedTotal > 0)) {
    return { charges, taxInclusive: false, mismatch: false };
  }

  const withAll = itemsTotal + sum(charges.map((c) => c.amount));
  if (close(withAll, printedTotal)) {
    return { charges, taxInclusive: false, mismatch: false };
  }

  const taxes = charges.filter((c) => isTaxCharge(c.name));
  if (taxes.length > 0) {
    const nonTax = charges.filter((c) => !isTaxCharge(c.name));
    const withoutTax = itemsTotal + sum(nonTax.map((c) => c.amount));
    if (close(withoutTax, printedTotal)) {
      return { charges: nonTax, taxInclusive: true, mismatch: false };
    }
  }

  // Items alone already match the printed total: every charge line is
  // informational (e.g. a tax breakdown on an inclusive bill).
  if (charges.length > 0 && close(itemsTotal, printedTotal)) {
    return { charges: [], taxInclusive: taxes.length > 0, mismatch: false };
  }

  return { charges, taxInclusive: false, mismatch: true };
}
