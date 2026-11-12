import { createFakeCloud } from "./helpers/fakeCloudDb";
import { deleteCloudData } from "../services/cloud/deleteCloudData";

describe("deleteCloudData", () => {
  const seed = () => {
    const cloud = createFakeCloud();
    const d = cloud.docs;
    d.set("users/me", { name: "Asha", upiId: "asha@okaxis" });
    d.set("users/me/groups/g1", { name: "Flatmates" });
    d.set("users/friend", { name: "Ravi" });
    d.set("emails/asha@example.com", { uid: "me" });
    // My bill, with payments and an invite
    d.set("bills/b1", { createdBy: "me", memberUids: ["me", "friend"], inviteCode: "INV1" });
    d.set("bills/b1/payments/p1", { status: "pending" });
    d.set("bills/b1/payments/p2", { status: "paid" });
    d.set("invites/INV1", { createdBy: "me", billId: "b1" });
    // My bill whose invite doc is already gone
    d.set("bills/b2", { createdBy: "me", memberUids: ["me"], inviteCode: "GONE" });
    // Friend's bill I joined
    d.set("bills/b3", { createdBy: "friend", memberUids: ["friend", "me"], inviteCode: "INV3" });
    d.set("bills/b3/payments/p1", { status: "pending" });
    d.set("invites/INV3", { createdBy: "friend", billId: "b3" });
    // Someone else's bill I'm not on
    d.set("bills/b4", { createdBy: "friend", memberUids: ["friend"] });
    return cloud;
  };

  it("deletes what I own and keeps other people's bills", async () => {
    const cloud = seed();
    const summary = await deleteCloudData(cloud.connect(), "me", " Asha@Example.com ");
    expect(summary).toEqual({ billsDeleted: 2, billsKept: 1, groupsDeleted: 1 });
    expect([...cloud.docs.keys()].sort()).toEqual([
      "bills/b3",
      "bills/b3/payments/p1",
      "bills/b4",
      "invites/INV3",
      "users/friend",
    ]);
  });

  it("never deletes an email lookup that points at someone else", async () => {
    const cloud = seed();
    cloud.docs.set("emails/asha@example.com", { uid: "someone-else" });
    await deleteCloudData(cloud.connect(), "me", "asha@example.com");
    expect(cloud.docs.has("emails/asha@example.com")).toBe(true);
    expect(cloud.docs.has("users/me")).toBe(false);
  });

  it("works for an account with nothing in the cloud", async () => {
    const cloud = createFakeCloud();
    await expect(deleteCloudData(cloud.connect(), "nobody", null)).resolves.toEqual({
      billsDeleted: 0, billsKept: 0, groupsDeleted: 0,
    });
  });
});
