import { isTaxCharge, reconcileCharges } from "../services/reconcileBill";
import { parseBill } from "../services/parseBill";

describe("isTaxCharge", () => {
  it.each(["CGST 2.5%", "SGST @ 2.5", "IGST", "GST", "Output VAT", "Cess", "UTGST"])("%s is tax", (n) => {
    expect(isTaxCharge(n)).toBe(true);
  });
  it.each(["GSTIN 32AABCU9603R1ZM", "Service Charge", "Round Off", "Packaging", "Discount"])("%s is not tax", (n) => {
    expect(isTaxCharge(n)).toBe(false);
  });
});

describe("reconcileCharges", () => {
  const gst = [{ name: "CGST 2.5%", amount: 25 }, { name: "SGST 2.5%", amount: 25 }];

  it("keeps real charges when items + charges match the printed total", () => {
    const r = reconcileCharges(1000, gst, 1050);
    expect(r).toEqual({ charges: gst, taxInclusive: false, mismatch: false });
  });

  it("drops GST that is only a breakdown on a tax-inclusive bill", () => {
    const r = reconcileCharges(1000, gst, 1000);
    expect(r.charges).toEqual([]);
    expect(r.taxInclusive).toBe(true);
    expect(r.mismatch).toBe(false);
  });

  it("drops inclusive GST but keeps a real service charge", () => {
    const sc = { name: "Service Charge", amount: 100 };
    const r = reconcileCharges(1000, [...gst, sc], 1100);
    expect(r.charges).toEqual([sc]);
    expect(r.taxInclusive).toBe(true);
  });

  it("accepts round-off within ₹1", () => {
    const r = reconcileCharges(999.6, [{ name: "Round Off", amount: 0.4 }], 1000);
    expect(r.mismatch).toBe(false);
  });

  it("flags a mismatch it cannot explain (e.g. a missed item)", () => {
    const r = reconcileCharges(800, gst, 1050);
    expect(r.charges).toEqual(gst);
    expect(r.mismatch).toBe(true);
  });

  it("leaves charges alone when the printed total is unknown", () => {
    expect(reconcileCharges(1000, gst, null).charges).toEqual(gst);
    expect(reconcileCharges(1000, gst, 0).charges).toEqual(gst);
  });
});

describe("parseBill — no phantom GST", () => {
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
      json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
    }) as any;
  };

  it("does not add GST on top of a tax-inclusive bill", async () => {
    geminiReturns({
      isBill: true, restaurant: "QSR",
      items: [{ name: "Burger", quantity: 2, amount: 300 }, { name: "Fries", quantity: 1, amount: 120 }],
      charges: [{ name: "CGST 2.5% (incl.)", amount: 10 }, { name: "SGST 2.5% (incl.)", amount: 10 }],
      total: 420,
    });
    const bill = await parseBill("x");
    expect(bill.charges).toEqual([]);
    expect(bill.gst).toBeNull();
    expect(bill.taxInclusive).toBe(true);
    expect(bill.printedTotal).toBe(420);
  });

  it("ignores a GSTIN line returned as a charge", async () => {
    geminiReturns({
      isBill: true, restaurant: "Cafe",
      items: [{ name: "Coffee", quantity: 1, amount: 150 }],
      charges: [{ name: "GSTIN", amount: "32" }],
      total: 150,
    });
    const bill = await parseBill("x");
    expect(bill.charges).toEqual([]);
    expect(bill.gst).toBeNull();
  });

  it("keeps GST when it really is added to the bill", async () => {
    geminiReturns({
      isBill: true, restaurant: "Dine-in",
      items: [{ name: "Thali", quantity: 2, amount: 500 }],
      charges: [{ name: "CGST 2.5%", amount: 12.5 }, { name: "SGST 2.5%", amount: 12.5 }],
      total: 525,
    });
    const bill = await parseBill("x");
    expect(bill.gst).toBe(25);
    expect(bill.taxInclusive).toBe(false);
  });
});

describe("parseBill — quota exhausted", () => {
  const originalKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  const originalFetch = global.fetch;
  beforeAll(() => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = "test-key";
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(() => {
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalKey;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("does not retry on 429 and falls back offline with an explanation", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 429, text: async () => "RESOURCE_EXHAUSTED" });
    global.fetch = fetchMock as any;
    const bill = await parseBill("Tea  30.00\nSamosa  40.00");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bill.items.map((i) => i.name)).toEqual(["Tea", "Samosa"]);
    expect(bill.extractionNote).toMatch(/AI limit/);
  });
});
