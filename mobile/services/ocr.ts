// ---------------------------------------------------------------------------
// services/ocr.ts
//
// Step 1 of the pipeline: Image → compress → Gemini Vision → raw text string.
//
// KEY DESIGN DECISION:
//   This file does OCR ONLY — it returns raw extracted text, not JSON.
//   Structuring happens in parseBill.ts (text-only, no vision required).
//
//   Why separate?
//   • response_mime_type: "application/json" causes Gemini Vision to
//     interpret the image and produce a minimal JSON summary (121 chars).
//     It does NOT perform full line-by-line OCR when JSON mode is on.
//   • Without JSON mode, Gemini returns the complete visible text of the
//     bill — every item, every row, every number. That full text is then
//     sent to parseBill.ts for structuring.
//
// Compression: max 1200px wide, JPEG quality 0.8 (higher = better OCR).
// Model: gemini-2.5-flash (fastest multimodal model — required for vision).
// No maxOutputTokens cap — let Gemini return ALL text.
//
// Retry strategy:
//   • Retryable HTTP codes: 429, 503, 504
//   • Retryable network errors: fetch() throw (no response received)
//   • Max attempts: 4
//   • Backoff delays: 2s → 4s → 8s  (attempt 1 fires immediately)
// ---------------------------------------------------------------------------

import * as ImageManipulator from "expo-image-manipulator";

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

/** HTTP status codes that warrant an automatic retry. */
const RETRYABLE_STATUSES = new Set([429, 503, 504]);

/** Maximum number of total attempts (1 initial + 3 retries). */
const MAX_ATTEMPTS = 4;

/** Delay in milliseconds before each retry attempt (index = retry number, 0-based). */
const BACKOFF_DELAYS_MS = [2_000, 4_000, 8_000];

// ---------------------------------------------------------------------------
// OCR Prompt — full extraction, no summarization
// ---------------------------------------------------------------------------

