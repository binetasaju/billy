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
