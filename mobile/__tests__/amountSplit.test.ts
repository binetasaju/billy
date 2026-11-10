jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { billStore } from "../services/billStore";
import { calculateSettlement, rebalanceCustomAmounts } from "../services/calculateSettlement";
import type { ContactGroup } from "../types/group";
import type { User } from "../types/user";

const user = { uid: "me", name: "Bineta", phoneNumber: "+919876543210", upiId: "me@ybl" } as User;
const group: ContactGroup = {
  id: "g1",
  name: "Goa trip",
  members: [
    { id: "me", name: "Bineta", isCurrentUser: true },
    { id: "ravi", name: "Ravi" },
    { id: "anu", name: "Anu" },
  ] as ContactGroup["members"],
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
};

describe("Split an Amount (from a saved group)", () => {
  beforeEach(() => billStore.startAmountSplit(group, user));

  it("starts a custom split where you paid and every member shares", () => {
    const s = billStore.get()!;
    expect(s.amountOnly).toBe(true);
    expect(s.splitMethod).toBe("custom");
    expect(s.payerId).toBe("me");
    expect(s.contactGroupId).toBe("g1");
    expect(s.participants.map((p) => p.id)).toEqual(["me", "ravi", "anu"]);
    expect(s.bill.total).toBe(0);
  });

  it("the typed total becomes the bill and drives the split", () => {
    billStore.setAmountOnlyTotal("Cab to airport", 900);
    const s = billStore.get()!;
    expect(s.bill.total).toBe(900);
    expect(s.bill.restaurant).toBe("Cab to airport");
    expect(s.bill.items).toHaveLength(1);

    const amounts = rebalanceCustomAmounts(s.bill.total, s.participants.map((p) => p.id), { me: 0 });
    expect(amounts).toEqual({ me: 0, ravi: 450, anu: 450 });
    const r = calculateSettlement({
      payerId: "me", splitMethod: "custom", participants: s.participants, items: s.bill.items, customAmounts: amounts,
    });
    expect(r.settlements).toEqual([
      { fromUserId: "ravi", toUserId: "me", amount: 450 },
      { fromUserId: "anu", toUserId: "me", amount: 450 },
    ]);
  });

  it("clearing the total empties the bill", () => {
    billStore.setAmountOnlyTotal("x", 0);
    expect(billStore.get()!.bill.items).toHaveLength(0);
    expect(billStore.get()!.bill.total).toBe(0);
  });
});
