// ---------------------------------------------------------------------------
// services/saveSplit.ts
//
// Shared "Save" for the equal / item-wise / custom split screens: creates a
// new saved bill, or — when the split flow was opened via "Edit Bill" —
// updates the existing one (keeping its id and history).
// ---------------------------------------------------------------------------

import type { BillGroup } from "../types/group";
import { billStore } from "./billStore";
import { groupStore } from "./groupStore";
import { applyBillEdit } from "./billEditing";

/** Returns the id of the saved bill. */
export async function saveSplit(group: BillGroup): Promise<string> {
  const editingId = billStore.get()?.editingGroupId;
  if (editingId) {
    const existing = groupStore.get().groups.find((g) => g.id === editingId);
    if (existing) {
      await groupStore.replaceGroup(applyBillEdit(existing, group));
      return editingId;
    }
  }
  await groupStore.createGroup(group);
  return group.id;
}
