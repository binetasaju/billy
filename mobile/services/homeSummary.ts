// ---------------------------------------------------------------------------
// services/homeSummary.ts
//
// Everything the Home screen shows, derived from saved bills (BillGroups):
//   • what you owe / are owed in total (pending settlements only)
//   • the pending rows themselves, biggest first (Pay / Request)
//   • people you split with most, with your net balance with each
//   • your most recent bills
// Read-only — nothing is stored.
// ---------------------------------------------------------------------------

import type { BillGroup } from "../types/group";

export interface PendingRow {
  groupId: string;
  billTitle: string;
  personId: string;
  personName: string;
  amount: number;
  createdAt: string;
}

export interface HomePerson {
  id: string;
  name: string;
  color?: string;
  /** > 0 they owe you, < 0 you owe them (pending only). */
  net: number;
  billCount: number;
}

export interface HomeSummary {
  youOwe: number;
  owedToYou: number;
  toPay: PendingRow[];
  toReceive: PendingRow[];
  people: HomePerson[];
  recent: BillGroup[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeHomeSummary(groups: BillGroup[], userId: string | undefined, limits = { people: 8, recent: 5 }): HomeSummary {
  const toPay: PendingRow[] = [];
  const toReceive: PendingRow[] = [];
  const people = new Map<string, HomePerson>();

  for (const g of groups) {
    const myId = g.participants.find((p) => p.isCurrentUser)?.id ?? userId;
    if (!myId) continue;
    const nameOf = (id: string) => g.participants.find((p) => p.id === id)?.name ?? "Someone";

    // People you split with (any bill, paid or not)
    for (const p of g.participants) {
      if (p.id === myId || p.isCurrentUser) continue;
      const existing = people.get(p.id);
      if (existing) {
        existing.billCount++;
        existing.name = existing.name || p.name;
      } else {
        people.set(p.id, { id: p.id, name: p.name, color: p.color, net: 0, billCount: 1 });
      }
    }

    for (const tx of g.settlements) {
      if (tx.status === "paid" || !(tx.amount > 0)) continue;
      if (tx.fromUserId === myId) {
        toPay.push({ groupId: g.id, billTitle: g.title, personId: tx.toUserId, personName: nameOf(tx.toUserId), amount: tx.amount, createdAt: g.createdAt });
        const p = people.get(tx.toUserId);
        if (p) p.net -= tx.amount;
      } else if (tx.toUserId === myId) {
        toReceive.push({ groupId: g.id, billTitle: g.title, personId: tx.fromUserId, personName: nameOf(tx.fromUserId), amount: tx.amount, createdAt: g.createdAt });
        const p = people.get(tx.fromUserId);
        if (p) p.net += tx.amount;
      }
    }
  }

  const byAmount = (a: PendingRow, b: PendingRow) => b.amount - a.amount;
  const peopleList = [...people.values()]
    .map((p) => ({ ...p, net: round2(p.net) }))
    // Outstanding balances first, then people you split with most.
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.billCount - a.billCount || a.name.localeCompare(b.name))
    .slice(0, limits.people);

  return {
    youOwe: round2(toPay.reduce((s, r) => s + r.amount, 0)),
    owedToYou: round2(toReceive.reduce((s, r) => s + r.amount, 0)),
    toPay: toPay.sort(byAmount),
    toReceive: toReceive.sort(byAmount),
    people: peopleList,
    recent: [...groups]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limits.recent),
  };
}
