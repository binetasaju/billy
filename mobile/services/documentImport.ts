// ---------------------------------------------------------------------------
// services/documentImport.ts — "Upload Bill (PDF)"
//
// Pick a PDF e-bill / invoice (Swiggy, Zomato, Amazon, a restaurant's
// emailed bill…) or an image file. Images go through the normal photo flow
// (Preview → Continue); a PDF is sent to Gemini as it is — Gemini reads PDFs
// directly — and lands on Review.
// ---------------------------------------------------------------------------
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { parseBill } from "./parseBill";
import { billStore } from "./billStore";
import { authStore } from "./authStore";
import { nanoid } from "../utils/nanoid";
import { ExtractionError, NOT_A_BILL } from "./billExtraction";

/**
 * Largest PDF Billy sends. Base64 adds a third, and Billy's server accepts
 * request bodies up to 4.5 MB.
 */
export const MAX_PDF_BYTES = 3 * 1024 * 1024;

export type PickedBill =
  | { kind: "pdf"; uri: string; name: string; size: number | null }
  | { kind: "image"; uri: string };

export function isPdf(name: string | null | undefined, mimeType: string | null | undefined): boolean {
  return mimeType === "application/pdf" || /\.pdf$/i.test(name ?? "");
}

/** Open the file picker. Null when the person cancels. */
export async function pickBillDocument(): Promise<PickedBill | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ["application/pdf", "image/*"],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (isPdf(a.name, a.mimeType)) return { kind: "pdf", uri: a.uri, name: a.name, size: a.size ?? null };
  if ((a.mimeType ?? "").startsWith("image/")) return { kind: "image", uri: a.uri };
  throw new ExtractionError("Pick a PDF bill or a photo of a bill.");
}

/** Read a PDF bill and put it in billStore, ready for Review. */
export async function extractBillFromPdf(uri: string, size?: number | null): Promise<void> {
  const bytes = size ?? (await FileSystem.getInfoAsync(uri).then((i) => (i.exists ? i.size : 0)).catch(() => 0));
  if (bytes > MAX_PDF_BYTES) {
    throw new ExtractionError("That PDF is too big (over 3 MB). Try a smaller file or a screenshot of the bill.");
  }
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" as FileSystem.EncodingType });
  if (!base64) throw new ExtractionError("The file couldn't be read. Please try again.");

  const bill = await parseBill("", { imageBase64: base64, mimeType: "application/pdf" });
  // The offline parser needs text, which a PDF doesn't give us.
  if (bill.extractionNote) {
    throw new ExtractionError("Couldn't read the PDF right now — the AI service is unavailable. Please try again in a moment.");
  }
  if (bill.isBill === false) throw new ExtractionError(NOT_A_BILL, true);
  if (bill.items.length === 0) throw new ExtractionError("No items found in that PDF. Is it an itemised bill?");

  bill.items = bill.items.map((it) => ({ ...it, id: it.id || nanoid() }));
  billStore.set(bill, "", null, authStore.get().user);
}
