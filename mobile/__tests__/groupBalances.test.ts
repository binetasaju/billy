import { computeGroupBalances, describeBalance, getLinkedBills } from "../services/groupBalances";
import type { BillGroup, ContactGroup, GroupSettlement } from "../types/group";

const group: ContactGroup = {
  id: "g1",
  name: "Flatmates",
  members: [
    { id: "me", name: "Me", isCurrentUser: true },
    { id: "ravi", name: "Ravi" },
    { id: "anu", name: "Anu" },
  ] as ContactGroup["members"],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const tx = (from: string, to: string, amount: number, status: "pending" | "paid" = "pending"): GroupSettlement => ({
  fromUserId: from,
  toUserId: to,
  amount,
  status,
});

const bill = (id: string, settlements: GroupSettlement[], opts: Partial<BillGroup> = {}): BillGroup =>
  ({
    id,
    title: id,
    createdBy: "me",
    participants: [],
    settlements,
    totalAmount: 0,
    createdAt: "2026-02-01T00:00:00Z",
    updatedAt: "2026-02-01T00:00:00Z",
    status: "active",
    contactGroupId: "g1",
    ...opts,
  }) as BillGroup;

const byId = (r: ReturnType<typeof computeGroupBalances>, id: string) =>
  r.members.find((m) => m.personId === id)!;

describe("computeGroupBalances", () => {
  it("aggregates pending settlements across linked bills only", () => {
    const r = computeGroupBalances(group, [
      bill("b1", [tx("ravi", "me", 100), tx("anu", "me", 50)]),
      bill("b2", [tx("me", "ravi", 30)]),
      bill("other", [tx("ravi", "me", 999)], { contactGroupId: "someone-else" }),
    ]);
    expect(r.linkedBillCount).toBe(2);
    expect(r.viewerNet).toBe(120);
    expect(byId(r, "ravi").netWithViewer).toBe(70);
    expect(byId(r, "anu").netWithViewer).toBe(50);
    expect(r.totalOutstanding).toBe(180);
  });

  it("ignores paid settlements", () => {
    const r = computeGroupBalances(group, [bill("b1", [tx("ravi", "me", 100, "paid"), tx("anu", "me", 40)])]);
    expect(byId(r, "ravi").netWithViewer).toBe(0);
    expect(r.viewerNet).toBe(40);
    expect(r.totalOutstanding).toBe(40);
  });

  it("keeps former members who still owe money, flagged as not current", () => {
    const r = computeGroupBalances(group, [bill("b1", [tx("old", "me", 25)])]);
    const old = byId(r, "old");
    expect(old.isCurrentMember).toBe(false);
    expect(old.netWithViewer).toBe(25);
  });

  it("treats float dust as settled", () => {
    const r = computeGroupBalances(group, [bill("b1", [tx("ravi", "me", 0.1), tx("ravi", "me", 0.2), tx("me", "ravi", 0.3)])]);
    expect(byId(r, "ravi").netWithViewer).toBe(0);
  });

  it("uses an explicit viewer id over the group's current-user flag", () => {
    const r = computeGroupBalances(group, [bill("b1", [tx("anu", "ravi", 60)])], "ravi");
    expect(r.viewerNet).toBe(60);
    expect(byId(r, "anu").netWithViewer).toBe(60);
  });
});

describe("getLinkedBills", () => {
  it("returns only linked bills, newest first", () => {
    const linked = getLinkedBills(group, [
      bill("old", [], { createdAt: "2026-01-01T00:00:00Z" }),
      bill("new", [], { createdAt: "2026-03-01T00:00:00Z" }),
      bill("x", [], { contactGroupId: "nope" }),
    ]);
    expect(linked.map((b) => b.id)).toEqual(["new", "old"]);
  });
});

describe("describeBalance", () => {
  const base = { personId: "p", name: "Ravi", net: 0, netWithViewer: 0, isCurrentMember: true, isViewer: false };
  it("describes each direction", () => {
    expect(describeBalance({ ...base, netWithViewer: 70 })).toBe("Ravi owes you ₹70.00");
    expect(describeBalance({ ...base, netWithViewer: -30 })).toBe("You owe ₹30.00");
    expect(describeBalance({ ...base, net: 10 })).toBe("Is owed ₹10.00 in this group");
    expect(describeBalance(base)).toBe("Settled up");
    expect(describeBalance({ ...base, isViewer: true, net: 5 })).toBe("You are owed ₹5.00 overall");
    expect(describeBalance({ ...base, isViewer: true })).toBe("You're settled up");
  });
});
