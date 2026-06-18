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
      "modifiers": [
        {
          "name": "",
          "amount": 0
        }
      ],
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
    - "name": item name exactly as printed. If the name spans multiple lines without prices, join them with a space (e.g., "Stuffed Chicken Breast, Mushroom Sauce").
    - "quantity": numeric quantity (default 1)
    - "unitPrice": price per unit (numeric)
    - "amount": line total = quantity × unitPrice (numeric)
    - "modifiers": Array of objects. If an item has priced child items/add-ons listed below it (e.g. starting with "-"), add them here. Each modifier must have a "name" and "amount" (numeric). Do NOT create separate top-level items for modifiers. (e.g. [{"name": "Chicken", "amount": 50}]).
    - "lineIndex": the 0-based line number in the OCR text below where this item appears
- "subtotal": sum before taxes (numeric or null)
- "taxes": ALL non-zero tax rows. Exclude 0% taxes, subtotal, and total rows.
- "gst": combined GST/CGST+SGST/IGST/VAT total (numeric or null)
- "serviceCharge": service charge (numeric or null)
- "tip": tip amount (numeric or null)
- "total": grand total / amount payable (numeric)

Rules:
1. Include ALL food/drink items. Do NOT skip any.
2. Preserve item names exactly as printed. Detect continuation lines if a line has only text and no price, and append it to the previous item.
3. All prices must be numeric (no ₹ symbol).
4. If a field is missing, use null.
5. If an item has priced child items (e.g. starts with "-"), add them to its "modifiers" array. Do NOT create separate top-level bill items for modifiers.
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
  const parseStart = Date.now();
  let retryCount = 0;
  let fallbackUsed = false;

  try {
    const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
    if (!apiKey || apiKey === "your_gemini_api_key_here") {
      throw new Error("Gemini API key not set.");
    }

    const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    let response: Response | null = null;
    let attempt = 1;
    const maxRetries = 3;

    while (attempt <= maxRetries) {
      console.log(`[parseBill] Gemini call (Attempt ${attempt})`);
      response = await fetch(url, {
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

      if (!response.ok) {
        if ([503, 429, 500].includes(response.status) && attempt < maxRetries) {
          const delayMs = attempt === 1 ? 2000 : 4000;
          console.warn(`[parseBill] Gemini API error ${response.status}. Retrying in ${delayMs}ms...`);
          await new Promise(res => setTimeout(res, delayMs));
          retryCount++;
          attempt++;
          continue;
        }
        const body = await response.text();
        throw new Error(`Parse API error (${response.status}): ${body}`);
      }
      break; // Success
    }

    if (!response) {
      throw new Error("Failed to get response from Gemini.");
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

  // Validate total
  let itemsSum = 0;
  parsed.items.forEach((item: any) => {
    itemsSum += (item.amount || 0);
    if (item.modifiers && Array.isArray(item.modifiers)) {
      item.modifiers.forEach((mod: any) => {
        itemsSum += (mod.amount || 0);
      });
    }
  });
  const taxSum = parsed.taxes ? parsed.taxes.reduce((sum, tax) => sum + (tax.amount || 0), 0) : 0;
  const sc = parsed.serviceCharge || 0;
  const tip = parsed.tip || 0;
  const computedTotal = itemsSum + taxSum + sc + tip;

  if (Math.abs(computedTotal - parsed.total) > 1) {
    console.warn(`[Validation] Price mismatch: computed ₹${computedTotal} vs total ₹${parsed.total}`);
    parsed.items = parsed.items.map(item => ({
      ...item,
      confidence: 0.5
    }));
  }

    console.log(`[parseBill] ✓ ${parsed.items.length} items, total ₹${parsed.total}`);
    console.log(`[parseBill] Parse duration: ${Date.now() - parseStart}ms, Retries: ${retryCount}, Fallback: ${fallbackUsed}`);
    return parsed;

  } catch (err) {
    console.error("[parseBill] Gemini Parsing Failed:", err);
    console.log("[parseBill] Falling back to local regex parser...");
    
    fallbackUsed = true;
    const parsed = localFallbackParser(ocrText);
    
    console.log(`[parseBill] ✓ Fallback parsed ${parsed.items.length} items, total ₹${parsed.total}`);
    console.log(`[parseBill] Parse duration: ${Date.now() - parseStart}ms, Retries: ${retryCount}, Fallback: ${fallbackUsed}`);
    
    return parsed;
  }
}

// ---------------------------------------------------------------------------
// Local Fallback Parser
// ---------------------------------------------------------------------------
function localFallbackParser(ocrText: string): ParsedBill {
  const lines = ocrText.split("\n");
  const items: any[] = [];
  let total = 0;

  // Extremely basic heuristic matching "NAME  PRICE  QTY  AMOUNT"
  // e.g. "FLAVOURED MOJITO 330.00 1.000 330.00"
  const itemRegex = /^([A-Za-z&\s\-\/]+?)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$/;
  // Alternative fallback for "NAME QTY AMOUNT"
  const itemRegex2 = /^([A-Za-z&\s\-\/]+?)\s+([\d.]+)\s+([\d.]+)$/;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let match = trimmed.match(itemRegex);
    if (match) {
      const name = match[1].trim();
      const unitPrice = parseFloat(match[2]);
      const quantity = parseFloat(match[3]);
      const amount = parseFloat(match[4]);

      if (isMetadataOrTax(name)) return;

      items.push(createItem(name, unitPrice, quantity, amount, index));
      total += amount;
      return;
    }

    match = trimmed.match(itemRegex2);
    if (match) {
      const name = match[1].trim();
      const quantity = parseFloat(match[2]);
      const amount = parseFloat(match[3]);

      if (isMetadataOrTax(name)) return;

      items.push(createItem(name, amount / (quantity || 1), quantity, amount, index));
      total += amount;
    }
  });

  return {
    restaurant: "Extracted Locally",
    billNumber: "",
    date: "",
    items,
    subtotal: total,
    taxes: [],
    gst: 0,
    serviceCharge: 0,
    tip: 0,
    total: total,
  };
}

function isMetadataOrTax(name: string) {
  const lower = name.toLowerCase();
  return lower.includes("total") || lower.includes("vat") || lower.includes("tax") || lower.includes("amount");
}

function createItem(name: string, unitPrice: number, quantity: number, amount: number, lineIndex: number) {
  return {
    id: "", // Assigned later
    name,
    quantity: quantity || 1,
    unitPrice,
    amount,
    price: amount,
    modifiers: [],
    lineIndex,
    confidence: 0.6 // Flag as low confidence so user reviews it carefully
  };
}
