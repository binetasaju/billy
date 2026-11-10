import { applyBillEdit, canEditBill, payerOf } from "../services/billEditing";
import type { BillGroup, GroupSettlement } from "../types/group";

const tx = (from: string, to: string, amount: number, status: "pending" | "paid" = "pending"): GroupSettlement =>
  ({ fromUserId: from, toUserId: to, amount, status });

const bill = (over: Partial<BillGroup> = {}): BillGroup =>
  ({
    id: "b1",
    title: "Dinner",
    createdBy: "me",
    participants: [],
    settlements: [tx("ravi", "me", 300), tx("anu", "me", 200)],
    totalAmount: 800,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    status: "active",
    billSnapshot: { isBill: true, restaurant: "X", billNumber: "", date: "", items: [], total: 800 },
    ...over,
  }) as BillGroup;

describe("canEditBill", () => {
  it("lets the creator edit before anyone pays", () => {
    expect(canEditBill(bill(), "me")).toBe(true);
  });
  it("locks the bill after the first payment", () => {
    expect(canEditBill(bill({ settlements: [tx("ravi", "me", 300, "paid"), tx("anu", "me", 200)] }), "me")).toBe(false);
  });
  it("only the creator can edit", () => {
    expect(canEditBill(bill(), "ravi")).toBe(false);
    expect(canEditBill(bill(), undefined)).toBe(false);
  });
  it("debts without a receipt are not editable as bills", () => {
    expect(canEditBill(bill({ billSnapshot: undefined }), "me")).toBe(false);
  });
});

describe("payerOf", () => {
  it("is who the settlements point to, else the creator", () => {
    expect(payerOf(bill())).toBe("me");
    expect(payerOf(bill({ settlements: [tx("me", "ravi", 10)] }))).toBe("ravi");
    expect(payerOf(bill({ settlements: [] }))).toBe("me");
  });
});

describe("applyBillEdit", () => {
  it("keeps the bill's identity and replaces its content", () => {
    const edited = bill({ id: "new-id", createdAt: "2026-11-10T00:00:00Z", totalAmount: 900, settlements: [tx("ravi", "me", 450)] });
    const merged = applyBillEdit(bill(), edited);
    expect(merged.id).toBe("b1");
    expect(merged.createdAt).toBe("2026-11-01T00:00:00Z");
    expect(merged.totalAmount).toBe(900);
    expect(merged.settlements).toEqual([tx("ravi", "me", 450)]);
  });
  it("refuses once someone has paid", () => {
    const paid = bill({ settlements: [tx("ravi", "me", 300, "paid")] });
    expect(() => applyBillEdit(paid, bill())).toThrow(/already paid/);
  });
});
