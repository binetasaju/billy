jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { groupStore } from "../services/groupStore";
import type { BillGroup } from "../types/group";

const bill: BillGroup = {
  id: "b1",
  title: "Dinner",
  createdBy: "me",
  participants: [],
  settlements: [
    { fromUserId: "ravi", toUserId: "me", amount: 300, status: "pending" },
    { fromUserId: "anu", toUserId: "me", amount: 200, status: "pending" },
  ],
  totalAmount: 800,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  status: "active",
};

const get = () => groupStore.get().groups.find((g) => g.id === "b1")!;

describe("groupStore payments", () => {
  beforeAll(async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await groupStore.createGroup(bill);
  });

  it("marks one settlement paid and keeps the bill active", async () => {
    await groupStore.markSettlementPaid("b1", "ravi", "me", "cash");
    const tx = get().settlements[0];
    expect(tx.status).toBe("paid");
    expect(tx.paymentMethod).toBe("cash");
    expect(get().status).toBe("active");
  });

  it("ignores a second confirmation of the same payment", async () => {
    const firstPaidAt = get().settlements[0].paidAt;
    await new Promise((r) => setTimeout(r, 5));
    await groupStore.markSettlementPaid("b1", "ravi", "me", "upi");
    expect(get().settlements[0].paidAt).toBe(firstPaidAt);
    expect(get().settlements[0].paymentMethod).toBe("cash");
  });

  it("settles the bill once everyone has paid (plain 'received' stores no method)", async () => {
    await groupStore.markSettlementPaid("b1", "anu", "me");
    expect(get().status).toBe("settled");
    expect(get().settlements[1].status).toBe("paid");
    expect(get().settlements[1].paymentMethod).toBeUndefined();
  });
});

describe("groupStore closeBill", () => {
  const b2: BillGroup = {
    ...bill,
    id: "b2",
    settlements: [
      { fromUserId: "ravi", toUserId: "me", amount: 300, status: "pending" },
      { fromUserId: "anu", toUserId: "me", amount: 200, status: "pending" },
    ],
  };
  const get2 = () => groupStore.get().groups.find((g) => g.id === "b2")!;

  beforeAll(async () => {
    await groupStore.createGroup(b2);
  });

  it("cannot close before anyone has paid (Edit is used then)", async () => {
    expect(await groupStore.closeBill("b2", "me")).toBe(false);
    expect(get2().status).toBe("active");
  });

  it("only the creator can close", async () => {
    await groupStore.markSettlementPaid("b2", "ravi", "me");
    expect(await groupStore.closeBill("b2", "anu")).toBe(false);
    expect(get2().status).toBe("active");
  });

  it("closes: unpaid rows cancelled, paid rows kept", async () => {
    expect(await groupStore.closeBill("b2", "me")).toBe(true);
    const g = get2();
    expect(g.status).toBe("closed");
    expect(g.closedAt).toBeDefined();
    expect(g.settlements.map((t) => t.status)).toEqual(["paid", "cancelled"]);
  });

  it("a cancelled row can no longer be paid", async () => {
    await groupStore.markSettlementPaid("b2", "anu", "me");
    expect(get2().settlements[1].status).toBe("cancelled");
    expect(get2().status).toBe("closed");
  });
});
