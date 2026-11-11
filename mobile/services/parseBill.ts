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
import { toAmount } from "./receiptLayout";
import { isTaxCharge, reconcileCharges } from "./reconcileBill";

export type { ParsedBill };

const GEMINI_MODEL = "gemini-flash-lite-latest";
/** Per-attempt limit for the Gemini call (normal replies take ~2–3 s). */
const ATTEMPT_TIMEOUT_MS = 15_000;
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const PARSE_PROMPT = (ocrText: string) => `
You are a restaurant bill parser for an Indian bill-splitter app.

Analyze the OCR text below and return ONLY valid JSON. No markdown, no explanations.

JSON schema:
{
  "isBill": true,
  "restaurant": "",
  "legalName": "",
  "billNumber": "",
  "date": "",
  "items": [
    {
      "name": "",
      "quantity": 1,
      "unitPrice": 0,
      "amount": 0,
      "children": [],
      "modifiers": [{"name": "", "amount": 0}],
      "lineIndex": 0
    }
  ],
  "subtotal": null,
  "charges": [{"name": "", "amount": 0}],
  "total": 0
}

FIELD DEFINITIONS:

"isBill": true if the text clearly represents a restaurant bill, cafe receipt, grocery receipt, or similar invoice. false if it is a random photo, screenshot, selfie, or completely unrelated text.
"restaurant": The customer-facing brand name of the restaurant.
  - Look at the first 10-15 lines of the receipt header only.
  - Prefer a short, prominent name like "PLAN B", "BARBEQUE NATION", "KFC".
  - If a line contains "PVT LTD", "LLP", "Ltd", "HOSPITALITY", "ENTERPRISES", it is the legal entity name — store that in "legalName" instead, not here.
  - If the brand name appears twice (e.g. "PLAN B PLAN B"), use it once.
  - Ignore: GSTIN, address lines, Bill No, Table No, Date, Steward name.
  - Use "" if no brand name is found.

"legalName": The registered legal company name (e.g. "V&RO HOSPITALITY PVT LTD").
  - Only set if a legal entity name appears in the receipt header.
  - Use "" otherwise.

"billNumber": Bill/invoice number (or "" if not visible).
"date": Date as printed (or "" if not visible).

"items": ALL food and drink line items on the receipt. CRITICAL RULES:
  - Scan the ENTIRE receipt from top to bottom without stopping early.
  - Continue collecting items until you hit a tax/charges section (GST, subtotal, service charge).
  - Do NOT stop after a few items. A long receipt may have 20+ items.
  - "name": The exact item name from the line that has a price.
  - "quantity": Numeric quantity (default 1).
  - "unitPrice": Price per unit (numeric, no Rs symbol).
  - "amount": quantity x unitPrice (numeric).
  - "children": Names of sub-items that follow this item WITHOUT their own price.
    (See PARENT-CHILD RULES below.)
  - "modifiers": Sub-lines that have their OWN price [{name, amount}].
  - "lineIndex": 0-based line number of the parent item in the OCR text.

"subtotal": Pre-tax sum of all items (numeric or null).
"charges": All non-item lines in order — taxes, fees, discounts, round-off.
  - Keep each tax line separate: CGST, SGST, IGST, GST, VAT, SERC, Cess, etc.
  - Keep the printed rate in the name, e.g. "CGST 2.5%", "SGST @ 9%".
  - A tax printed at 0% (e.g. "CGST @ 0%") is zero — omit it, even if a number appears near it.
  - Include Service Charge, Packaging Charge, Convenience Fee, Tip.
  - Discounts/Round Off: use NEGATIVE amounts (e.g. -0.48 for Round Off).
  - Do NOT include Subtotal or Total rows. Do NOT include 0.00 rows.
  - ONLY include charges that are printed with an amount on THIS receipt. Never invent or estimate tax.
    If the receipt shows no tax/charge lines, return "charges": [].
  - If the receipt says prices are INCLUSIVE of tax ("incl. of GST", "inclusive of all taxes",
    "Taxable value" breakdown inside the total), do NOT put those tax lines in charges.
  - GSTIN, FSSAI, HSN/SAC codes are identifiers, never charges.
"total": Grand total / amount payable (numeric).

PARENT-CHILD RULES:

A PARENT is a line with a price. A CHILD is a line immediately below with NO price.

  <Item Name>   <Qty>   <Price>    <- PARENT -> create item
  <Child Name>                     <- CHILD  -> add to parent.children[]
  <Child Name>                     <- CHILD  -> add to parent.children[]
  <Next Item>   <Qty>   <Price>    <- next PARENT

Rules:
A. Do NOT create a separate item for a child line.
B. Do NOT merge child names into the parent name — "Tuesday 1 Dozer NAKED PERI PERI" is WRONG.
C. Parent keeps its own name only. Children go in children[].
D. ALL consecutive no-price lines below a parent are its children.
E. A new parent begins when a priced line is found.
F. Include "ABS" and other placeholder tokens in children[] as-is.
G. children[] = unpricey sub-items. modifiers[] = priced add-ons.

Example:
  Input:
    Tuesday 1 Dozer      1    2250.00
    NAKED PERI PERI
    SPICY GARLIC
    ABS
    Coke                 2    180.00

  Output:
    [
      {"name":"Tuesday 1 Dozer","quantity":1,"unitPrice":2250,"amount":2250,
       "children":["NAKED PERI PERI","SPICY GARLIC","ABS"],"modifiers":[],"lineIndex":0},
      {"name":"Coke","quantity":2,"unitPrice":90,"amount":180,
       "children":[],"modifiers":[],"lineIndex":4}
    ]

WHAT TO IGNORE (do not add as items or children):
  - Table header rows: "Item", "Description", "Qty", "Quantity", "Rate", "Amount", "Sl.No", "#"
  - Separator lines: ---, ===, ***, ____
  - Receipt footer: "Thank You", "Visit Again", "FSSAI No", "GSTIN", "PAN No", CIN, website URLs
  - GST breakdown section: "Taxable Amount", "GST @", "CGST @", "SGST @" (as standalone header rows)
  - Phone numbers, email addresses, social media handles, QR code labels
  - App UI text: "Pinch to zoom", "Tap to expand", "Review Items", "Continue to Split"

COMPLETENESS CHECK (do before returning):
  - Count items in output. If receipt clearly shows more items, go back and find them.
  - Every line with a price in the items section MUST appear in the output.
  - Verify: subtotal + sum(charges[].amount) ~ total.

OCR TEXT (line numbers for reference):
${ocrText
  .split("\n")
  .map((line, i) => `${i}: ${line}`)
  .join("\n")}
`.trim();

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** Gemini refused the request because the (daily) quota is used up. */
class QuotaExceededError extends Error {}

