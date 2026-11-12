import { openNewBill } from "../utils/openNewBill";

const fakeRouter = (canDismiss: boolean) => {
  const calls: string[] = [];
  return {
    calls,
    canDismiss: () => canDismiss,
    dismissAll: () => calls.push("dismissAll"),
    push: (href: any) => calls.push(`push ${href}`),
  };
};

describe("openNewBill", () => {
  it("clears the add-bill screens, then opens the bill above Home", () => {
    const r = fakeRouter(true);
    openNewBill(r as any, "abc");
    expect(r.calls).toEqual(["dismissAll", "push /group/abc"]);
  });

  it("just opens the bill when there's nothing to clear", () => {
    const r = fakeRouter(false);
    openNewBill(r as any, "abc");
    expect(r.calls).toEqual(["push /group/abc"]);
  });
});
