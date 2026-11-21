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

describe("callGeminiFast (race a backup model when slow)", () => {
  const { callGeminiFast } = require("../services/gemini");
  const models = ["a", "b", "c"];
  const res = (status: number) => ({ ok: status === 200, status }) as Response;
  // A fake model call: answers `status` after `ms`, or rejects when aborted.
  const fake = (plan: Record<string, { ms: number; status?: number; error?: boolean }>) => {
    const asked: string[] = [];
    const aborted: string[] = [];
    const call = (model: string, _body: unknown, signal?: AbortSignal) => {
      asked.push(model);
      return new Promise<Response>((resolve, reject) => {
        const p = plan[model];
        const t = setTimeout(() => (p.error ? reject(new TypeError("Network")) : resolve(res(p.status ?? 200))), p.ms);
        signal?.addEventListener("abort", () => {
          clearTimeout(t);
          aborted.push(model);
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      });
    };
    return { call, asked, aborted };
  };
  beforeAll(() => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("fast first model → only one model asked", async () => {
    const f = fake({ a: { ms: 10 }, b: { ms: 10 }, c: { ms: 10 } });
    const r = await callGeminiFast({}, { timeoutMs: 1000, hedgeAfterMs: 100, models, call: f.call });
    expect(r.model).toBe("a");
    expect(f.asked).toEqual(["a"]);
  });

  it("slow first model → the backup starts and the faster answer wins", async () => {
    const f = fake({ a: { ms: 500 }, b: { ms: 20 }, c: { ms: 20 } });
    const t = Date.now();
    const r = await callGeminiFast({}, { timeoutMs: 1000, hedgeAfterMs: 50, models, call: f.call });
    expect(r.model).toBe("b");
    expect(Date.now() - t).toBeLessThan(300);
    expect(f.aborted).toContain("a"); // the slow one is cancelled
    expect(f.aborted).not.toContain("b"); // the winner is not
  });

  it("busy (503) → next model at once, no waiting for the hedge timer", async () => {
    const f = fake({ a: { ms: 5, status: 503 }, b: { ms: 5 }, c: { ms: 5 } });
    const t = Date.now();
    const r = await callGeminiFast({}, { timeoutMs: 1000, hedgeAfterMs: 5000, models, call: f.call });
    expect(r.model).toBe("b");
    expect(Date.now() - t).toBeLessThan(200);
  });

  it("a real error (400) is returned without asking other models", async () => {
    const f = fake({ a: { ms: 5, status: 400 }, b: { ms: 5 }, c: { ms: 5 } });
    const r = await callGeminiFast({}, { timeoutMs: 1000, hedgeAfterMs: 5000, models, call: f.call });
    expect(r.response.status).toBe(400);
    expect(f.asked).toEqual(["a"]);
  });

  it("everyone out of quota → the last 429 is returned with quotaHits", async () => {
    const f = fake({ a: { ms: 5, status: 429 }, b: { ms: 5, status: 429 }, c: { ms: 5, status: 429 } });
    const r = await callGeminiFast({}, { timeoutMs: 1000, hedgeAfterMs: 5000, models, call: f.call });
    expect(r.response.status).toBe(429);
    expect(r.quotaHits).toBe(3);
    expect(r.tries).toBe(3);
  });

  it("all fail without a reply → throws", async () => {
    const f = fake({ a: { ms: 5, error: true }, b: { ms: 5, error: true }, c: { ms: 5, error: true } });
    await expect(callGeminiFast({}, { timeoutMs: 1000, hedgeAfterMs: 5000, models, call: f.call })).rejects.toThrow("Network");
  });

  it("a slow-but-OK model still wins when the backups fail", async () => {
    const f = fake({ a: { ms: 150 }, b: { ms: 5, status: 503 }, c: { ms: 5, status: 503 } });
    const r = await callGeminiFast({}, { timeoutMs: 1000, hedgeAfterMs: 20, models, call: f.call });
    expect(r.model).toBe("a");
    expect(r.response.ok).toBe(true);
  });
});
