// POST /api/gemini — Billy's Gemini proxy (see lib/geminiProxy.ts).
import { createGeminiProxy } from "../lib/geminiProxy.js";
import { verifyFirebaseIdToken } from "../lib/firebaseToken.js";

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "billy-ed9eb";

const handle = createGeminiProxy({
  verifyToken: (token) => verifyFirebaseIdToken(token, PROJECT_ID),
  fetch,
  apiKey: process.env.GEMINI_API_KEY,
});

export function POST(request: Request): Promise<Response> {
  return handle(request);
}
