import { computeHomeSummary } from "../services/homeSummary";
import type { BillGroup, GroupSettlement } from "../types/group";

const P = (id: string, name: string, isCurrentUser = false) => ({ id, name, color: "#000", itemIds: [], isCurrentUser });
const tx = (from: string, to: string, amount: number, status: "pending" | "paid" = "pending"): GroupSettlement =>
  ({ fromUserId: from, toUserId: to, amount, status });
const bill = (id: string, createdAt: string, participants: any[], settlements: GroupSettlement[]): BillGroup =>
  ({ id, title: id, createdBy: "me", participants, settlements, totalAmount: 0, createdAt, updatedAt: createdAt, status: "active" }) as BillGroup;

const me = P("me", "Me", true), ravi = P("ravi", "Ravi"), anu = P("anu", "Anu"), joe = P("joe", "Joe");

const groups = [
  bill("Dinner", "2026-11-01T00:00:00Z", [me, ravi, anu], [tx("ravi", "me", 300), tx("anu", "me", 200, "paid")]),
  bill("Cab", "2026-11-05T00:00:00Z", [me, anu], [tx("me", "anu", 120)]),
  bill("Movie", "2026-11-03T00:00:00Z", [me, ravi, joe], [tx("me", "joe", 50.5), tx("ravi", "joe", 50.5)]),
];

describe("computeHomeSummary", () => {
  const s = computeHomeSummary(groups, "me");

  it("totals only pending money, from your point of view", () => {
    expect(s.owedToYou).toBe(300);
    expect(s.youOwe).toBe(170.5);
  });

  it("lists what to pay and receive, biggest first", () => {
    expect(s.toPay.map((r) => [r.personName, r.amount, r.billTitle])).toEqual([["Anu", 120, "Cab"], ["Joe", 50.5, "Movie"]]);
    expect(s.toReceive.map((r) => [r.personName, r.amount])).toEqual([["Ravi", 300]]);
  });

  it("ranks people by outstanding balance, then how often you split", () => {
    expect(s.people.map((p) => [p.name, p.net, p.billCount])).toEqual([
      ["Ravi", 300, 2],
      ["Anu", -120, 2],
      ["Joe", -50.5, 1],
    ]);
  });

  it("shows the newest bills first", () => {
    expect(s.recent.map((g) => g.id)).toEqual(["Cab", "Movie", "Dinner"]);
  });

  it("is empty for a new user", () => {
    expect(computeHomeSummary([], "me")).toEqual({ youOwe: 0, owedToYou: 0, toPay: [], toReceive: [], people: [], recent: [] });
  });
});

describe("bills made under a different account on this phone", () => {
  // An old test login: its own "me" is flagged isCurrentUser on the bill.
  const oldMe = P("old_account", "Old me", true);
  const oldBill = bill("Old trip", "2026-06-25T00:00:00Z", [oldMe, ravi], [tx("ravi", "old_account", 31450.32)]);

  it("are not counted as mine", () => {
    const s = computeHomeSummary([...groups, oldBill], "me");
    expect(s.owedToYou).toBe(300);
    expect(s.toReceive.find((r) => r.billTitle === "Old trip")).toBeUndefined();
  });

  it("without a signed-in uid, the isCurrentUser flag is still used", () => {
    const s = computeHomeSummary([oldBill], undefined);
    expect(s.owedToYou).toBe(31450.32);
  });
});
