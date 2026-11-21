import { openNewBill } from "../utils/openNewBill";

const fakes = (resetThrows = false) => {
  const calls: any[] = [];
  const navigation = {
    reset: (state: any) => {
      if (resetThrows) throw new Error("no such route");
      calls.push(["reset", state]);
    },
  };
  const router = {
    canDismiss: () => true,
    dismissAll: () => calls.push(["dismissAll"]),
    push: (href: any) => calls.push(["push", href]),
  };
  return { calls, navigation, router };
};

describe("openNewBill", () => {
  it("resets the history to exactly [Home, the bill] in one step", () => {
    const f = fakes();
    openNewBill(f.navigation, f.router as any, "abc");
    expect(f.calls).toEqual([
      ["reset", { index: 1, routes: [{ name: "(tabs)" }, { name: "group/[id]", params: { id: "abc" } }] }],
    ]);
  });

  it("falls back to clear + open if reset isn't possible", () => {
    const f = fakes(true);
    openNewBill(f.navigation, f.router as any, "abc");
    expect(f.calls).toEqual([["dismissAll"], ["push", "/group/abc"]]);
  });
});
