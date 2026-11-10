// ---------------------------------------------------------------------------
// services/billEditing.ts
//
// Editing a saved bill BEFORE anyone has paid.
//
//   Saved bill ──Edit──▶ billStore (review → participants → split) ──Save──▶
//   same BillGroup id, recalculated settlements
//
// Rule: once any settlement is marked paid the bill is locked — changing
// amounts after money has moved would make the paid rows wrong.
// ---------------------------------------------------------------------------

import type { BillGroup } from "../types/group";

/** Only the creator can edit, only bills with a receipt, and only before any payment. */
export function canEditBill(group: BillGroup | undefined, userId: string | undefined): boolean {
  if (!group || !userId) return false;
  if (group.createdBy !== userId) return false;
  if (!group.billSnapshot) return false;
  return !group.settlements.some((tx) => tx.status === "paid");
}

/** Who paid: everyone's settlement points at them; fall back to the creator. */
export function payerOf(group: BillGroup): string {
  return group.settlements[0]?.toUserId ?? group.createdBy;
}

/**
 * Merge an edited bill into the saved one: keeps its identity (id, creator,
 * creation date) and replaces the content. Throws if a payment was made in
 * the meantime.
 */
export function applyBillEdit(existing: BillGroup, edited: BillGroup): BillGroup {
  if (existing.settlements.some((tx) => tx.status === "paid")) {
    throw new Error("Someone has already paid — this bill can no longer be edited.");
  }
  return {
    ...edited,
    id: existing.id,
    createdBy: existing.createdBy,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
    contactGroupId: edited.contactGroupId ?? existing.contactGroupId,
  };
}
