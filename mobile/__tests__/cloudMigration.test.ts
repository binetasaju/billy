jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

import { createFakeCloud } from "./helpers/fakeCloudDb";
import { startBillSync } from "../services/cloud/billSync";
import { uploadPhoneOnlyBills } from "../services/cloud/cloudSync";
import { groupStore } from "../services/groupStore";
import type { BillGroup } from "../types/group";

const me = { billyUid: "mock_asha", authUid: "fb_asha" }; // migrated account: ids differ

const bill = (id: string, meId: string): BillGroup => ({
  id,
  title: id,
  createdBy: meId,
  participants: [
    { id: meId, name: "Me", itemIds: [], isCurrentUser: true },
    { id: "c_1", name: "Ravi", itemIds: [] },
  ],
  settlements: [{ fromUserId: "c_1", toUserId: meId, amount: 100, status: "pending" }],
  totalAmount: 200,
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-01T00:00:00Z",
  status: "active",
});

describe("moving phone bills to the cloud", () => {
  beforeEach(async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await groupStore.restore();
    await groupStore.applyCloud([]);
    await groupStore.createGroup(bill("mine1", "mock_asha"));
    await groupStore.createGroup(bill("mine2", "mock_asha"));
    await groupStore.createGroup(bill("oldTestAccount", "mock_someone_else"));
  });

  it("uploads my bills once, never other accounts' bills, and keeps them visible", async () => {
    const cloud = createFakeCloud();
    const sync = startBillSync(cloud.connect(), me, (b) => void groupStore.applyCloud(b));
    groupStore.setRemote(sync);

    expect(await uploadPhoneOnlyBills(sync, me)).toBe(2);
    expect([...cloud.docs.keys()].filter((k) => /^bills\/[^/]+$/.test(k)).sort()).toEqual(["bills/mine1", "bills/mine2"]);

    // Uploaded bills come back from the cloud, with me still "me".
    const mine = groupStore.getGroupById("mine1")!;
    expect(mine.inCloud).toBe(true);
    expect(mine.participants.find((p) => p.isCurrentUser)?.id).toBe("mock_asha");
    expect((await cloud.connect().get("bills/mine1"))!.createdBy).toBe("fb_asha");
    // The old test-account bill stays on the phone only.
    expect(groupStore.getGroupById("oldTestAccount")?.inCloud).toBeUndefined();

    // Second run: nothing to upload.
    expect(await uploadPhoneOnlyBills(sync, me)).toBe(0);

    // A payment marked on the phone reaches the cloud.
    await groupStore.markSettlementPaid("mine1", "c_1", "mock_asha");
    expect((await cloud.connect().get("bills/mine1/payments/c_1__mock_asha"))!.status).toBe("paid");

    sync.stop();
    groupStore.setRemote(null);
  });
});
