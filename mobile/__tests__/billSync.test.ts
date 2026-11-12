import { createFakeCloud } from "./helpers/fakeCloudDb";
import { startBillSync, getInvite, joinBill } from "../services/cloud/billSync";
import type { BillGroup } from "../types/group";

const asha = { billyUid: "fb_asha", authUid: "fb_asha" };
const anu = { billyUid: "fb_anu", authUid: "fb_anu" };

const newBill = (): BillGroup => ({
  id: "b1",
  title: "Dinner",
  createdBy: "fb_asha",
  participants: [
    { id: "fb_asha", name: "Asha", itemIds: [], isCurrentUser: true },
    { id: "c_17", name: "Anu", itemIds: [] },
    { id: "fb_ravi", name: "Ravi", itemIds: [], authUid: "fb_ravi" },
  ],
  settlements: [
    { fromUserId: "c_17", toUserId: "fb_asha", amount: 250, status: "pending" },
    { fromUserId: "fb_ravi", toUserId: "fb_asha", amount: 300, status: "pending" },
  ],
  totalAmount: 800,
  createdAt: "2026-11-11T00:00:00Z",
  updatedAt: "2026-11-11T00:00:00Z",
  status: "active",
});

describe("bill sync between phones", () => {
  it("a new bill reaches everyone linked to it, but not unlinked contacts", async () => {
    const cloud = createFakeCloud();
    let ashaBills: BillGroup[] = [];
    let raviBills: BillGroup[] = [];
    let anuBills: BillGroup[] = [];
    const a = startBillSync(cloud.connect(), asha, (b) => (ashaBills = b));
    startBillSync(cloud.connect(), { billyUid: "fb_ravi", authUid: "fb_ravi" }, (b) => (raviBills = b));
    startBillSync(cloud.connect(), anu, (b) => (anuBills = b));

    await a.saveBill(newBill());
    expect(ashaBills.map((b) => b.id)).toEqual(["b1"]);
    expect(raviBills.map((b) => b.id)).toEqual(["b1"]); // added by email → sees it now
    expect(anuBills).toEqual([]); // contact only → must join
    expect(raviBills[0].participants.find((p) => p.isCurrentUser)?.id).toBe("fb_ravi");
  });

  it("Anu joins with the link and then sees the bill as herself", async () => {
    const cloud = createFakeCloud();
    let anuBills: BillGroup[] = [];
    const a = startBillSync(cloud.connect(), asha, () => {});
    await a.saveBill(newBill());
    const code = (await cloud.connect().get("bills/b1"))!.inviteCode as string;

    const invite = await getInvite(cloud.connect(), code);
    expect(invite).toMatchObject({ billId: "b1", title: "Dinner", payerName: "Asha" });
    expect(invite!.participants.find((p) => p.name === "Anu")?.linked).toBe(false);

    startBillSync(cloud.connect(), anu, (b) => (anuBills = b));
    await joinBill(cloud.connect(), anu.authUid, "b1", code, "c_17");
    const mine = anuBills[0];
    expect(mine.participants.find((p) => p.isCurrentUser)).toMatchObject({ id: "fb_anu", name: "Anu" });
    expect(mine.settlements[0]).toMatchObject({ fromUserId: "fb_anu", toUserId: "fb_asha", amount: 250 });
  });

  it("a payment marked on one phone shows as paid on the other (no 'received' tap)", async () => {
    const cloud = createFakeCloud();
    let ashaBills: BillGroup[] = [];
    let anuBills: BillGroup[] = [];
    const a = startBillSync(cloud.connect(), asha, (b) => (ashaBills = b));
    await a.saveBill(newBill());
    const code = (await cloud.connect().get("bills/b1"))!.inviteCode as string;
    const n = startBillSync(cloud.connect(), anu, (b) => (anuBills = b));
    await joinBill(cloud.connect(), anu.authUid, "b1", code, "c_17");

    await n.markPaid("b1", "fb_anu", "fb_asha", "upi"); // Anu's phone ids
    const onAsha = ashaBills[0].settlements.find((s) => s.fromUserId === "c_17")!;
    expect(onAsha.status).toBe("paid");
    expect(onAsha.paymentMethod).toBe("upi");
    expect(anuBills[0].settlements[0].status).toBe("paid");
  });

  it("closing cancels unpaid payments everywhere; deleting removes the bill", async () => {
    const cloud = createFakeCloud();
    let raviBills: BillGroup[] = [];
    const a = startBillSync(cloud.connect(), asha, () => {});
    startBillSync(cloud.connect(), { billyUid: "fb_ravi", authUid: "fb_ravi" }, (b) => (raviBills = b));
    await a.saveBill(newBill());
    await a.markPaid("b1", "fb_ravi", "fb_asha");
    await a.closeBill("b1");
    expect(raviBills[0].status).toBe("closed");
    expect(raviBills[0].settlements.map((s) => s.status)).toEqual(["cancelled", "paid"]);

    await a.deleteBill("b1");
    expect(raviBills).toEqual([]);
    expect([...cloud.docs.keys()].some((k) => k.startsWith("bills/b1") || k.startsWith("invites/"))).toBe(false);
  });

  it("an edit by the creator updates payments and keeps joined people", async () => {
    const cloud = createFakeCloud();
    let ashaBills: BillGroup[] = [];
    let anuBills: BillGroup[] = [];
    const a = startBillSync(cloud.connect(), asha, (b) => (ashaBills = b));
    await a.saveBill(newBill());
    const code = (await cloud.connect().get("bills/b1"))!.inviteCode as string;
    startBillSync(cloud.connect(), anu, (b) => (anuBills = b));
    await joinBill(cloud.connect(), anu.authUid, "b1", code, "c_17");

    const edited: BillGroup = {
      ...ashaBills[0],
      title: "Dinner (fixed)",
      settlements: [{ fromUserId: "c_17", toUserId: "fb_asha", amount: 200, status: "pending" }],
    };
    await a.saveBill(edited);
    expect(anuBills[0].title).toBe("Dinner (fixed)");
    expect(anuBills[0].settlements).toEqual([{ fromUserId: "fb_anu", toUserId: "fb_asha", amount: 200, status: "pending" }]);
  });

  it("only the creator's phone writes bill edits", async () => {
    const cloud = createFakeCloud();
    let raviBills: BillGroup[] = [];
    const a = startBillSync(cloud.connect(), asha, () => {});
    const r = startBillSync(cloud.connect(), { billyUid: "fb_ravi", authUid: "fb_ravi" }, (b) => (raviBills = b));
    await a.saveBill(newBill());
    await r.saveBill({ ...raviBills[0], title: "Ravi's now" });
    expect((await cloud.connect().get("bills/b1"))!.title).toBe("Dinner");
  });
});

