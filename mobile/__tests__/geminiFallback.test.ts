import { parseBill } from "../services/parseBill";
import { callGeminiWithFallback, GEMINI_MODELS } from "../services/gemini";

const ok = (payload: object) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
  text: async () => "",
});
const fail = (status: number) => ({ ok: false, status, json: async () => ({}), text: async () => `{"error":${status}}` });
const bill = { isBill: true, restaurant: "Cafe", items: [{ name: "Tea", quantity: 1, unitPrice: 30, amount: 30 }], charges: [], total: 30 };
const modelOf = (url: string) => url.match(/models\/([^:]+):/)?.[1];

describe("Gemini backup models", () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
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

  it("busy (503) → next model reads the bill", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(ok(bill));
    global.fetch = fetchMock as any;
    const b = await parseBill("0: Tea 30.00");
    expect(b.extractionNote).toBeUndefined();
    expect(b.items.map((i) => i.name)).toEqual(["Tea"]);
    expect(fetchMock.mock.calls.map((c) => modelOf(c[0]))).toEqual([GEMINI_MODELS[0], GEMINI_MODELS[1]]);
  });

  it("quota (429) on the first model → the next model's own quota is used", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok(bill)) as any;
    expect((await parseBill("0: Tea 30.00")).extractionNote).toBeUndefined();
  });

  it("every model out of quota → offline with the 'AI limit' note", async () => {
    global.fetch = jest.fn().mockResolvedValue(fail(429)) as any;
    const b = await parseBill("Tea  30.00");
    expect(b.extractionNote).toMatch(/AI limit/);
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(GEMINI_MODELS.length);
  });

  it("a real error (400) is not retried on other models", async () => {
    global.fetch = jest.fn().mockResolvedValue(fail(400)) as any;
    const b = await parseBill("Tea  30.00");
    expect(b.extractionNote).toBeDefined();
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
  });

  it("callGeminiWithFallback: network error → next model", async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new TypeError("Network request failed")).mockResolvedValueOnce(ok(bill));
    global.fetch = fetchMock as any;
    const res = await callGeminiWithFallback({ contents: [] }, 5000);
    expect(res.ok).toBe(true);
    expect(modelOf(fetchMock.mock.calls[1][0])).toBe(GEMINI_MODELS[1]);
  });
});
