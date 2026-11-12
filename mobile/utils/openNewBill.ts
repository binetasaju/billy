// After a new bill is created, open it on top of Home: the add-bill screens
// (Preview, Review, split method, participants, summary) are cleared, so
// Back from the bill goes straight Home.
import type { Router } from "expo-router";

export function openNewBill(router: Pick<Router, "canDismiss" | "dismissAll" | "push">, billId: string) {
  if (router.canDismiss()) router.dismissAll();
  router.push(`/group/${billId}` as any);
}
