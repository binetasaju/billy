// After a new bill is created, the screen history becomes exactly
// [Home, the bill]: the add-bill screens (Preview, Review, split method,
// participants, summary) are gone, so the back button, Android back and the
// back swipe all go straight Home.
//
// One `reset` does it in a single step. (Clearing the screens and then
// opening the bill as two separate steps could leave the old screens behind.)
import type { Router } from "expo-router";

type Nav = { reset: (state: { index: number; routes: { name: string; params?: object }[] }) => void };

export function openNewBill(navigation: Nav, router: Pick<Router, "canDismiss" | "dismissAll" | "push">, billId: string) {
  try {
    navigation.reset({
      index: 1,
      routes: [{ name: "(tabs)" }, { name: "group/[id]", params: { id: billId } }],
    });
  } catch {
    if (router.canDismiss()) router.dismissAll();
    router.push(`/group/${billId}` as any);
  }
}
