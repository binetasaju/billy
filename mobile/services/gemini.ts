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