function fallbackNote(err: unknown): string {
  if (err instanceof QuotaExceededError) {
    return "Today's AI limit is reached, so items were read offline. Please check them carefully.";
  }
  if (err instanceof Error && err.name === "AbortError") {
    return "The AI service was too slow, so items were read offline. Please check them carefully.";
  }
  if (err instanceof Error && /API key not set/i.test(err.message)) {
    return "AI reading isn't set up, so items were read offline. Please check them carefully.";
  }
  return "Couldn't reach the AI service, so items were read offline. Please check them carefully.";
}

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
    // Speed over persistence: a normal reply takes ~2–3 s. If Google is
    // overloaded, give each attempt 15 s, retry once, then fall back to the
    // offline parser — worst case ≈ 30 s instead of a minute or more.
    const maxRetries = 2;
    const RETRY_DELAYS = [1500];

    while (attempt <= maxRetries) {
      console.log(`[parseBill] Gemini call (Attempt ${attempt}/${maxRetries})`);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
      try {
        response = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PARSE_PROMPT(ocrText) }] }],
          generationConfig: {
            temperature: 0,
            response_mime_type: "application/json",
            // Raise token ceiling so long receipts don't truncate silently
            maxOutputTokens: 8192,
          },
        }),
        });
      } catch (err) {
        // Timed out (or network error): retry once, then fall back offline.
        if (attempt < maxRetries) {
          console.warn(`[parseBill] Gemini attempt ${attempt} failed (${(err as Error)?.name}). Retrying…`);
          retryCount++;
          attempt++;
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        // 429 = quota exhausted. A daily limit won't reset in a few seconds,
        // so retrying only adds delay — go straight to the offline parser.
        if (response.status === 429) {
          throw new QuotaExceededError("Gemini quota exceeded (429)");
        }
        const isRetryable = [503, 500].includes(response.status);
        if (isRetryable && attempt < maxRetries) {
          const delayMs = RETRY_DELAYS[attempt - 1];
          console.warn(`[parseBill] Gemini ${response.status}. Retrying in ${delayMs}ms... (${attempt}/${maxRetries})`);
          await new Promise(res => setTimeout(res, delayMs));
          retryCount++;
          attempt++;
          continue;
        }
        // All retries exhausted or non-retryable error
        const body = await response.text();
        throw new Error(`Parse API error (${response.status}): ${body}`);
      }
      break; // Success
    }

    if (!response) {
      throw new Error("Failed to get response from Gemini.");
    }
    const json = await response.json();
  const finishReason = json?.candidates?.[0]?.finishReason;
  console.log("[parseBill] finishReason:", finishReason);
  if (finishReason === "MAX_TOKENS") {
    console.warn("[parseBill] ⚠ Output was TRUNCATED (MAX_TOKENS). Some items may be missing.");
  }
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

  // The model sometimes returns money as strings ("1,250.00", "₹250").
  // Coerce everything to numbers so totals never string-concatenate.
  const total = toAmount(parsed.total);
  if (total === null) {
    throw new Error("Parser returned malformed data (missing total).");
  }
  parsed.total = total;
  parsed.subtotal = toAmount(parsed.subtotal) as any;

  // Normalise item fields
  parsed.items = (parsed.items as any[])
    .map((item) => {
      const rawQty = toAmount(item.quantity);
      const quantity = rawQty && rawQty > 0 ? rawQty : 1;
      const unitPrice = toAmount(item.unitPrice);
      const amount =
        toAmount(item.amount) ??
        toAmount(item.price) ??
        (unitPrice !== null ? Math.round(unitPrice * quantity * 100) / 100 : 0);
      return {
        ...item,
        name: String(item.name ?? "").trim(),
        unitPrice: unitPrice ?? (quantity ? amount / quantity : amount),
        amount,
        price: amount,
        quantity,
        // Ensure children is always a string array
        children: Array.isArray(item.children)
          ? (item.children as any[]).map(String).filter(Boolean)
          : [],
      };
    })
    .filter((item) => item.name.length > 0);

  // Normalise restaurant / legalName
  // Deduplicate repeated brand names ("PLAN B PLAN B" -> "PLAN B")
  if (parsed.restaurant) {
    const parts = parsed.restaurant.trim().split(/\s+/);
    const half = Math.floor(parts.length / 2);
    if (half > 0 && parts.slice(0, half).join(" ") === parts.slice(half).join(" ")) {
      parsed.restaurant = parts.slice(0, half).join(" ");
    }
  }
  // legalName from model (may be set or empty)
  const legalName = (parsed as any).legalName?.trim() ?? "";
  if (legalName && legalName !== parsed.restaurant) {
    parsed.legalName = legalName;
  }
  console.log("[parseBill] restaurant:", parsed.restaurant, "| legalName:", parsed.legalName ?? "(none)");



  // ── Build charges[] — the canonical array of individual charge lines ——————
  //
  // The model now returns charges[] directly.  If it fell back to the old
  // taxes[]/serviceCharge/tip schema, synthesise charges[] from those fields
  // so the UI always has a single source of truth.

  const rawCharges: { name: string; amount: number }[] = Array.isArray((parsed as any).charges)
    ? (parsed as any).charges
    : [];

  if (rawCharges.length === 0) {
    // Fallback: build from legacy taxes / serviceCharge / tip
    if (parsed.taxes && Array.isArray(parsed.taxes)) {
      parsed.taxes.forEach((t) => {
        if (t.amount && t.amount !== 0) rawCharges.push({ name: t.name, amount: t.amount });
      });
    }
    if (parsed.serviceCharge && parsed.serviceCharge !== 0)
      rawCharges.push({ name: "Service Charge", amount: parsed.serviceCharge });
    if (parsed.tip && parsed.tip !== 0)
      rawCharges.push({ name: "Tip", amount: parsed.tip });
    if (parsed.discount && parsed.discount !== 0)
      rawCharges.push({ name: "Discount", amount: -Math.abs(parsed.discount) });
  }

  const extractedCharges = rawCharges
    .map((c) => ({ name: String(c?.name ?? "").trim(), amount: toAmount(c?.amount) ?? 0 }))
    .filter((c) => c.name && c.amount !== 0 && !/gstin/i.test(c.name))
    // A tax printed at 0% (e.g. "CGST @ 0%") is always ₹0, whatever amount was
    // read next to it — usually a number from another column.
    .filter((c) => !isZeroRateTax(c.name));

  // Check charges against the printed total: drops tax lines that are only a
  // breakdown of tax-inclusive prices, so GST is never added twice.
  const itemsSum = parsed.items.reduce((sum, it) => sum + it.price, 0);
  const reconciled = reconcileCharges(itemsSum, extractedCharges, parsed.total);
  parsed.charges = reconciled.charges;
  parsed.printedTotal = parsed.total;
  parsed.taxInclusive = reconciled.taxInclusive;
  if (reconciled.taxInclusive) {
    console.log("[parseBill] Tax lines are included in item prices — not adding them on top");
  }

  // Back-fill legacy scalar fields from charges[] so split.tsx / any
  // downstream code that reads gst/serviceCharge still works.
  const SC_NAMES  = /service.?charge|packaging|delivery|convenience/i;
  const DISC_NAMES = /discount|round.?off|rounding/i;

  parsed.gst = parsed.charges
    .filter((c) => isTaxCharge(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  parsed.serviceCharge = parsed.charges
    .filter((c) => SC_NAMES.test(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  parsed.tip = parsed.charges
    .filter((c) => /tip/i.test(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  parsed.discount = parsed.charges
    .filter((c) => DISC_NAMES.test(c.name))
    .reduce((s, c) => s + c.amount, 0) || null;

  parsed.charges.forEach((c) =>
    console.log(`[Charge] ${c.name}: ${c.amount}`)
  );

    // Sanity check: items + charges should add up to the printed total.
    const computed =
      parsed.items.reduce((sum, it) => sum + it.price, 0) +
      parsed.charges.reduce((sum, c) => sum + c.amount, 0);
    if (Math.abs(computed - parsed.total) > 1) {
      console.warn(`[parseBill] ⚠ Items + charges = ₹${computed.toFixed(2)} but printed total = ₹${parsed.total}`);
    }

    console.log(`[parseBill] ✓ ${parsed.items.length} items, total ₹${parsed.total}`);
    console.log(`[parseBill] Parse duration: ${Date.now() - parseStart}ms, Retries: ${retryCount}, Fallback: ${fallbackUsed}`);
    return parsed;

  } catch (err) {
    console.error("[parseBill] Gemini Parsing Failed:", err);
    console.log("[parseBill] Falling back to local regex parser...");
    
    fallbackUsed = true;
    const parsed = localFallbackParser(ocrText);
    parsed.extractionNote = fallbackNote(err);
    
    console.log(`[parseBill] ✓ Fallback parsed ${parsed.items.length} items, total ₹${parsed.total}`);
    console.log(`[parseBill] Parse duration: ${Date.now() - parseStart}ms, Retries: ${retryCount}, Fallback: ${fallbackUsed}`);
    
    return parsed;
  }
}

// ---------------------------------------------------------------------------
// Local Fallback Parser  (used when Gemini is unavailable)
// ---------------------------------------------------------------------------
function localFallbackParser(ocrText: string): ParsedBill {
  const lines = ocrText.split("\n");
  const items: any[] = [];

  // ── Exclusion guard ────────────────────────────────────────────────────────
  // Returns true for lines that are obviously NOT food items
  const EXCLUDE = /\b(total|sub.?total|subtotal|grand|bill|amount|tax|gst|cgst|sgst|igst|vat|cess|service|charge|surcharge|delivery|packing|packaging|tip|discount|round|rounding|table|cover|date|time|no\.|#|invoice|receipt|order|item|description|qty|quantity|rate|price|thank|visit|fssai|gstin|pan|cin|www|http|@|coupon|offer|promo)\b/i;
  const SEPARATOR = /^[-=*_\s]{3,}$/;

  // ── Currency / number helpers ──────────────────────────────────────────────
  // Strip ₹, Rs, INR, commas from a numeric token
  const parseNum = (s: string) =>
    parseFloat(s.replace(/[₹\u20b9,RsINR\s]/gi, "")) || 0;

  // ── 4 patterns, tried in order ────────────────────────────────────────────
  //
  // P1: NAME  QTY  UNITPRICE  AMOUNT   e.g. "Butter Chicken  2  250.00  500.00"
  // P2: NAME  QTY  AMOUNT              e.g. "Butter Chicken  2  500.00"
  // P3: NAME  ₹AMOUNT  (or NAME  AMOUNT at line end)
  //        e.g. "Butter Chicken  500.00"  /  "Butter Chicken ₹500"
  // P4: NAME XQTY × RATE              e.g. "Butter Chicken 2x250"
  //
  // All patterns require the name to start with a letter and be ≥2 chars.

  const P1 = /^([A-Za-z][A-Za-z0-9 &()\-\/'.]{1,}?)\s{2,}(\d[\d.,]*)\s{2,}(\d[\d.,]*)\s{2,}(\d[\d.,]*)$/;
  const P2 = /^([A-Za-z][A-Za-z0-9 &()\-\/'.]{1,}?)\s{2,}(\d[\d.,]*)\s{2,}(\d[\d.,]*)$/;
  const P3 = /^([A-Za-z][A-Za-z0-9 &()\-\/'.]{1,}?)\s+[₹\u20b9]?\s*(\d[\d.,]+)$/;
  const P4 = /^([A-Za-z][A-Za-z0-9 &()\-\/'.]{1,}?)\s+(\d+)\s*[xX×]\s*(\d[\d.,]*)$/;

  // Minimum amount threshold — ignore anything < ₹1 (likely a quantity or code)
  const MIN_AMOUNT = 1;
  // Maximum plausible single-item amount — ignore absurdly large numbers
  const MAX_AMOUNT = 50000;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || SEPARATOR.test(line)) return;
    if (EXCLUDE.test(line)) return;

    // Pattern 1 — NAME  QTY  UNIT  AMOUNT
    let m = line.match(P1);
    if (m) {
      const name   = m[1].trim();
      const qty    = parseNum(m[2]);
      // Could be (qty, unitPrice, amount) or (unitPrice, qty, amount)
      // Pick interpretation where qty×unit ≈ amount
      const a      = parseNum(m[3]);
      const b      = parseNum(m[4]);
      let unitPrice = a, quantity = qty, amount = b;
      if (Math.abs(qty * a - b) > 1 && Math.abs(a - b) < 1) {
        // m[2] is actually unit price and m[3] is qty
        unitPrice = qty; quantity = a; amount = b;
      }
      if (isMetadataOrTax(name) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return;
      items.push(createItem(name, unitPrice, quantity || 1, amount, index));
      return;
    }

    // Pattern 2 — NAME  QTY  AMOUNT
    m = line.match(P2);
    if (m) {
      const name   = m[1].trim();
      const qty    = parseNum(m[2]);
      const amount = parseNum(m[3]);
      if (isMetadataOrTax(name) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return;
      const unitPrice = qty > 0 ? amount / qty : amount;
      items.push(createItem(name, unitPrice, qty || 1, amount, index));
      return;
    }

    // Pattern 3 — NAME  ₹?AMOUNT
    m = line.match(P3);
    if (m) {
      const name   = m[1].trim();
      const amount = parseNum(m[2]);
      if (isMetadataOrTax(name) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return;
      items.push(createItem(name, amount, 1, amount, index));
      return;
    }

    // Pattern 4 — NAME  QTY × RATE
    m = line.match(P4);
    if (m) {
      const name     = m[1].trim();
      const qty      = parseNum(m[2]);
      const unitPrice = parseNum(m[3]);
      const amount   = qty * unitPrice;
      if (isMetadataOrTax(name) || amount < MIN_AMOUNT || amount > MAX_AMOUNT) return;
      items.push(createItem(name, unitPrice, qty, amount, index));
    }
  });

  // De-duplicate by (name, amount) — OCR sometimes repeats lines
  const seen = new Set<string>();
  const deduped = items.filter((it) => {
    const key = `${it.name.toLowerCase()}|${it.price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const itemsSum = Math.round(deduped.reduce((s, it) => s + it.price, 0) * 100) / 100;

  // Taxes / charges / printed total, checked against each other so GST is
  // neither lost nor double-counted.
  const found = extractChargesAndTotal(lines);
  const reconciled = reconcileCharges(itemsSum, found.charges, found.printedTotal);
  const charges = reconciled.charges;
  const total = Math.round((itemsSum + charges.reduce((s, c) => s + c.amount, 0)) * 100) / 100;
  const sumOf = (re: RegExp) =>
    charges.filter((c) => re.test(c.name)).reduce((s, c) => s + c.amount, 0) || null;

  console.log(`[localFallback] Matched ${deduped.length} items, ${charges.length} charges from ${lines.length} lines`);

  return {
    isBill:     true, // local fallback cannot classify; let the user review
    restaurant: "Extracted Locally",
    legalName:  "",
    billNumber: "",
    date:       "",
    items:      deduped,
    subtotal:   itemsSum,
    charges,
    taxes:      [],
    gst:        charges.filter((c) => isTaxCharge(c.name)).reduce((s, c) => s + c.amount, 0) || null,
    serviceCharge: sumOf(/service.?charge|packaging|packing|delivery|convenience/i),
    tip:        sumOf(/\btip\b/i),
    discount:   sumOf(/discount|round.?off|rounding/i),
    total,
    printedTotal: found.printedTotal,
    taxInclusive: reconciled.taxInclusive,
  };
}

/**
 * Offline extraction of charge lines (CGST, service charge, round off, ...)
 * and the printed grand total from receipt rows like "CGST 2.5%  26.25".
 */
export function extractChargesAndTotal(lines: string[]): {
  charges: { name: string; amount: number }[];
  printedTotal: number | null;
} {
  const CHARGE = /(^|[^a-z])(c|s|i|ut)?gst(?!in)|\bvat\b|\bcess\b|service\s*charge|\bs\.?c\.?\b|packing|packaging|delivery|convenience|round.?off|rounding|discount|\btip\b/i;
  const NOT_A_CHARGE = /taxable|gstin|\bon\b|\bincl/i;
  const STRONG_TOTAL = /grand\s*total|net\s*(amount|total|payable)|amount\s*payable|total\s*payable|bill\s*amount|total\s*amount/i;
  const WEAK_TOTAL = /\btotal\b/i;
  const NOT_TOTAL = /sub.?total|taxable|total\s*(qty|quantity|items?)|\bno\.?\s*of/i;

  const charges: { name: string; amount: number }[] = [];
  const seen = new Set<string>();
  let strongTotal: number | null = null;
  let weakTotal: number | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    // name … amount   (amount may be "-0.50", "(20.00)", "₹ 1,102.00")
    const m = line.match(/^(.*?[A-Za-z%).].*?)[\s:=]+((?:-\s*)?(?:₹|Rs\.?|INR)?\s*\(?-?[\d,]*\.?\d+\)?)$/i);
    if (!m) continue;
    const name = m[1].replace(/[:\-–]+$/, "").trim();
    const amount = toAmount(m[2]);
    if (amount === null || !name) continue;

    if (!NOT_TOTAL.test(name) && STRONG_TOTAL.test(name)) { strongTotal = amount; continue; }
    if (!NOT_TOTAL.test(name) && WEAK_TOTAL.test(name) && !CHARGE.test(name)) { weakTotal = amount; continue; }

    if (CHARGE.test(name) && !NOT_A_CHARGE.test(name) && amount !== 0 && !isZeroRateTax(name)) {
      const signed = /discount/i.test(name) ? -Math.abs(amount) : amount;
      const key = `${name.toLowerCase()}|${signed}`;
      if (seen.has(key)) continue; // tax summary tables often repeat lines
      seen.add(key);
      charges.push({ name, amount: signed });
    }
  }

  return { charges, printedTotal: strongTotal ?? weakTotal };
}

/** True for a tax line whose printed rate is 0%, e.g. "CGST @ 0%", "SGST 0.00 %". */
export function isZeroRateTax(name: string): boolean {
  return isTaxCharge(name) && /(?<![\d.])0+(?:\.0+)?\s*%/.test(name);
}

function isMetadataOrTax(name: string): boolean {
  return /\b(total|sub.?total|amount|tax|gst|cgst|sgst|igst|vat|cess|service|charge|discount|round|table|cover|tip|delivery|packing)\b/i.test(name);
}

function createItem(
  name: string,
  unitPrice: number,
  quantity: number,
  amount: number,
  lineIndex: number
) {
  return {
    id: "",
    name,
    quantity: quantity || 1,
    unitPrice,
    amount,
    price: amount,
    children: [],
    modifiers: [],
    lineIndex,
    confidence: 0.5, // Low — user should review
  };
}
