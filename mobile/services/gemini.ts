// ---------------------------------------------------------------------------
// services/gemini.ts — every Gemini call goes through here
//
// With EXPO_PUBLIC_BILLY_API_URL set, requests go to Billy's server
// (backend/api/gemini.ts on Vercel). It checks the Firebase sign-in and adds
// the Gemini key there, so no key ships inside the app.
// Without it (local development), the app calls Gemini directly with
// EXPO_PUBLIC_GEMINI_API_KEY.
//
// Returns the raw Response so callers keep their own status handling
// (429 quota, 503 busy, …).
// ---------------------------------------------------------------------------
import { getAuthProvider } from "./auth";

/**
 * Models to try in order. When one is overloaded (503) or out of free quota
 * (429), the next usually isn't — each has its own capacity and limits.
 * Fast "lite" models first: they read a bill in ~3–4 s, while
 * gemini-flash-latest is often overloaded and can take a minute to say so.
 * All must be allowed by backend/lib/geminiProxy.ts (ALLOWED_MODELS).
 */
export const GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest"] as const;

/** Start the next model as well when the current one hasn't answered by then. */
export const HEDGE_AFTER_MS = 6_000;

const SWITCH_STATUSES = [429, 500, 503, 504];

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/models";

const serverUrl = () => (process.env.EXPO_PUBLIC_BILLY_API_URL ?? "").replace(/\/+$/, "");
const directKey = () => {
  const key = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  return key && key !== "your_gemini_api_key_here" ? key : null;
};

/** True when Gemini can be reached (server configured, or a dev key). */
export function geminiConfigured(): boolean {
  return !!serverUrl() || !!directKey();
}

export async function callGemini(model: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const server = serverUrl();
  if (server) {
    const token = await getAuthProvider().getIdToken?.().catch(() => null);
    if (!token) throw new Error("Please sign in to read bills with AI.");
    return fetch(`${server}/api/gemini`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ model, request: body }),
    });
  }
  const key = directKey();
  if (!key) throw new Error("Gemini API key not set.");
  return fetch(`${GEMINI_BASE_URL}/${model}:generateContent?key=${key}`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface FastResult {
  /** The first OK reply — or a real error (e.g. 400), or the last busy / quota reply. */
  response: Response;
  model: string;
  /** How many models were asked. */
  tries: number;
  /** How many answered 429 (out of quota). */
  quotaHits: number;
}

/**
 * Ask GEMINI_MODELS for the fastest good answer:
 *   • a model that fails (timeout, network, 429, 5xx) → the next starts at once;
 *   • a model that is just slow (no answer after `hedgeAfterMs`) → the next
 *     starts too, and whichever answers OK first wins (the others are cancelled);
 *   • a real error (e.g. 400) is returned straight away — other models would fail the same way.
 * Throws only when every model failed without a reply (timeouts / network).
 */
export function callGeminiFast(
  body: unknown,
  opts: { timeoutMs: number; hedgeAfterMs?: number; models?: readonly string[]; call?: typeof callGemini }
): Promise<FastResult> {
  const models = opts.models ?? GEMINI_MODELS;
  const hedgeAfterMs = opts.hedgeAfterMs ?? HEDGE_AFTER_MS;
  const call = opts.call ?? callGemini;

  return new Promise((resolve, reject) => {
    const controllers: AbortController[] = [];
    let started = 0;
    let running = 0;
    let done = false;
    let quotaHits = 0;
    let lastReply: { response: Response; model: string } | null = null;
    let lastError: unknown = null;
    let hedgeTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = (winner: number, result: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(hedgeTimer);
      // Cancel the others — but not the winner, whose body is still to be read.
      controllers.forEach((c, i) => i !== winner && c.abort());
      result();
    };

    const launch = () => {
      if (done || started >= models.length) return;
      const i = started++;
      const model = models[i];
      const controller = new AbortController();
      controllers[i] = controller;
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      running++;
      clearTimeout(hedgeTimer);
      if (started < models.length) hedgeTimer = setTimeout(launch, hedgeAfterMs);

      call(model, body, controller.signal)
        .then(
          (response) => {
            if (done) return;
            if (response.ok || !SWITCH_STATUSES.includes(response.status)) {
              finish(i, () => resolve({ response, model, tries: started, quotaHits }));
              return;
            }
            if (response.status === 429) quotaHits++;
            console.warn(`[gemini] ${model} answered ${response.status}`);
            lastReply = { response, model };
          },
          (err) => {
            if (done) return;
            console.warn(`[gemini] ${model} failed (${(err as Error)?.name ?? err})`);
            lastError = err;
          }
        )
        .finally(() => {
          clearTimeout(timer);
          running--;
          if (done) return;
          if (started < models.length) return launch(); // failed → next model right away
          if (running > 0) return; // a slower model may still answer
          const reply = lastReply;
          finish(-1, () =>
            reply
              ? resolve({ response: reply.response, model: reply.model, tries: started, quotaHits })
              : reject(lastError ?? new Error("Gemini unavailable"))
          );
        });
    };

    launch();
  });
}

/** callGeminiFast, returning just the response. */
export async function callGeminiWithFallback(body: unknown, timeoutMs: number): Promise<Response> {
  return (await callGeminiFast(body, { timeoutMs })).response;
}