// IMPORTANT: This prompt must NOT ask for JSON.
// Asking for structured output causes Gemini to skip lines it deems irrelevant.
// We want every character that appears on the bill.
const OCR_PROMPT = `You are a precise OCR (Optical Character Recognition) engine.

Your task: Read the image and output ALL visible text EXACTLY as it appears.

Rules:
- Output every single line of text visible on the bill/receipt.
- Do NOT summarize, interpret, or omit any lines.
- Do NOT skip any food item, price, quantity, or tax row.
- Preserve the original layout — each line of text on its own line.
- Include: restaurant name, bill number, date, every line item with quantity and price, subtotal, all tax lines (GST/CGST/SGST/IGST/VAT), service charge, grand total.
- Also include table headers if present (e.g., "Item  Qty  Rate  Amount").
- Output ONLY the raw text. No commentary, no markdown, no JSON.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getMimeType(uri: string): "image/jpeg" | "image/png" | "image/webp" {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** Returns true if the HTTP status code should trigger an automatic retry. */
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

/** Sleeps for the given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Image compression
// ---------------------------------------------------------------------------

/**
 * Compresses image to max 1200px wide at JPEG quality 0.8.
 * Quality 0.8 preserves fine text detail that OCR needs.
 */
export async function compressImage(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  console.time("[OCR] compress");

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  console.timeEnd("[OCR] compress");
  console.log("[OCR] Compressed:", `${result.width}×${result.height}`);

  return { uri: result.uri, width: result.width, height: result.height };
}

// ---------------------------------------------------------------------------
// Main export — Gemini Vision → raw OCR text  (with retry + backoff)
// ---------------------------------------------------------------------------

/**
 * Sends a compressed bill image to Gemini Vision and returns the full
 * raw text extracted from it.
 *
 * Automatically retries on HTTP 429 / 503 / 504 and network failures
 * using exponential backoff (2 s → 4 s → 8 s), up to 4 total attempts.
 *
 * @param base64    Base64 string (no data: URI prefix)
 * @param uri       File URI — used to derive MIME type only
 * @param onStatus  Optional UI status callback (shown in the scanning screen)
 * @returns         Full raw text string as read from the bill image
 * @throws          Error with user-friendly message on failure
 */
export async function extractTextFromImage(
  base64: string,
  uri: string,
  onStatus?: (msg: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    throw new Error(
      "Gemini API key not set.\n\nOpen .env and set EXPO_PUBLIC_GEMINI_API_KEY."
    );
  }

  const mimeType = getMimeType(uri);

  // ── Pre-call diagnostics ──────────────────────────────────────────────────
  console.log("[OCR] Model:", GEMINI_MODEL);
  console.log("[OCR] MIME type:", mimeType);
  console.log("[OCR] base64 length:", base64.length);
  console.log(
    "[OCR] Approx image size:",
    ((base64.length * 0.75) / 1024).toFixed(1),
    "KB"
  );
  console.log("[OCR] Prompt being sent:\n", OCR_PROMPT);
  console.log("[OCR] generationConfig: { temperature: 0 } — NO response_mime_type, NO maxOutputTokens");

  // ── Request body ──────────────────────────────────────────────────────────
  const requestBody = {
    contents: [
      {
        parts: [
          { text: OCR_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      // ⚠ NO response_mime_type — setting "application/json" makes Gemini
      //   produce a terse summary instead of full OCR text.
      // ⚠ NO maxOutputTokens — any cap will truncate long bills.
    },
  };

  console.log(
    "[OCR] Full request body (without base64):",
    JSON.stringify(
      {
        ...requestBody,
        contents: [
          {
            parts: [
              { text: OCR_PROMPT },
              { inline_data: { mime_type: mimeType, data: "[BASE64 OMITTED]" } },
            ],
          },
        ],
      },
      null,
      2
    )
  );

  const url = `${GEMINI_BASE_URL}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // ── Retry loop ────────────────────────────────────────────────────────────
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Update UI status message
    if (attempt === 1) {
      onStatus?.("Extracting text...");
    } else {
      onStatus?.(`Gemini is busy.\nRetrying (${attempt}/${MAX_ATTEMPTS})...`);
    }

    console.log("[OCR] Attempt:", attempt);
    console.time(`[OCR] Gemini API call (attempt ${attempt})`);

    // ── Single attempt ──────────────────────────────────────────────────────
    let response: Response | null = null;
    let rawBody = "";

    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal,
      });

      console.timeEnd(`[OCR] Gemini API call (attempt ${attempt})`);
      rawBody = await response.text();

      console.log("[OCR] Status:", response.status);
      console.log(
        "[OCR] Full Gemini response:",
        JSON.stringify(JSON.parse(rawBody), null, 2)
      );
    } catch (networkErr: any) {
      if (networkErr.name === "AbortError") {
        throw new Error("OCR cancelled.");
      }
      // fetch() itself threw — no HTTP response received (timeout, DNS, etc.)
      console.timeEnd(`[OCR] Gemini API call (attempt ${attempt})`);
      console.log("[OCR] Status: network error (no response)");
      console.warn(`[OCR] Network failure on attempt ${attempt}:`, networkErr?.message ?? networkErr);
      lastError = new Error(`Network failure: ${networkErr?.message ?? "unknown"}`);

      if (attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_DELAYS_MS[attempt - 1];
        console.log(`[OCR] Waiting ${delay}ms before retry…`);
        await sleep(delay);
        continue; // → next attempt
      }
      break; // exhausted retries
    }

    // ── HTTP-level failure ──────────────────────────────────────────────────
    if (!response.ok) {
      lastError = new Error(`Gemini OCR error (${response.status}): ${rawBody}`);

      if (isRetryableStatus(response.status) && attempt < MAX_ATTEMPTS) {
        const delay = BACKOFF_DELAYS_MS[attempt - 1];
        console.warn(
          `[OCR] HTTP ${response.status} on attempt ${attempt} — retrying in ${delay}ms…`
        );
        await sleep(delay);
        continue; // → next attempt
      }

      // Non-retryable error, or retries exhausted — break and throw below
      break;
    }

    // ── Unpack Gemini response envelope ────────────────────────────────────
    let envelope: any;
    try {
      envelope = JSON.parse(rawBody);
    } catch {
      throw new Error(
        `Gemini returned non-JSON body: ${rawBody.substring(0, 300)}`
      );
    }

    // Check for truncation
    const finishReason = envelope?.candidates?.[0]?.finishReason;
    const usageMetadata = envelope?.usageMetadata;
    console.log("[OCR] finishReason:", finishReason);
    // "STOP" = completed normally
    // "MAX_TOKENS" = truncated (no cap set, should not happen)
    console.log("[OCR] usageMetadata:", JSON.stringify(usageMetadata));

    const text: string | undefined =
      envelope?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text || text.trim() === "") {
      throw new Error(
        `Gemini returned no text.\nfinishReason: ${finishReason ?? "unknown"}\n\nTry a clearer photo.`
      );
    }

    console.log("[OCR] Response length (chars):", text.length);
    console.log("[OCR] Full extracted text:\n", text);

    return text.trim(); // ✅ success
  }

  // ── All attempts exhausted ─────────────────────────────────────────────────
  console.error("[OCR] All", MAX_ATTEMPTS, "attempts failed. Last error:", lastError?.message);
  throw new Error(
    "Unable to process the receipt right now.\nPlease try again in a few moments."
  );
}