describe("UPI IDs from profiles", () => {
  it("someone added by name gets their UPI ID once they join, so others can Pay them", async () => {
    const cloud = createFakeCloud();
    // Anu has a Billy profile with a UPI ID.
    await cloud.connect().set("users/fb_anu", { name: "Anu", upiId: "anu@okaxis" });

    // Asha's bill: Anu (added by name) paid; Ravi owes Anu.
    const bill: BillGroup = {
      ...newBill(),
      participants: [
        { id: "fb_asha", name: "Asha", itemIds: [], isCurrentUser: true },
        { id: "c_17", name: "Anu", itemIds: [] },
        { id: "fb_ravi", name: "Ravi", itemIds: [], authUid: "fb_ravi" },
      ],
      settlements: [{ fromUserId: "fb_ravi", toUserId: "c_17", amount: 300, status: "pending" }],
    };
    let raviBills: BillGroup[] = [];
    const a = startBillSync(cloud.connect(), asha, () => {});
    startBillSync(cloud.connect(), { billyUid: "fb_ravi", authUid: "fb_ravi" }, (b) => (raviBills = b));
    await a.saveBill(bill);
    expect(raviBills[0].participants.find((p) => p.name === "Anu")?.upiId).toBeUndefined();

    const code = (await cloud.connect().get("bills/b1"))!.inviteCode as string;
    await joinBill(cloud.connect(), "fb_anu", "b1", code, "c_17");
    await new Promise((r) => setTimeout(r, 0)); // profile fetch
    expect(raviBills[0].participants.find((p) => p.name === "Anu")?.upiId).toBe("anu@okaxis");
  });
});
