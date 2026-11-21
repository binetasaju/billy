import { test } from "node:test";
import assert from "node:assert/strict";
import { createGeminiProxy } from "../lib/geminiProxy.js";

const okBody = { model: "gemini-flash-lite-latest", request: { contents: [{ parts: [{ text: "hi" }] }] } };

function setup(over: Partial<Parameters<typeof createGeminiProxy>[0]> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const handle = createGeminiProxy({
    verifyToken: async (t) => {
      if (t !== "good") throw new Error("bad");
      return "uid1";
    },
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"candidates":[]}', { status: 200 });
    }) as any,
    apiKey: "SERVER_KEY",
    ...over,
  });
  const req = (body: unknown, token = "good", method = "POST") =>
    new Request("https://x/api/gemini", {
      method,
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
  return { handle, calls, req };
}

test("forwards to Gemini with the server key, not the client's", async () => {
  const { handle, calls, req } = setup();
  const res = await handle(req(okBody));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /models\/gemini-flash-lite-latest:generateContent$/);
  assert.equal((calls[0].init.headers as any)["x-goog-api-key"], "SERVER_KEY");
  assert.deepEqual(JSON.parse(calls[0].init.body as string), okBody.request);
});

test("rejects missing or invalid sign-in", async () => {
  const { handle, calls, req } = setup();
  assert.equal((await handle(req(okBody, ""))).status, 401);
  assert.equal((await handle(req(okBody, "forged"))).status, 401);
  assert.equal(calls.length, 0);
});

test("only Billy's models and well-formed requests", async () => {
  const { handle, calls, req } = setup();
  assert.equal((await handle(req({ ...okBody, model: "gemini-ultra-pro" }))).status, 400);
  assert.equal((await handle(req({ model: okBody.model, request: {} }))).status, 400);
  assert.equal((await handle(req(okBody, "good", "GET"))).status, 405);
  assert.equal(calls.length, 0);
});

test("passes Gemini's 429/503 through so the app can fall back", async () => {
  const { handle, req } = setup({ fetch: (async () => new Response('{"error":{}}', { status: 503 })) as any });
  assert.equal((await handle(req(okBody))).status, 503);
});

test("rate-limits one account", async () => {
  let t = 0;
  const { handle, req } = setup({ now: () => t });
  for (let i = 0; i < 40; i++) assert.equal((await handle(req(okBody))).status, 200);
  assert.equal((await handle(req(okBody))).status, 429);
  t += 11 * 60 * 1000;
  assert.equal((await handle(req(okBody))).status, 200);
});

test("fails closed without a server key", async () => {
  const { handle, req } = setup({ apiKey: undefined });
  assert.equal((await handle(req(okBody))).status, 500);
});
