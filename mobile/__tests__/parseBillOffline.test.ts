import { extractChargesAndTotal, parseBill } from "../services/parseBill";

// Offline = no Gemini key, so parseBill uses the local parser.
const originalKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
beforeAll(() => {
  delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalKey;
  jest.restoreAllMocks();
});

const restaurantBill = [
  "HOTEL SARAVANA BHAVAN",
  "GSTIN: 33AABCS1234F1Z5",
  "Bill No: 1234  Date: 10/11/2026",
  "Item  Qty  Rate  Amount",
  "--------------------------------",
  "Paneer Butter Masala  1  320.00  320.00",
  "Butter Naan  4  60.00  240.00",
  "Veg Biryani  2  250.00",
  "Masala Chai  40",
  "Coke 2x60",
  "Sub Total  970.00",
  "CGST 2.5%  24.25",
  "SGST 2.5%  24.25",
  "Round Off  0.50",
  "Grand Total  1019.00",
  "Thank You Visit Again",
].join("\n");

describe("offline parser — restaurant bill with GST added", () => {
  it("reads every item with the right quantity and amount", async () => {
    const b = await parseBill(restaurantBill);
    expect(b.items.map((i) => [i.name, i.quantity, i.price])).toEqual([
      ["Paneer Butter Masala", 1, 320],
      ["Butter Naan", 4, 240],
      ["Veg Biryani", 2, 250],
      ["Masala Chai", 1, 40],
      ["Coke", 2, 120],
    ]);
  });

  it("keeps GST and round-off so the total matches the printed total", async () => {
    const b = await parseBill(restaurantBill);
    expect(b.charges).toEqual([
      { name: "CGST 2.5%", amount: 24.25 },
      { name: "SGST 2.5%", amount: 24.25 },
      { name: "Round Off", amount: 0.5 },
    ]);
    expect(b.gst).toBe(48.5);
    expect(b.total).toBe(1019);
    expect(b.printedTotal).toBe(1019);
    expect(b.extractionNote).toMatch(/offline/);
  });
});

describe("offline parser — tax-inclusive bill", () => {
  it("does not add the GST breakdown on top", async () => {
    const text = [
      "QUICK BITES",
      "Veg Burger  2  300.00",
      "Fries  120.00",
      "Total  420.00",
      "CGST 2.5% (incl.)  10.00",
      "SGST 2.5%  10.00",
    ].join("\n");
    const b = await parseBill(text);
    expect(b.total).toBe(420);
    expect(b.charges).toEqual([]);
    expect(b.taxInclusive).toBe(true);
  });
});

describe("extractChargesAndTotal", () => {
  it("prefers Grand Total over a plain Total and ignores Sub Total / GSTIN / Taxable", () => {
    const r = extractChargesAndTotal([
      "Sub Total  1,000.00",
      "Taxable Amount  1,000.00",
      "GSTIN 33AABCS1234F1Z5",
      "Total  1,000.00",
      "Service Charge  50.00",
      "Discount  20.00",
      "Grand Total: ₹ 1,030.00",
    ]);
    expect(r.printedTotal).toBe(1030);
    expect(r.charges).toEqual([
      { name: "Service Charge", amount: 50 },
      { name: "Discount", amount: -20 },
    ]);
  });

  it("does not double count repeated tax summary lines", () => {
    const r = extractChargesAndTotal(["CGST 2.5%  12.50", "SGST 2.5%  12.50", "CGST 2.5%  12.50"]);
    expect(r.charges).toHaveLength(2);
  });

  it("returns no total when none is printed", () => {
    expect(extractChargesAndTotal(["Tea  30.00"]).printedTotal).toBeNull();
  });
});
