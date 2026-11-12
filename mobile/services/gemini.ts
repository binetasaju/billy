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
 * All must be allowed by backend/lib/geminiProxy.ts (ALLOWED_MODELS).
 */
export const GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-2.5-flash-lite"] as const;

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

/**
 * callGemini over GEMINI_MODELS: on a timeout, 429 or 5xx, try the next
 * model. Returns the first OK response, or the last model's response.
 */
export async function callGeminiWithFallback(body: unknown, timeoutMs: number): Promise<Response> {
  let lastError: unknown = null;
  for (let i = 0; i < GEMINI_MODELS.length; i++) {
    const last = i === GEMINI_MODELS.length - 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await callGemini(GEMINI_MODELS[i], body, controller.signal);
      if (res.ok || last || ![429, 500, 503, 504].includes(res.status)) return res;
    } catch (e) {
      lastError = e;
      if (last) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error("Gemini unavailable");
}
