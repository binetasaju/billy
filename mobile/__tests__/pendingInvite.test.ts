jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
import { savePendingInvite, takePendingInvite } from "../services/pendingInvite";

describe("pending invite (bill link opened before signing in)", () => {
  it("keeps a bill link until it is used once", async () => {
    await savePendingInvite("/bill/group_123?c=abc123xyz");
    expect(await takePendingInvite()).toBe("/bill/group_123?c=abc123xyz");
    expect(await takePendingInvite()).toBeNull();
  });

  it("ignores anything that isn't a bill link", async () => {
    await savePendingInvite("/settings");
    await savePendingInvite("https://evil.example/bill/1");
    await savePendingInvite("/bill/1?c=abc&next=/x");
    expect(await takePendingInvite()).toBeNull();
  });
});
