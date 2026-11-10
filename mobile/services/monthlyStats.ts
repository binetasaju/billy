// ---------------------------------------------------------------------------
// services/monthlyStats.ts
//
// Per-month money summary for the History screen.
//
//   Spent    = what YOU paid to others that month
//   Received = what others paid YOU that month
//
// A payment counts in the month it was marked paid (paidAt), falling back to
// the bill's last update for older records without a paid date. Payments on
// bills that aren't fully settled yet still count — money moved that month.
// A bill appears in a month's list when it became settled that month (its
// last payment). Read-only, derived from saved bills.
// ---------------------------------------------------------------------------

import type { BillGroup } from "../types/group";

/** "2026-11" for a date (local time). */
export function monthKey(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Move a month key by n months (n may be negative). */
export function shiftMonth(key: string, n: number): string {
  const [y, m] = key.split("-").map(Number);
  return monthKey(new Date(y, m - 1 + n, 1));
}

/** "This month", "Last month", or e.g. "September 2026". */
export function monthLabel(key: string, now: Date = new Date()): string {
  const current = monthKey(now);
  if (key === current) return "This month";
  if (key === shiftMonth(current, -1)) return "Last month";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export interface MonthSummary {
  month: string;
  spent: number;
  received: number;
  paymentCount: number;
  /** Bills that became settled in this month, newest first. */
  settledBills: BillGroup[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const paidMonth = (tx: { paidAt?: string }, g: BillGroup) => monthKey(tx.paidAt ?? g.updatedAt ?? g.createdAt);

/** When a settled bill was settled: its latest payment (or last update). */
export function settledAt(g: BillGroup): string {
  const times = g.settlements.filter((t) => t.status === "paid" && t.paidAt).map((t) => t.paidAt as string);
  if (times.length === 0) return g.updatedAt ?? g.createdAt;
  return times.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

export function summarizeMonth(groups: BillGroup[], userId: string | undefined, month: string): MonthSummary {
  let spent = 0;
  let received = 0;
  let paymentCount = 0;

  for (const g of groups) {
    const myId = g.participants.find((p) => p.isCurrentUser)?.id ?? userId;
    if (!myId) continue;
    for (const tx of g.settlements) {
      if (tx.status !== "paid" || paidMonth(tx, g) !== month) continue;
      if (tx.fromUserId === myId) { spent += tx.amount; paymentCount++; }
      else if (tx.toUserId === myId) { received += tx.amount; paymentCount++; }
    }
  }

  const settledBills = groups
    .filter((g) => g.status === "settled" && monthKey(settledAt(g)) === month)
    .sort((a, b) => new Date(settledAt(b)).getTime() - new Date(settledAt(a)).getTime());

  return { month, spent: round2(spent), received: round2(received), paymentCount, settledBills };
}

/**
 * Months that can be browsed: from the earliest month with any bill up to the
 * current month (always included), newest first.
 */
export function browsableMonths(groups: BillGroup[], now: Date = new Date()): string[] {
  const current = monthKey(now);
  let earliest = current;
  for (const g of groups) {
    const k = monthKey(g.createdAt);
    if (k < earliest) earliest = k;
  }
  const months: string[] = [];
  for (let k = current; k >= earliest; k = shiftMonth(k, -1)) months.push(k);
  return months;
}
