import { registerAuthProvider, resetAuthProvider } from "../services/auth";
import { callGemini, geminiConfigured } from "../services/gemini";

describe("callGemini", () => {
  const saved = {
    url: process.env.EXPO_PUBLIC_BILLY_API_URL,
    key: process.env.EXPO_PUBLIC_GEMINI_API_KEY,
  };
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;
  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock as any;
  });
  afterEach(() => {
    restore("EXPO_PUBLIC_BILLY_API_URL", saved.url);
    restore("EXPO_PUBLIC_GEMINI_API_KEY", saved.key);
    global.fetch = originalFetch;
    resetAuthProvider();
  });

  it("goes through Billy's server with the sign-in token — no key in the app", async () => {
    process.env.EXPO_PUBLIC_BILLY_API_URL = "https://billy-api.vercel.app/";
    delete process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    registerAuthProvider({ id: "firebase", isAvailable: () => true, getIdToken: async () => "ID_TOKEN" } as any);
    expect(geminiConfigured()).toBe(true);
    await callGemini("gemini-flash-lite-latest", { contents: [] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://billy-api.vercel.app/api/gemini");
    expect(init.headers.Authorization).toBe("Bearer ID_TOKEN");
    expect(JSON.parse(init.body)).toEqual({ model: "gemini-flash-lite-latest", request: { contents: [] } });
  });

  it("asks to sign in when there's no token", async () => {
    process.env.EXPO_PUBLIC_BILLY_API_URL = "https://billy-api.vercel.app";
    registerAuthProvider({ id: "firebase", isAvailable: () => true, getIdToken: async () => null } as any);
    await expect(callGemini("gemini-flash-lite-latest", {})).rejects.toThrow(/sign in/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("development: calls Gemini directly with the local key", async () => {
    delete process.env.EXPO_PUBLIC_BILLY_API_URL;
    process.env.EXPO_PUBLIC_GEMINI_API_KEY = "DEV_KEY";
    await callGemini("gemini-flash-lite-latest", { contents: [] });
    expect(fetchMock.mock.calls[0][0]).toContain(":generateContent?key=DEV_KEY");
  });
});
