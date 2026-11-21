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
// A bill appears in a month's list when it was done for you that month:
//   • it became settled (its last payment) or was closed, or
//   • your own part was paid — e.g. you paid your share — even while others
//     on the bill still owe.
// Read-only, derived from saved bills.
// ---------------------------------------------------------------------------

import type { BillGroup } from "../types/group";
import { myIdOn } from "./homeSummary";

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
  /** Bills that were done for you in this month (see historyAt), newest first. */
  settledBills: BillGroup[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const paidMonth = (tx: { paidAt?: string }, g: BillGroup) => monthKey(tx.paidAt ?? g.updatedAt ?? g.createdAt);

/** When a bill was settled (its latest payment, or last update) or closed. */
export function settledAt(g: BillGroup): string {
  if (g.status === "closed" && g.closedAt) return g.closedAt;
  const times = g.settlements.filter((t) => t.status === "paid" && t.paidAt).map((t) => t.paidAt as string);
  if (times.length === 0) return g.updatedAt ?? g.createdAt;
  return times.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

/**
 * When a bill belongs in your History, or null if it doesn't yet:
 *   closed → when it was closed;
 *   otherwise → when your last payment on it (paying or being paid) was marked
 *               paid, once none of yours is pending — based only on YOUR
 *               payments, so it never reveals when others paid;
 *   no payments of yours → a settled bill at settledAt, else not yet.
 */
export function historyAt(g: BillGroup, userId: string | undefined): string | null {
  if (g.status === "closed") return settledAt(g);
  const myId = myIdOn(g, userId);
  const mine = myId ? g.settlements.filter((t) => t.fromUserId === myId || t.toUserId === myId) : [];
  if (mine.length === 0) return g.status === "settled" ? settledAt(g) : null;
  if (mine.some((t) => t.status === "pending")) return null;
  const times = mine.filter((t) => t.status === "paid").map((t) => t.paidAt ?? g.updatedAt ?? g.createdAt);
  if (times.length === 0) return null;
  return times.reduce((a, b) => (new Date(a) > new Date(b) ? a : b));
}

export function summarizeMonth(groups: BillGroup[], userId: string | undefined, month: string): MonthSummary {
  let spent = 0;
  let received = 0;
  let paymentCount = 0;

  for (const g of groups) {
    const myId = myIdOn(g, userId);
    if (!myId) continue;
    for (const tx of g.settlements) {
      if (tx.status !== "paid" || paidMonth(tx, g) !== month) continue;
      if (tx.fromUserId === myId) { spent += tx.amount; paymentCount++; }
      else if (tx.toUserId === myId) { received += tx.amount; paymentCount++; }
    }
  }

  const settledBills = groups
    .map((g) => ({ g, at: historyAt(g, userId) }))
    .filter((x): x is { g: BillGroup; at: string } => x.at !== null && monthKey(x.at) === month)
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((x) => x.g);

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
