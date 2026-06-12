// ---------------------------------------------------------------------------
// services/parseBill.ts
//
// Takes raw OCR text from Gemini and asks Gemini to parse it into a
// structured JSON bill — restaurant name, line items, taxes, and total.
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.5-flash-lite"; // fastest vision model for text tasks
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BillItem {
  name: string;
  quantity?: number;
  price: number;
}

export interface ParsedBill {
  restaurant: string;
  billNumber: string;
  date: string;
  items: BillItem[];
  subtotal?: number;
  gst?: number;
  serviceCharge?: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Prompt — minimal, focused, fast
// ---------------------------------------------------------------------------

const PARSE_PROMPT = (ocrText: string) => `
You are a bill parsing engine for an Indian restaurant bill splitter app.

Parse the following OCR text into a JSON object.

Rules:
- Output ONLY a valid JSON object. No markdown, no explanation.
- "restaurant": restaurant name string (or "" if not found)
- "billNumber": bill/invoice number string (or "" if not found)
- "date": date string as found (or "" if not found)
- "items": array of ordered food/drink items only. For each item:
    - "name": item name (string)
    - "quantity": quantity ordered (number, default 1 if not shown)
    - "price": total price for that line (number)
- "subtotal": subtotal before taxes (number or null)
- "gst": total GST/CGST+SGST/VAT as a single number (number or null)
- "serviceCharge": service charge (number or null)
- "total": grand total / amount payable (number)

Ignore: address, phone, FSSAI, GSTIN, separator lines (---, ===), footer, QR code, thank-you messages.

OCR TEXT:
${ocrText}
`.trim();

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Sends raw OCR text to Gemini Flash Lite (text-only, fast) and returns
 * a structured ParsedBill object.
 *
 * @param ocrText   Raw text string from the OCR step
 * @returns         Structured bill data
 * @throws          Error with user-friendly message on failure
 */
export async function parseBill(ocrText: string): Promise<ParsedBill> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error("Gemini API key not set.");
  }

  console.time("[parseBill] Gemini call");
  console.log("[parseBill] Input OCR text length:", ocrText.length);

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: PARSE_PROMPT(ocrText) }],
        },
      ],
      generationConfig: {
        temperature: 0,
        response_mime_type: "application/json",
      },
    }),
  });

  console.timeEnd("[parseBill] Gemini call");

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Parse API error (${response.status}): ${body}`);
  }

  const json = await response.json();
  const text: string | undefined =
    json?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text || text.trim() === "") {
    throw new Error("Parser returned empty response. Please retry.");
  }

  console.log("[parseBill] Raw response (first 500):", text.substring(0, 500));

  // Strip any accidental markdown fences
  let clean = text.trim();
  if (clean.startsWith("```json")) clean = clean.slice(7);
  if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);
  clean = clean.trim();

  let parsed: ParsedBill;
  try {
    parsed = JSON.parse(clean) as ParsedBill;
  } catch (e) {
    console.error("[parseBill] JSON.parse failed. Raw text:", clean);
    throw new Error(
      "Could not parse bill structure. Try a clearer photo."
    );
  }

  // Validate minimum shape
  if (!Array.isArray(parsed.items)) {
    throw new Error("Parser returned malformed data (missing items array).");
  }
  if (typeof parsed.total !== "number") {
    throw new Error("Parser returned malformed data (missing total).");
  }

  console.log(
    "[parseBill] Parsed:",
    `${parsed.items.length} items, total ₹${parsed.total}`
  );

  return parsed;
}
