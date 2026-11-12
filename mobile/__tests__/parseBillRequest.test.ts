import { buildParseRequest, parseBill, RESPONSE_SCHEMA } from "../services/parseBill";

describe("Gemini parse request", () => {
  it("text only: no image part, structured output on", () => {
    const body = buildParseRequest("0: Tea  30.00");
    expect(body.contents[0].parts).toHaveLength(1);
    expect(String((body.contents[0].parts[0] as any).text)).toContain("0: Tea  30.00");
    expect(String((body.contents[0].parts[0] as any).text)).not.toContain("PHOTO of the receipt");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseSchema).toBe(RESPONSE_SCHEMA);
  });

  it("with a photo: image first, then the prompt that says the photo wins", () => {
    const body = buildParseRequest("0: Tea  30.00", { base64: "AAAA" });
    const [img, text] = body.contents[0].parts as any[];
    expect(img.inline_data).toEqual({ mime_type: "image/jpeg", data: "AAAA" });
    expect(text.text).toContain("PHOTO of the receipt is attached");
    expect(text.text).toContain("0: Tea  30.00");
  });

  describe("parseBill sends the photo", () => {
    const originalFetch = global.fetch;
    const originalKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    beforeAll(() => {
      process.env.EXPO_PUBLIC_GEMINI_API_KEY = "test-key";
      jest.spyOn(console, "log").mockImplementation(() => {});
    });
    afterAll(() => {
      process.env.EXPO_PUBLIC_GEMINI_API_KEY = originalKey;
      global.fetch = originalFetch;
      jest.restoreAllMocks();
    });

    it("includes inline_data in the request body", async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: JSON.stringify({
            isBill: true, restaurant: "Cafe", items: [{ name: "Tea", quantity: 1, unitPrice: 30, amount: 30 }], charges: [], total: 30,
          }) }] } }],
        }),
      });
      global.fetch = fetchMock as any;
      const bill = await parseBill("0: Tea  30.00", { imageBase64: "QUJD" });
      const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(sent.contents[0].parts[0].inline_data.data).toBe("QUJD");
      expect(bill.items.map((i) => i.name)).toEqual(["Tea"]);
      expect(bill.total).toBe(30);
    });
  });
});
