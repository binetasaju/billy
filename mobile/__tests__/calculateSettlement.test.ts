import { calculateSettlement } from "../services/calculateSettlement";
import type { BillItem, Person } from "../types/bill";

const person = (id: string, itemIds: string[] = []): Person =>
  ({ id, name: id.toUpperCase(), itemIds, color: "" }) as Person;
const item = (id: string, price: number): BillItem =>
  ({ id, name: id, price, amount: price, quantity: 1, confidence: 1 }) as BillItem;
const sumTotals = (r: ReturnType<typeof calculateSettlement>) =>
  Math.round(r.participantTotals.reduce((s, p) => s + p.total, 0) * 100) / 100;

describe("calculateSettlement — equal split", () => {
  it("returns nothing for zero participants", () => {
    expect(
      calculateSettlement({ payerId: "a", splitMethod: "equal", participants: [], items: [item("x", 100)] })
    ).toEqual({ settlements: [], participantTotals: [] });
  });

  it("splits evenly and includes all charges", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "equal",
      participants: [person("a"), person("b")],
      items: [item("x", 100)],
      gstAmount: 10,
      serviceCharge: 10,
    });
    expect(r.participantTotals.map((p) => p.total)).toEqual([60, 60]);
    expect(r.settlements).toEqual([{ fromUserId: "b", toUserId: "a", amount: 60 }]);
  });

  it("gives the rounding paisa to the last person so totals match the bill", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "equal",
      participants: [person("a"), person("b"), person("c")],
      items: [item("x", 100)],
    });
    expect(r.participantTotals.map((p) => p.total)).toEqual([33.33, 33.33, 33.34]);
    expect(sumTotals(r)).toBe(100);
  });

  it("never makes the payer owe themselves", () => {
    const r = calculateSettlement({
      payerId: "b",
      splitMethod: "equal",
      participants: [person("a"), person("b"), person("c")],
      items: [item("x", 90)],
    });
    expect(r.settlements.every((s) => s.toUserId === "b" && s.fromUserId !== "b")).toBe(true);
    expect(r.settlements).toHaveLength(2);
  });
});

describe("calculateSettlement — item-wise split", () => {
  it("shares items between claimants and distributes GST proportionally", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "itemwise",
      participants: [person("a", ["pizza"]), person("b", ["pizza", "coke"])],
      items: [item("pizza", 100), item("coke", 50)],
      gstAmount: 15,
    });
    const [a, b] = r.participantTotals;
    expect(a.itemsTotal).toBe(50);
    expect(b.itemsTotal).toBe(100);
    expect(a.taxShare).toBe(5);
    expect(b.taxShare).toBe(10);
    expect([a.total, b.total]).toEqual([55, 110]);
    expect(r.settlements).toEqual([{ fromUserId: "b", toUserId: "a", amount: 110 }]);
  });

  it("splits unassigned items equally among everyone", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "itemwise",
      participants: [person("a", ["x"]), person("b"), person("c")],
      items: [item("x", 30), item("shared", 60)],
    });
    expect(r.participantTotals.map((p) => p.total)).toEqual([50, 20, 20]);
    expect(sumTotals(r)).toBe(90);
  });

  it("totals always add up to the full bill, including all charges", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "itemwise",
      participants: [person("a", ["x"]), person("b", ["x", "y"]), person("c", ["y", "z"])],
      items: [item("x", 99.99), item("y", 33.33), item("z", 17.5)],
      gstAmount: 7.77,
      serviceCharge: 11.11,
      additionalCharges: 3.03,
    });
    expect(sumTotals(r)).toBe(Math.round((99.99 + 33.33 + 17.5 + 7.77 + 11.11 + 3.03) * 100) / 100);
  });

  it("splits charges equally when no items exist", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "itemwise",
      participants: [person("a"), person("b")],
      items: [],
      serviceCharge: 40,
    });
    expect(r.participantTotals.map((p) => p.total)).toEqual([20, 20]);
  });
});

import { rebalanceCustomAmounts, remainingToAssign } from "../services/calculateSettlement";

describe("calculateSettlement — custom amounts", () => {
  it("uses the typed amounts and everyone owes the payer", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "custom",
      participants: [person("a"), person("b"), person("c")],
      items: [item("x", 900)],
      gstAmount: 100,
      customAmounts: { a: 0, b: 600, c: 400 },
    });
    expect(r.participantTotals.map((p) => p.total)).toEqual([0, 600, 400]);
    expect(r.settlements).toEqual([
      { fromUserId: "b", toUserId: "a", amount: 600 },
      { fromUserId: "c", toUserId: "a", amount: 400 },
    ]);
    // breakdown is proportional: b pays 60% of the bill -> 60% of GST
    expect(r.participantTotals[1].taxShare).toBe(60);
    expect(r.participantTotals[1].itemsTotal).toBe(540);
  });

  it("lets the payer cover others completely (payer share ₹0)", () => {
    const r = calculateSettlement({
      payerId: "a",
      splitMethod: "custom",
      participants: [person("a"), person("b")],
      items: [item("x", 500)],
      customAmounts: { a: 0, b: 500 },
    });
    expect(r.settlements).toEqual([{ fromUserId: "b", toUserId: "a", amount: 500 }]);
  });
});

describe("remainingToAssign", () => {
  it("is what is left to cover", () => {
    expect(remainingToAssign(1000, { a: 300, b: 250.5 })).toBe(449.5);
    expect(remainingToAssign(100, { a: 33.33, b: 33.33, c: 33.34 })).toBe(0);
    expect(remainingToAssign(100, { a: 120 })).toBe(-20);
  });
});

describe("rebalanceCustomAmounts", () => {
  it("splits equally when nothing is fixed, rounding onto the last person", () => {
    expect(rebalanceCustomAmounts(100, ["a", "b", "c"], {})).toEqual({ a: 33.33, b: 33.33, c: 33.34 });
  });

  it("keeps fixed amounts and shares the rest among the others", () => {
    expect(rebalanceCustomAmounts(1000, ["a", "b", "c"], { a: 400 })).toEqual({ a: 400, b: 300, c: 300 });
  });

  it("never gives the others a negative share", () => {
    expect(rebalanceCustomAmounts(100, ["a", "b"], { a: 150 })).toEqual({ a: 150, b: 0 });
  });

  it("always adds up to the bill when someone is free", () => {
    const r = rebalanceCustomAmounts(999.99, ["a", "b", "c", "d"], { b: 123.45 });
    expect(remainingToAssign(999.99, r)).toBe(0);
  });
});
