jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { contactGroupStore, isGroupAdmin } from "../services/contactGroupStore";
import type { ContactGroup } from "../types/group";

const base: ContactGroup = {
  id: "cg_1",
  name: "Flatmates",
  members: [],
  createdAt: "2026-11-11T00:00:00.000Z",
  updatedAt: "2026-11-11T00:00:00.000Z",
};

describe("isGroupAdmin", () => {
  it("is true only for the creator", () => {
    const g = { ...base, createdBy: "me" };
    expect(isGroupAdmin(g, "me")).toBe(true);
    expect(isGroupAdmin(g, "someone-else")).toBe(false);
    expect(isGroupAdmin(g, undefined)).toBe(false);
  });

  it("treats the signed-in user as admin of older groups with no creator saved", () => {
    expect(isGroupAdmin(base, "me")).toBe(true);
  });
});

describe("removeMember", () => {
  const me = { id: "me", name: "Me", isCurrentUser: true };
  const rahul = { id: "rahul", name: "Rahul", phone: "9876543210" };

  it("lets the admin remove a member", async () => {
    const g = await contactGroupStore.createGroup("Trip", [me, rahul], "me");
    await contactGroupStore.removeMember(g.id, "rahul", "me");
    const after = contactGroupStore.get().groups.find((x) => x.id === g.id)!;
    expect(after.members.map((m) => m.id)).toEqual(["me"]);
  });

  it("ignores removal by anyone who is not the admin", async () => {
    const g = await contactGroupStore.createGroup("Office", [me, rahul], "admin-user");
    await contactGroupStore.removeMember(g.id, "rahul", "me");
    const after = contactGroupStore.get().groups.find((x) => x.id === g.id)!;
    expect(after.members.map((m) => m.id)).toEqual(["me", "rahul"]);
  });
});
