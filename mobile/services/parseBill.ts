// ---------------------------------------------------------------------------
// services/parseBill.ts
//
// Calls Gemini Flash Lite (text-only — fast, cheap) with the raw OCR text
// and returns a ParsedBill with lineIndex hints per item.
//
// lineIndex lets matchItems.ts estimate vertical position when Vision API
// bounding boxes are not available.
// ---------------------------------------------------------------------------

import type { ParsedBill } from "../types/bill";

export type { ParsedBill };

const GEMINI_MODEL = "gemini-2.5-flash-lite";
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const PARSE_PROMPT = (ocrText: string) => `
You are a bill parsing engine for an Indian restaurant bill splitter app.

Analyze the following OCR text from a restaurant bill.

Return ONLY valid JSON. No markdown. No explanations. No comments.

JSON schema:
{
  "restaurant": "",
  "billNumber": "",
  "date": "",
  "items": [
    {
      "name": "",
      "quantity": 1,
      "unitPrice": 0,
      "amount": 0,
      "lineIndex": 0
    }
  ],
  "subtotal": null,
  "taxes": [
    {
      "name": "",
      "amount": 0
    }
  ],
  "gst": null,
  "serviceCharge": null,
  "tip": null,
  "total": 0
}

Field definitions:
- "restaurant": restaurant name string (or "" if not visible)
- "billNumber": bill/invoice number (or "" if not visible)
- "date": date as printed (or "" if not visible)
- "items": ALL ordered food/drink line items. For each:
    - "name": item name exactly as printed
    - "quantity": numeric quantity (default 1)
    - "unitPrice": price per unit (numeric)
    - "amount": line total = quantity × unitPrice (numeric)
    - "lineIndex": the 0-based line number in the OCR text below where this item appears
- "subtotal": sum before taxes (numeric or null)
- "taxes": ALL non-zero tax rows (e.g. IGST 5%, CGST 2.5%, etc.). Exclude 0% taxes, subtotal, and total rows.
- "gst": combined GST/CGST+SGST/IGST/VAT total (numeric or null)
- "serviceCharge": service charge (numeric or null)
- "tip": tip amount (numeric or null)
- "total": grand total / amount payable (numeric)

Rules:
1. Include ALL food/drink items. Do NOT skip any.
2. Preserve item names exactly as printed.
3. All prices must be numeric (no ₹ symbol).
4. If a field is missing, use null.
5. lineIndex is the line number (counting from 0) in the text below where the item name appears.
6. Ignore: address, phone, FSSAI, GSTIN, separator lines (---/===), QR codes, thank-you messages.
7. Verify: sum(items.amount) + sum(taxes.amount) + serviceCharge ≈ total
8. Exclude 0.00 taxes from the taxes array. Do NOT include Subtotal or Total rows as taxes.

OCR TEXT (line numbers shown for your reference):
${ocrText
  .split("\n")
  .map((line, i) => `${i}: ${line}`)
  .join("\n")}
`.trim();

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export async function parseBill(ocrText: string): Promise<ParsedBill> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error("Gemini API key not set.");
  }

  console.time("[parseBill] Gemini call");
  console.log("[parseBill] OCR text length:", ocrText.length);

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PARSE_PROMPT(ocrText) }] }],
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

  console.log("[parseBill] Response (first 600):", text.substring(0, 600));

  // Strip accidental markdown fences
  let clean = text.trim();
  if (clean.startsWith("```json")) clean = clean.slice(7);
  else if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);
  clean = clean.trim();

  let parsed: ParsedBill;
  try {
    parsed = JSON.parse(clean) as ParsedBill;
  } catch (e) {
    console.error("[parseBill] JSON.parse failed:", clean.substring(0, 300));
    throw new Error("Could not parse bill structure. Try a clearer photo.");
  }

  if (!Array.isArray(parsed.items)) {
    throw new Error("Parser returned malformed data (missing items array).");
  }
  if (typeof parsed.total !== "number") {
    throw new Error("Parser returned malformed data (missing total).");
  }

  // Normalise: ensure both `amount` and `price` are set
  parsed.items = (parsed.items as any[]).map((item) => ({
    ...item,
    amount: item.amount ?? item.price ?? 0,
    price: item.amount ?? item.price ?? 0,
    quantity: item.quantity ?? 1,
  }));

  if (parsed.taxes && Array.isArray(parsed.taxes)) {
    const gstSum = parsed.taxes.reduce((sum, t) => sum + (t.amount || 0), 0);
    parsed.taxes.forEach(t => console.log("[Tax] Found:", t.name, t.amount));
    console.log("[Tax] Total GST:", gstSum);
    parsed.gst = gstSum;
  }

  console.log("[parseBill] ✓", parsed.items.length, "items, total ₹" + parsed.total);
  return parsed;
}
