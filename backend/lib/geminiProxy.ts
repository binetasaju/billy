// ---------------------------------------------------------------------------
// lib/geminiProxy.ts — the logic behind POST /api/gemini (tested on its own)
//
// Billy's app sends { model, request } with its Firebase ID token. We check
// the token, allow only Billy's models, and forward the request to Gemini
// with the server's key, so the key never ships inside the app.
// ---------------------------------------------------------------------------

export const ALLOWED_MODELS = new Set(["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite"]);

/** Per account, per server instance (best effort — instances are shared and short-lived). */
const LIMIT = 40;
const WINDOW_MS = 10 * 60 * 1000;

export interface ProxyDeps {
  /** Returns the Firebase uid for a valid, verified-email ID token; throws otherwise. */
  verifyToken(token: string): Promise<string>;
  fetch: typeof fetch;
  apiKey: string | undefined;
  now?: () => number;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const error = (status: number, message: string) => json(status, { error: { code: status, message } });

export function createGeminiProxy(deps: ProxyDeps) {
  const hits = new Map<string, number[]>();
  const now = deps.now ?? Date.now;

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") return error(405, "Use POST.");
    if (!deps.apiKey) return error(500, "Server is missing GEMINI_API_KEY.");

    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) return error(401, "Sign in to Billy first.");
    let uid: string;
    try {
      uid = await deps.verifyToken(token);
    } catch {
      return error(401, "Your sign-in has expired. Please sign in again.");
    }

    const t = now();
    const recent = (hits.get(uid) ?? []).filter((x) => t - x < WINDOW_MS);
    if (recent.length >= LIMIT) return error(429, "Too many bills read in a short time. Please wait a few minutes.");
    recent.push(t);
    hits.set(uid, recent);

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return error(400, "Body must be JSON.");
    }
    const model = payload?.model;
    const body = payload?.request;
    if (typeof model !== "string" || !ALLOWED_MODELS.has(model)) return error(400, "Model not allowed.");
    if (!body || typeof body !== "object" || !Array.isArray(body.contents)) return error(400, "Missing request.contents.");

    const upstream = await deps.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": deps.apiKey },
        body: JSON.stringify(body),
        signal: request.signal,
      }
    );
    // Pass Gemini's status through (429 quota / 503 busy) so the app's own
    // retry and offline fallback keep working.
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
