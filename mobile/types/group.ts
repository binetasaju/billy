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

  /** Payment Tracking */
  amountPaid?: number;
  amountPending?: number;
  paidParticipantIds?: string[];

  /** ISO 8601 timestamp */
  createdAt: string;

  /** ISO 8601 timestamp */
  updatedAt: string;

  /** Group status */
  status: "active" | "settled";

  /** Original parsed bill snapshot */
  billSnapshot?: ParsedBill;
}
