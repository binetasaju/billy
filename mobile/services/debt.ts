// ---------------------------------------------------------------------------
// services/debt.ts
//
// "Owe someone" — money YOU owe someone, with no receipt (cash loan, cab
// fare, ...). Only this direction is supported.
//
// It is stored as an ordinary BillGroup with two participants, no items and a
// single settlement row, so group balances, Pay Bills, History and UPI pay
// all handle it with no special cases.
// ---------------------------------------------------------------------------

import type { Person } from "../types/bill";
import type { BillGroup } from "../types/group";

export interface DebtInput {
  me: { id: string; name: string; upiId?: string };
  other: { id: string; name: string; phone?: string; color?: string };
  amount: number;
  note?: string;
  contactGroupId?: string;
  /** Injectable for tests. */
  now?: Date;
  id?: string;
}

export function buildDebtRecord(input: DebtInput): BillGroup {
  const { me, other, note, contactGroupId } = input;
  const amount = Math.round(input.amount * 100) / 100;
  if (!(amount > 0)) throw new Error("Amount must be greater than zero.");
  if (me.id === other.id) throw new Error("Pick someone other than yourself.");

  const now = (input.now ?? new Date()).toISOString();
  const mePerson: Person = { id: me.id, name: me.name, color: "#1D4ED8", itemIds: [], isCurrentUser: true, upiId: me.upiId };
  const otherPerson: Person = {
    id: other.id,
    name: other.name,
    phone: other.phone,
    color: other.color ?? "#059669",
    itemIds: [],
  };

  // I owe them: the single settlement runs from me to them.
  const fromUserId = me.id;
  const toUserId = other.id;
  const title = note?.trim() || `Owed to ${other.name}`;

  return {
    id: input.id ?? `debt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    title,
    createdBy: me.id,
    participants: [mePerson, otherPerson],
    settlements: [{ fromUserId, toUserId, amount, status: "pending" }],
    totalAmount: amount,
    createdAt: now,
    updatedAt: now,
    status: "active",
    contactGroupId,
    splitMethod: "custom",
    customAmounts: { [fromUserId]: amount, [toUserId]: 0 },
  };
}
