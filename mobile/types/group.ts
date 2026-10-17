// ---------------------------------------------------------------------------
// types/group.ts
//
// Billy Group model.
// Firebase-ready: id maps to Firestore Document ID, createdBy to auth UID.
// ---------------------------------------------------------------------------

import type { Person, ParsedBill } from "./bill";
import type { SettlementTransaction } from "../services/calculateSettlement";

export interface GroupSettlement extends SettlementTransaction {
  status: "pending" | "paid";
  paidAt?: string;
  paymentMethod?: "upi" | "cash" | "other";
}

// ── Reusable contact group ───────────────────────────────────────────────────
//
//   ContactGroup  ── prefills participants for ──▶  BillGroup ──▶ Settlement
//
// A ContactGroup is a saved list of PEOPLE (contact identity: name + phone).
// It is not a settlement record and carries no money. Starting a bill copies
// its members into that bill's participants; the BillGroup snapshot taken at
// settlement time stays frozen and is never affected by later edits here.

/** A saved person. Contact identity only — payment identity stays on their own profile. */
export type GroupMember = Omit<Person, "itemIds" | "upiId">;

export interface ContactGroup {
  /** Local UUID */
  id: string;
  /** Display name of the group, e.g. "Flatmates" */
  name: string;
  members: GroupMember[];
  /** ISO 8601 */
  createdAt: string;
  /** ISO 8601 — bumped on rename / member changes */
  updatedAt: string;
}

export interface BillGroup {
  /** Local UUID or Firestore Document ID */
  id: string;

  /** Display name of the group */
  title: string;

  /** Firebase Auth UID of the creator */
  createdBy: string;

  /** Snapshot of participants when group was created/updated */
  participants: Person[];

  /** The final calculated settlements for the bill (with payment tracking state) */
  settlements: GroupSettlement[];

  /** Total bill amount (extracted from parsed bill) */
  totalAmount: number;

  // Payment progress is NOT stored separately — it is derived from
  // settlements[] (status/paidAt/paymentMethod), which is the single source of
  // truth for who has paid. See groupStore.deriveStatus().

  /** ISO 8601 timestamp */
  createdAt: string;

  /** ISO 8601 timestamp */
  updatedAt: string;

  /** Group status */
  status: "active" | "settled";

  /** Original parsed bill snapshot */
  billSnapshot?: ParsedBill;

  /**
   * The reusable ContactGroup this bill's participants were prefilled from,
   * if any. A backward reference only — the participants above remain the
   * frozen record for settlement and are never re-read from the group.
   */
  contactGroupId?: string;
}
