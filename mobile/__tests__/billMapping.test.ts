import { toLocalBill, toCloudBill, paymentId, newInviteCode, myCloudPid, stripUndefined } from "../services/cloud/billMapping";
import type { BillGroup } from "../types/group";

const asha = { billyUid: "mock_asha", authUid: "fb_asha" }; // migrated account: ids differ
const anu = { billyUid: "fb_anu", authUid: "fb_anu" };       // new account: ids equal

// A bill Asha made on her phone: Ravi added by email (linked), Anu from contacts (not linked).
const local: BillGroup = {
  id: "b1",
  title: "Dinner",
  createdBy: "mock_asha",
  participants: [
    { id: "mock_asha", name: "Asha", itemIds: ["i1"], isCurrentUser: true, upiId: "asha@ok" },
    { id: "fb_ravi", name: "Ravi", itemIds: ["i2"], authUid: "fb_ravi" },
    { id: "c_17", name: "Anu", phone: "+919876543210", itemIds: ["i3"] },
  ],
  settlements: [
    { fromUserId: "fb_ravi", toUserId: "mock_asha", amount: 300, status: "paid", paidAt: "2026-11-10T00:00:00Z" },
    { fromUserId: "c_17", toUserId: "mock_asha", amount: 250.5, status: "pending" },
  ],
  totalAmount: 850.5,
  createdAt: "2026-11-10T00:00:00Z",
  updatedAt: "2026-11-10T00:00:00Z",
  status: "active",
  splitMethod: "custom",
  customAmounts: { mock_asha: 300, fb_ravi: 300, c_17: 250.5 },
};

describe("toCloudBill (creator's phone → Firestore)", () => {
  const { bill, payments } = toCloudBill(local, asha, undefined, "code123");

  it("keeps participant ids and links accounts", () => {
    expect(bill.participants.map((p) => p.id)).toEqual(["mock_asha", "fb_ravi", "c_17"]);
    expect(bill.participantUids).toEqual({ mock_asha: "fb_asha", fb_ravi: "fb_ravi" });
    expect(bill.memberUids.sort()).toEqual(["fb_asha", "fb_ravi"]);
    expect(bill.createdBy).toBe("fb_asha");
    expect(bill.createdByPid).toBe("mock_asha");
    expect(bill.inviteCode).toBe("code123");
  });

  it("does not store phone-only flags", () => {
    expect(bill.participants.some((p) => "isCurrentUser" in p || "authUid" in p)).toBe(false);
  });

  it("writes one payment doc per settlement", () => {
    expect(Object.keys(payments).sort()).toEqual([paymentId("c_17", "mock_asha"), paymentId("fb_ravi", "mock_asha")].sort());
    expect(payments[paymentId("fb_ravi", "mock_asha")]).toMatchObject({ status: "paid", amount: 300 });
  });
});

describe("toLocalBill (Firestore → each person's phone)", () => {
  const { bill, payments } = toCloudBill(local, asha, undefined, "code123");
  const pays = Object.values(payments);

  it("round-trips for the creator", () => {
    const back = toLocalBill("b1", bill, pays, asha);
    expect(back.createdBy).toBe("mock_asha");
    expect(back.participants.find((p) => p.isCurrentUser)?.id).toBe("mock_asha");
    expect(back.settlements).toEqual([
      { fromUserId: "fb_ravi", toUserId: "mock_asha", amount: 300, status: "paid", paidAt: "2026-11-10T00:00:00Z" },
      { fromUserId: "c_17", toUserId: "mock_asha", amount: 250.5, status: "pending" },
    ]);
    expect(back.customAmounts).toEqual(local.customAmounts);
    expect(back.status).toBe("active");
    expect(back.inCloud).toBe(true);
  });

  it("after Anu joins as c_17, her phone shows her as 'me' under her own uid", () => {
    const joined = { ...bill, participantUids: { ...bill.participantUids, c_17: "fb_anu" }, memberUids: [...bill.memberUids, "fb_anu"] };
    const view = toLocalBill("b1", joined, pays, anu);
    const me = view.participants.find((p) => p.isCurrentUser)!;
    expect(me.id).toBe("fb_anu");
    expect(me.name).toBe("Anu");
    expect(view.settlements[1]).toMatchObject({ fromUserId: "fb_anu", toUserId: "mock_asha", amount: 250.5 });
    expect(view.customAmounts?.fb_anu).toBe(250.5);
    expect(view.createdBy).toBe("mock_asha"); // Anu isn't the creator
    expect(view.participants.find((p) => p.id === "fb_ravi")?.authUid).toBe("fb_ravi");
  });

  it("an edit by the creator keeps everyone already linked", () => {
    const joined = { ...bill, participantUids: { ...bill.participantUids, c_17: "fb_anu" }, memberUids: [...bill.memberUids, "fb_anu"] };
    const edited = { ...toLocalBill("b1", joined, pays, asha), title: "Dinner (fixed)" };
    const again = toCloudBill(edited, asha, joined).bill;
    expect(again.participantUids).toEqual({ mock_asha: "fb_asha", fb_ravi: "fb_ravi", c_17: "fb_anu" });
    expect(again.memberUids.sort()).toEqual(["fb_anu", "fb_asha", "fb_ravi"]);
    expect(again.inviteCode).toBe("code123");
    expect(again.title).toBe("Dinner (fixed)");
  });

  it("a closed bill comes back closed", () => {
    const closed = { ...bill, closed: true, closedAt: "2026-11-11T00:00:00Z" };
    expect(toLocalBill("b1", closed, pays, asha).status).toBe("closed");
  });

  it("all paid → settled", () => {
    const paid = pays.map((p) => ({ ...p, status: "paid" as const }));
    expect(toLocalBill("b1", bill, paid, asha).status).toBe("settled");
  });
});

describe("helpers", () => {
  it("invite codes are long and differ", () => {
    const a = newInviteCode(), b = newInviteCode();
    expect(a).toMatch(/^[0-9a-z]{24}$/);
    expect(a).not.toBe(b);
  });
  it("finds my cloud participant id", () => {
    expect(myCloudPid({ c_17: "fb_anu" }, "fb_anu")).toBe("c_17");
    expect(myCloudPid({ c_17: "fb_anu" }, "x")).toBeNull();
  });
  it("drops undefined values deeply", () => {
    expect(stripUndefined({ a: 1, b: undefined, c: [{ d: undefined, e: 2 }] })).toEqual({ a: 1, c: [{ e: 2 }] });
  });
});
