import { isValidPhoneNumber, normalizePhoneNumber } from "../utils/normalizePhoneNumber";
import { isValidUpiId } from "../services/upi";
import { recalculateBillTotals } from "../services/recalculateBillTotals";
import type { ParsedBill } from "../types/bill";

describe("normalizePhoneNumber", () => {
  it.each([
    ["98765 43210", "+919876543210"],
    ["+91 98765-43210", "+919876543210"],
    ["(987) 654-3210", "+919876543210"],
    ["098765 43210", "+919876543210"],
    ["919876543210", "+919876543210"],
    ["0091 98765 43210", "+919876543210"],
    ["+1 (415) 555-0100", "+14155550100"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it.each([undefined, null, "", "   ", "abc", "000"])("returns undefined for %p", (input) => {
    expect(normalizePhoneNumber(input as any)).toBeUndefined();
  });
});

describe("isValidPhoneNumber", () => {
  it.each(["9876543210", "98765 43210", "+91 98765-43210", "098765 43210", "919876543210", "6000000000", "+1 415 555 0100"])(
    "accepts %s",
    (v) => expect(isValidPhoneNumber(v)).toBe(true)
  );
  it.each(["", "1234567", "987654321", "98765432101", "5876543210", "0000000000", "+91 12345", "+12345", "abc"])(
    "rejects %p",
    (v) => expect(isValidPhoneNumber(v)).toBe(false)
  );
});

describe("isValidUpiId", () => {
  it.each(["ravi@okaxis", "ravi.k-99@ybl", " name_1@paytm "])("accepts %s", (v) => {
    expect(isValidUpiId(v)).toBe(true);
  });
  it.each(["", "ravi", "@okaxis", "ravi@", "ravi@1bank", "r@okaxis", "ravi okaxis@ybl"])("rejects %p", (v) => {
    expect(isValidUpiId(v)).toBe(false);
  });
});

describe("recalculateBillTotals", () => {
  const bill = (items: number[], charges: { name: string; amount: number }[]): ParsedBill =>
    ({
      isBill: true,
      restaurant: "",
      items: items.map((price, i) => ({ id: `i${i}`, name: `i${i}`, price, amount: price, quantity: 1, confidence: 1 })),
      charges,
      subtotal: 0,
      total: 0,
    }) as unknown as ParsedBill;

  it("recomputes subtotal, total and categorised charges", () => {
    const r = recalculateBillTotals(
      bill([100, 50], [
        { name: "CGST", amount: 5 },
        { name: "SGST", amount: 5 },
        { name: "Service Charge", amount: 15 },
        { name: "Discount", amount: -20 },
      ])
    );
    expect(r.subtotal).toBe(150);
    expect(r.total).toBe(155);
    expect(r.gst).toBe(10);
    expect(r.serviceCharge).toBe(15);
    expect(r.discount).toBe(-20);
    expect(r.tip).toBeNull();
  });

  it("never returns a negative total", () => {
    expect(recalculateBillTotals(bill([10], [{ name: "Discount", amount: -50 }])).total).toBe(0);
  });
});
