// ---------------------------------------------------------------------------
// utils/formatRupees.ts — whole-rupee amounts with Indian digit grouping
// ---------------------------------------------------------------------------

/** 9009 → "₹9,009", 125000 → "₹1,25,000", 45.5 → "₹46". Sign is dropped. */
export function rupees(n: number): string {
  const whole = Math.round(Math.abs(n)).toString();
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `₹${rest ? `${rest},${last3}` : last3}`;
}

/**
 * Exact amount with Indian grouping, paise shown only when there are any:
 * 1426.67 → "₹1,426.67", 9009 → "₹9,009", 0.5 → "₹0.50". Sign is dropped.
 */
export function rupeesExact(n: number): string {
  const paise = Math.round(Math.abs(n) * 100);
  const whole = rupees(Math.floor(paise / 100));
  const frac = paise % 100;
  return frac === 0 ? whole : `${whole}.${String(frac).padStart(2, "0")}`;
}
