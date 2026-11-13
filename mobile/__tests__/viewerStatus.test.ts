import { isOwedOn, statusForMe } from "../services/viewerStatus";
import type { BillGroup, GroupSettlement } from "../types/group";

const person = (id: string) => ({ id, name: id, color: "", itemIds: [] });
const tx = (from: string, to: string, status: GroupSettlement["status"]): GroupSettlement =>
  ({ fromUserId: from, toUserId: to, amount: 100, status });
const bill = (settlements: GroupSettlement[], status: BillGroup["status"] = "active"): BillGroup =>
  ({
    id: "b", title: "b", createdBy: "payer", participants: ["payer", "me", "ravi"].map(person),
    settlements, totalAmount: 300, createdAt: "", updatedAt: "", status,
  }) as BillGroup;

describe("statusForMe", () => {
  const partly = bill([tx("me", "payer", "paid"), tx("ravi", "payer", "pending")]);

  it("shows the person who is owed everyone's progress", () => {
    expect(isOwedOn(partly, "payer")).toBe(true);
    expect(statusForMe(partly, "payer")).toEqual({ status: "active", label: "1 of 2 paid", seesEveryone: true });
    expect(statusForMe(bill([tx("me", "payer", "paid")], "settled"), "payer").label).toBe("Settled");
  });

  it("shows someone who owes only their own part", () => {
    expect(statusForMe(partly, "me")).toEqual({ status: "settled", label: "Paid", seesEveryone: false });
    expect(statusForMe(partly, "ravi")).toEqual({ status: "active", label: "To pay", seesEveryone: false });
  });

  it("doesn't reveal 'Settled' to someone who owed — they see Paid", () => {
    const done = bill([tx("me", "payer", "paid"), tx("ravi", "payer", "paid")], "settled");
    expect(statusForMe(done, "me").label).toBe("Paid");
  });

  it("shows Closed to everyone", () => {
    const closed = bill([tx("me", "payer", "cancelled")], "closed");
    expect(statusForMe(closed, "me").label).toBe("Closed");
    expect(statusForMe(closed, "payer").label).toBe("Closed");
  });
});
