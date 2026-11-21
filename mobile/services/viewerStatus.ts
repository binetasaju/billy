// ---------------------------------------------------------------------------
// services/viewerStatus.ts — what YOU may see about a bill's payments
//
// Only the person who is owed money on a bill (the one who paid it) sees how
// everyone else is doing — "2 of 3 paid", the progress bar, "Settled".
// Everyone else only sees their own part: "To pay" or "Paid".
// A closed bill shows "Closed" to everyone.
// ---------------------------------------------------------------------------

import type { BillGroup } from "../types/group";
import type { BillStatus } from "@/components/ui/StatusBadge";
import { myIdOn } from "./homeSummary";

/** True when money on this bill is owed to me — then I may see everyone's payments. */
export function isOwedOn(g: BillGroup, userId: string | undefined): boolean {
  const myId = myIdOn(g, userId);
  return !!myId && g.settlements.some((t) => t.toUserId === myId);
}

export interface ViewerStatus {
  /** Colour of the pill: amber active, green settled, grey closed. */
  status: BillStatus;
  /** Text to show, e.g. "Settled", "2 of 3 paid", "To pay", "Paid". */
  label: string;
  /** May this viewer see everyone's payment progress? */
  seesEveryone: boolean;
}

export function statusForMe(g: BillGroup, userId: string | undefined): ViewerStatus {
  const seesEveryone = isOwedOn(g, userId);
  if (g.status === "closed") return { status: "closed", label: "Closed", seesEveryone };

  if (seesEveryone) {
    if (g.status === "settled") return { status: "settled", label: "Settled", seesEveryone };
    const paid = g.settlements.filter((t) => t.status === "paid").length;
    return {
      status: "active",
      label: paid > 0 ? `${paid} of ${g.settlements.length} paid` : "Active",
      seesEveryone,
    };
  }

  // Not owed anything: only my own payment matters.
  const myId = myIdOn(g, userId);
  const mine = myId ? g.settlements.filter((t) => t.fromUserId === myId) : [];
  if (mine.some((t) => t.status === "pending")) return { status: "active", label: "To pay", seesEveryone };
  if (mine.some((t) => t.status === "paid")) return { status: "settled", label: "Paid", seesEveryone };
  return { status: "settled", label: "Nothing to pay", seesEveryone };
}
