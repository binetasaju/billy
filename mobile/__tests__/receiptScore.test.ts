import { nameSimilarity, scoreReceipt } from "../scripts/receiptScore";

describe("receipt scoring", () => {
  const expected = {
    total: 590,
    chargesTotal: 28.1,
    items: [
      { name: "Paneer Butter Masala", amount: 320 },
      { name: "Butter Naan", amount: 120 },
      { name: "Fresh Lime Soda", amount: 120 },
    ],
  };

  it("perfect extraction", () => {
    const s = scoreReceipt(expected, {
      total: 590,
      items: [
        { name: "PANEER BUTTER MASALA", price: 320 },
        { name: "Butter Naan (2)", price: 120 },
        { name: "Fresh Lime Soda", price: 120 },
      ],
      charges: [{ name: "CGST 2.5%", amount: 14.05 }, { name: "SGST 2.5%", amount: 14.05 }],
    });
    expect(s).toMatchObject({ totalOk: true, chargesOk: true, matched: 3, recall: 1, precision: 1, missing: [], extra: [] });
  });

  it("two items with the same price are matched by name, not swapped", () => {
    const s = scoreReceipt(expected, {
      total: 590,
      items: [
        { name: "Fresh Lime Soda", price: 120 },
        { name: "Butter Naan", price: 120 },
        { name: "Paneer Butter Masala", price: 320 },
      ],
    });
    expect(s.matched).toBe(3);
    expect(s.chargesOk).toBe(false);
  });

  it("counts wrong amounts as missing + extra", () => {
    const s = scoreReceipt(expected, {
      total: 600,
      items: [
        { name: "Paneer Butter Masala", price: 330 },
        { name: "Butter Naan", price: 120 },
      ],
    });
    expect(s.totalOk).toBe(false);
    expect(s.matched).toBe(1);
    expect(s.missing).toEqual(["Paneer Butter Masala ₹320", "Fresh Lime Soda ₹120"]);
    expect(s.extra).toEqual(["Paneer Butter Masala ₹330"]);
    expect(s.recall).toBeCloseTo(1 / 3);
    expect(s.precision).toBeCloseTo(1 / 2);
  });

  it("name similarity tolerates OCR abbreviations", () => {
    expect(nameSimilarity("Chicken Biryani", "CHKN BIRYANI")).toBeGreaterThanOrEqual(0.5);
    expect(nameSimilarity("Chicken Biryani", "Veg Fried Rice")).toBe(0);
  });
});
