import { buildDebtRecord } from "../services/debt";
import { computeGroupBalances } from "../services/groupBalances";
import type { ContactGroup } from "../types/group";

const me = { id: "me", name: "Me", upiId: "me@ybl" };
const ravi = { id: "ravi", name: "Ravi" };
const now = new Date("2026-11-10T10:00:00Z");

describe("buildDebtRecord", () => {
  it("records money I owe as a single pending settlement from me", () => {
    const d = buildDebtRecord({ me, other: ravi, direction: "i_owe", amount: 300, now, id: "d1" });
    expect(d.settlements).toEqual([{ fromUserId: "me", toUserId: "ravi", amount: 300, status: "pending" }]);
    expect(d.title).toBe("Owed to Ravi");
    expect(d.totalAmount).toBe(300);
    expect(d.participants.map((p) => p.id)).toEqual(["me", "ravi"]);
    expect(d.customAmounts).toEqual({ me: 300, ravi: 0 });
  });

  it("records money they owe me, using the note as title", () => {
    const d = buildDebtRecord({ me, other: ravi, direction: "they_owe", amount: 199.999, note: " Cab fare ", now });
    expect(d.settlements[0]).toMatchObject({ fromUserId: "ravi", toUserId: "me", amount: 200 });
    expect(d.title).toBe("Cab fare");
  });

  it("rejects zero/negative amounts and debts with yourself", () => {
    expect(() => buildDebtRecord({ me, other: ravi, direction: "i_owe", amount: 0 })).toThrow();
    expect(() => buildDebtRecord({ me, other: ravi, direction: "i_owe", amount: -5 })).toThrow();
    expect(() => buildDebtRecord({ me, other: { id: "me", name: "Me" }, direction: "i_owe", amount: 5 })).toThrow();
  });

  it("shows up in group balances when linked to a saved group", () => {
    const group: ContactGroup = {
      id: "g1", name: "Flatmates",
      members: [{ id: "me", name: "Me", isCurrentUser: true }, { id: "ravi", name: "Ravi" }] as ContactGroup["members"],
      createdAt: now.toISOString(), updatedAt: now.toISOString(),
    };
    const debt = buildDebtRecord({ me, other: ravi, direction: "they_owe", amount: 150, contactGroupId: "g1", now });
    const b = computeGroupBalances(group, [debt], "me");
    expect(b.viewerNet).toBe(150);
    expect(b.members.find((m) => m.personId === "ravi")?.netWithViewer).toBe(150);
  });
});
