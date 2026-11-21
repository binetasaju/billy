import { browsableMonths, historyAt, monthKey, monthLabel, shiftMonth, summarizeMonth } from "../services/monthlyStats";
import type { BillGroup, GroupSettlement } from "../types/group";

const me = { id: "me", name: "Me", color: "", itemIds: [], isCurrentUser: true };
const ravi = { id: "ravi", name: "Ravi", color: "", itemIds: [] };
const tx = (from: string, to: string, amount: number, paidAt?: string): GroupSettlement =>
  ({ fromUserId: from, toUserId: to, amount, status: paidAt ? "paid" : "pending", ...(paidAt ? { paidAt } : {}) });
const bill = (id: string, createdAt: string, settlements: GroupSettlement[], status: "active" | "settled", updatedAt = createdAt): BillGroup =>
  ({ id, title: id, createdBy: "me", participants: [me, ravi], settlements, totalAmount: 0, createdAt, updatedAt, status }) as BillGroup;

const groups = [
  // Created in Oct, Ravi paid me in Nov → received counts in Nov, settled in Nov
  bill("Dinner", "2026-10-28T12:00:00", [tx("ravi", "me", 300, "2026-11-02T10:00:00")], "settled"),
  // I paid Ravi in Nov; bill still active because another payment is pending
  bill("Cab", "2026-11-05T09:00:00", [tx("me", "ravi", 120, "2026-11-05T20:00:00"), tx("x", "ravi", 50)], "active"),
  // Settled in October
  bill("Movie", "2026-10-03T19:00:00", [tx("me", "ravi", 250.5, "2026-10-04T10:00:00")], "settled"),
  // Old record without paidAt → falls back to updatedAt (Sep)
  bill("Old", "2026-09-01T10:00:00", [{ fromUserId: "ravi", toUserId: "me", amount: 80, status: "paid" }], "settled", "2026-09-10T10:00:00"),
];

describe("month helpers", () => {
  it("builds and shifts month keys across years", () => {
    expect(monthKey("2026-11-11T10:00:00")).toBe("2026-11");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
  it("labels this month and last month in words", () => {
    const now = new Date("2026-11-11T10:00:00");
    expect(monthLabel("2026-11", now)).toBe("This month");
    expect(monthLabel("2026-10", now)).toBe("Last month");
    expect(monthLabel("2026-09", now)).toMatch(/September\s+2026/);
  });
  it("lets you browse from the first bill's month to now, newest first", () => {
    expect(browsableMonths(groups, new Date("2026-11-11T10:00:00"))).toEqual(["2026-11", "2026-10", "2026-09"]);
    expect(browsableMonths([], new Date("2026-11-11T10:00:00"))).toEqual(["2026-11"]);
  });
});

describe("summarizeMonth", () => {
  it("counts money in the month it was paid, including partly-paid bills", () => {
    const nov = summarizeMonth(groups, "me", "2026-11");
    expect(nov.received).toBe(300);
    expect(nov.spent).toBe(120);
    expect(nov.paymentCount).toBe(2);
    // Cab is still active (someone else owes), but I paid my part → in my History
    expect(nov.settledBills.map((g) => g.id)).toEqual(["Cab", "Dinner"]);
  });
  it("recalculates for another month", () => {
    const oct = summarizeMonth(groups, "me", "2026-10");
    expect(oct).toMatchObject({ spent: 250.5, received: 0, paymentCount: 1 });
    expect(oct.settledBills.map((g) => g.id)).toEqual(["Movie"]);
  });
  it("falls back to the bill's last update for old payments without a date", () => {
    expect(summarizeMonth(groups, "me", "2026-09")).toMatchObject({ received: 80, spent: 0 });
  });
  it("is empty for a month with no activity", () => {
    expect(summarizeMonth(groups, "me", "2026-08")).toEqual({ month: "2026-08", spent: 0, received: 0, paymentCount: 0, settledBills: [] });
  });
});

describe("historyAt", () => {
  it("lists an active bill once my own payment is paid, at that payment's date", () => {
    expect(historyAt(groups[1], "me")).toBe("2026-11-05T20:00:00");
  });
  it("keeps an active bill out while I still owe or am still owed", () => {
    const iOwe = bill("A", "2026-11-01T10:00:00", [tx("me", "ravi", 50), tx("x", "ravi", 20, "2026-11-02T10:00:00")], "active");
    const owedToMe = bill("B", "2026-11-01T10:00:00", [tx("ravi", "me", 50), tx("x", "me", 20, "2026-11-02T10:00:00")], "active");
    expect(historyAt(iOwe, "me")).toBeNull();
    expect(historyAt(owedToMe, "me")).toBeNull();
  });
  it("keeps an active bill out when I have no payment on it", () => {
    expect(historyAt(bill("C", "2026-11-01T10:00:00", [tx("x", "ravi", 20)], "active"), "me")).toBeNull();
  });
});
