import { rebuildReceiptRows, toAmount, type LayoutBlock } from "../services/receiptLayout";
import { parseBill } from "../services/parseBill";

// Helper: a line at (left, top) with a typical 20px height.
const L = (text: string, left: number, top: number, height = 20) => ({
  text,
  frame: { left, top, width: text.length * 10, height },
});

// How ML Kit typically returns a 3-column receipt: one block per column.
const columnarReceipt: LayoutBlock[] = [
  { lines: [L("Paneer Tikka", 10, 100), L("Butter Naan", 10, 130), L("Masala Coke", 10, 160)] },
  { lines: [L("1", 300, 101), L("4", 300, 131), L("2", 300, 159)] },
  { lines: [L("280.00", 400, 99), L("240.00", 400, 132), L("180.00", 400, 161)] },
];

describe("rebuildReceiptRows", () => {
  it("puts each item name on the same row as its qty and price", () => {
    expect(rebuildReceiptRows(columnarReceipt)).toBe(
      ["Paneer Tikka  1  280.00", "Butter Naan  4  240.00", "Masala Coke  2  180.00"].join("\n")
    );
  });

  it("tolerates a slightly tilted photo", () => {
    const tilted: LayoutBlock[] = [
      { lines: [L("Tea", 10, 100), L("Samosa", 10, 140)] },
      { lines: [L("30.00", 400, 108), L("40.00", 400, 147)] }, // ~8px lower on the right
    ];
    expect(rebuildReceiptRows(tilted)).toBe("Tea  30.00\nSamosa  40.00");
  });

  it("keeps separate rows apart", () => {
    const rows = rebuildReceiptRows([{ lines: [L("A", 0, 0), L("B", 0, 25), L("C", 0, 50)] }]);
    expect(rows).toBe("A\nB\nC");
  });

  it("returns null when there is no position data", () => {
    expect(rebuildReceiptRows([{ lines: [{ text: "Tea 30" }, { text: "Coffee 40" }] }])).toBeNull();
    expect(rebuildReceiptRows([])).toBeNull();
  });
});

describe("toAmount", () => {
  it.each([
    [250, 250],
    ["250", 250],
    ["1,250.00", 1250],
    ["₹ 250", 250],
    ["Rs. 99.50", 99.5],
    ["INR 1,00,000", 100000],
    ["-0.48", -0.48],
    ["(20.00)", -20],
    [".5", 0.5],
  ])("%p -> %p", (input, expected) => {
    expect(toAmount(input)).toBe(expected);
  });

  it.each([null, undefined, "", "abc", "12abc", NaN, Infinity, {}])("%p -> null", (input) => {
    expect(toAmount(input)).toBeNull();
  });
});

describe("OCR rows -> parser (local fallback, no Gemini key)", () => {
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

  it("extracts the right price for each item after rebuilding rows", async () => {
    const text = rebuildReceiptRows(columnarReceipt)!;
    const bill = await parseBill(text);
    expect(bill.items.map((i) => [i.name, i.quantity, i.price])).toEqual([
      ["Paneer Tikka", 1, 280],
      ["Butter Naan", 4, 240],
      ["Masala Coke", 2, 180],
    ]);
    expect(bill.total).toBe(700);
  });

  it("finds no priced items in ML Kit's raw column-by-column text", async () => {
    // This is what the parser used to receive — names and prices are split apart.
    const raw = "Paneer Tikka\nButter Naan\nMasala Coke\n1\n4\n2\n280.00\n240.00\n180.00";
    const bill = await parseBill(raw);
    expect(bill.items).toHaveLength(0);
  });
});

describe("parseBill — Gemini response normalisation", () => {
  const originalKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const originalFetch = global.fetch;
  beforeAll(() => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = "test-key";
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  const geminiReturns = (payload: object) => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(payload) }] } }],
      }),
    }) as any;
  };

  it("turns string prices into numbers so totals add up", async () => {
    geminiReturns({
      isBill: true,
      restaurant: "Cafe",
      items: [
        { name: "Biryani", quantity: "2", unitPrice: "325.00", amount: "650.00" },
        { name: "Lassi", quantity: 1, unitPrice: 0, amount: "₹1,20" },
        { name: "Tea", quantity: 3, unitPrice: "20" }, // amount missing
        { name: "", amount: 50 }, // nameless row is dropped
      ],
      subtotal: "1,830.00",
      charges: [
        { name: "CGST 2.5%", amount: "19.00" },
        { name: "SGST 2.5%", amount: "19.00" },
        { name: "Round Off", amount: "-0.48" },
        { name: "Zero row", amount: "0.00" },
      ],
      total: "1,867.52",
    });

    const bill = await parseBill("ignored");
    expect(bill.items.map((i) => [i.name, i.quantity, i.price])).toEqual([
      ["Biryani", 2, 650],
      ["Lassi", 1, 120],
      ["Tea", 3, 60],
    ]);
    expect(bill.items.every((i) => typeof i.price === "number")).toBe(true);
    expect(bill.total).toBe(1867.52);
    expect(bill.charges).toEqual([
      { name: "CGST 2.5%", amount: 19 },
      { name: "SGST 2.5%", amount: 19 },
      { name: "Round Off", amount: -0.48 },
    ]);
    expect(bill.gst).toBe(38);
  });
});
