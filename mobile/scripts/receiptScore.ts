// ---------------------------------------------------------------------------
// scripts/receiptScore.ts — how close is an extracted bill to the right answer?
// Pure functions (tested in __tests__/receiptScore.test.ts); used by
// scripts/evalReceipts.ts.
// ---------------------------------------------------------------------------

export interface ExpectedBill {
  total: number;
  items: { name: string; amount: number }[];
  /** Optional: sum of taxes / charges / discounts on the bill. */
  chargesTotal?: number;
}

export interface ExtractedBill {
  total: number;
  items: { name: string; price?: number; amount?: number }[];
  charges?: { name: string; amount: number }[];
}

export interface ReceiptScore {
  totalOk: boolean;
  chargesOk: boolean | null;
  /** Items found with the right amount (and a similar name). */
  matched: number;
  expected: number;
  extracted: number;
  /** matched / expected */
  recall: number;
  /** matched / extracted */
  precision: number;
  missing: string[];
  extra: string[];
}

const TOLERANCE = 1; // ₹1 — round-off differences are fine

export function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/** Share of the expected name's words found in the extracted name (0–1). */
export function nameSimilarity(expected: string, extracted: string): number {
  const a = normaliseName(expected).split(" ").filter(Boolean);
  const b = new Set(normaliseName(extracted).split(" ").filter(Boolean));
  if (a.length === 0) return 0;
  const hits = a.filter((w) => b.has(w) || [...b].some((x) => x.length >= 3 && (x.startsWith(w) || w.startsWith(x)))).length;
  return hits / a.length;
}

export function scoreReceipt(expected: ExpectedBill, got: ExtractedBill): ReceiptScore {
  const gotItems = got.items.map((it) => ({ name: it.name, amount: Number(it.price ?? it.amount ?? 0) }));
  const used = new Set<number>();
  const missing: string[] = [];
  let matched = 0;

  for (const exp of expected.items) {
    // Best unused candidate with the same amount, then by name similarity.
    let best = -1;
    let bestSim = 0;
    gotItems.forEach((g, i) => {
      if (used.has(i) || Math.abs(g.amount - exp.amount) > 0.01) return;
      const sim = nameSimilarity(exp.name, g.name);
      if (sim > bestSim) { best = i; bestSim = sim; }
    });
    if (best >= 0 && bestSim >= 0.5) {
      used.add(best);
      matched++;
    } else {
      missing.push(`${exp.name} ₹${exp.amount}`);
    }
  }

  const extra = gotItems.filter((_, i) => !used.has(i)).map((g) => `${g.name} ₹${g.amount}`);
  const chargesSum = (got.charges ?? []).reduce((s, c) => s + Number(c.amount || 0), 0);

  return {
    totalOk: Math.abs(Number(got.total) - expected.total) <= TOLERANCE,
    chargesOk: expected.chargesTotal == null ? null : Math.abs(chargesSum - expected.chargesTotal) <= TOLERANCE,
    matched,
    expected: expected.items.length,
    extracted: gotItems.length,
    recall: expected.items.length ? matched / expected.items.length : 1,
    precision: gotItems.length ? matched / gotItems.length : expected.items.length ? 0 : 1,
    missing,
    extra,
  };
}
