// ---------------------------------------------------------------------------
// services/documentImport.ts — "Upload Bill File"
//
// Pick any file that holds a bill — an e-bill PDF (Swiggy, Zomato, Amazon…),
// an image, a saved email / web page (.eml, .html), a text or CSV export, or
// a Word / Excel / OpenDocument file.
//   • images → the normal photo flow (Preview → Continue)
//   • PDF    → sent to Gemini as it is (Gemini reads PDFs directly)
//   • text-like files and Office files → their text goes to the same parser
//     as a scanned receipt's OCR text (so the offline parser still works)
// Everything except images lands on Review.
// ---------------------------------------------------------------------------
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { unzipSync, strFromU8 } from "fflate";
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
/** Largest text / Office file Billy opens (only its text is sent). */
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Text sent to the parser is cut to this many characters. */
export const MAX_TEXT_CHARS = 60_000;

export type BillFileKind = "image" | "pdf" | "text" | "html" | "office" | "legacyOffice" | "unknown";

export interface BillFile {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

export type PickedBill = { kind: "image"; uri: string } | ({ kind: "file" } & BillFile);

const ext = (name: string | null | undefined) => (/\.([a-z0-9]+)$/i.exec(name ?? "")?.[1] ?? "").toLowerCase();

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp"]);
const HTML_EXT = new Set(["html", "htm", "xhtml", "mht", "mhtml", "eml", "xml"]);
const TEXT_EXT = new Set(["txt", "text", "csv", "tsv", "json", "md", "log", "rtf"]);
const OFFICE_EXT = new Set(["docx", "xlsx", "pptx", "odt", "ods", "odp"]);
const LEGACY_OFFICE_EXT = new Set(["doc", "xls", "ppt"]);

export function isPdf(name: string | null | undefined, mimeType: string | null | undefined): boolean {
  return mimeType === "application/pdf" || ext(name) === "pdf";
}

/** What kind of bill file this is, from its name first and then its type. */
export function classifyBillFile(name: string | null | undefined, mimeType: string | null | undefined): BillFileKind {
  const e = ext(name);
  const m = (mimeType ?? "").toLowerCase();
  if (isPdf(name, mimeType)) return "pdf";
  if (IMAGE_EXT.has(e)) return "image";
  if (HTML_EXT.has(e)) return "html";
  if (TEXT_EXT.has(e)) return "text";
  if (OFFICE_EXT.has(e)) return "office";
  if (LEGACY_OFFICE_EXT.has(e)) return "legacyOffice";
  if (m.startsWith("image/")) return "image";
  if (m.includes("openxmlformats") || m.includes("opendocument")) return "office";
  if (m === "text/html" || m === "message/rfc822" || m.includes("xml")) return "html";
  if (m.startsWith("text/") || m === "application/json" || m === "application/rtf") return "text";
  if (m === "application/msword" || m === "application/vnd.ms-excel" || m === "application/vnd.ms-powerpoint") return "legacyOffice";
  return "unknown";
}

/** Open the file picker (any file type). Null when the person cancels. */
export async function pickBillDocument(): Promise<PickedBill | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: "*/*",
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (classifyBillFile(a.name, a.mimeType) === "image") return { kind: "image", uri: a.uri };
  return { kind: "file", uri: a.uri, name: a.name, mimeType: a.mimeType ?? null, size: a.size ?? null };
}

// ── Turning files into text ─────────────────────────────────────────────────

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#8377": "₹", rupee: "₹" };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    const c = code.toLowerCase();
    if (ENTITIES[c]) return ENTITIES[c];
    if (c.startsWith("#x")) return String.fromCodePoint(parseInt(c.slice(2), 16));
    if (c.startsWith("#")) return String.fromCodePoint(parseInt(c.slice(1), 10));
    return whole;
  });
}

/** Tidy whitespace: no runs of spaces, tabs kept between columns, at most one blank line. */
function tidy(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/[ \f\v ]+/g, " ")
    .replace(/ *\t */g, "\t")
    .replace(/[ \t]*\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Undo quoted-printable encoding (saved emails / .mht pages). */
function decodeQuotedPrintable(s: string): string {
  if (!/=\r?\n|=[0-9A-F]{2}/.test(s)) return s;
  const joined = s.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < joined.length; i++) {
    const hex = joined[i] === "=" ? joined.slice(i + 1, i + 3) : "";
    if (/^[0-9A-F]{2}$/i.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      const code = joined.charCodeAt(i);
      if (code < 0x80) bytes.push(code);
      else bytes.push(...Array.from(new TextEncoder().encode(joined[i])));
    }
  }
  return strFromU8(Uint8Array.from(bytes));
}

/** Visible text of an HTML / XML page (or a saved email), with line breaks kept. */
export function htmlToText(html: string): string {
  const body = decodeQuotedPrintable(html)
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section|article)>/gi, "\n")
    .replace(/<\/(td|th)>/gi, "\t")
    .replace(/<[^>]+>/g, " ");
  return tidy(decodeEntities(body));
}

/** Plain text of an RTF file (good enough for a bill). */
function rtfToText(rtf: string): string {
  return tidy(
    rtf
      .replace(/\\par[d]?\b/g, "\n")
      .replace(/\\tab\b/g, "\t")
      .replace(/\\'([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\[a-z]+-?\d* ?/gi, "")
      .replace(/[{}]/g, "")
  );
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Text of one Office XML part: paragraphs / rows / cells become line breaks and tabs. */
function officeXmlToText(xml: string): string {
  return tidy(
    decodeEntities(
      xml
        .replace(/<w:tab\/>|<\/w:tc>|<\/table:table-cell>|<\/c>/g, "\t")
        .replace(/<\/(w:p|a:p|text:p|text:h|row|table:table-row)>|<w:br\/>/g, "\n")
        .replace(/<[^>]+>/g, "")
    )
  );
}

/** Text of a .docx / .xlsx / .pptx / .odt / .ods / .odp file (they are zip files of XML). */
export function officeToText(bytes: Uint8Array): string {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.name === "word/document.xml" ||
        f.name === "xl/sharedStrings.xml" ||
        /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) ||
        /^ppt\/slides\/slide\d+\.xml$/.test(f.name) ||
        f.name === "content.xml",
    });
  } catch {
    throw new ExtractionError("That file couldn't be opened. Save it as a PDF, or take a screenshot of the bill.");
  }
  const text = (name: string) => (files[name] ? strFromU8(files[name]) : "");
  const byNumber = (re: RegExp) =>
    Object.keys(files)
      .filter((n) => re.test(n))
      .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]));

  if (files["word/document.xml"]) return officeXmlToText(text("word/document.xml"));
  if (files["content.xml"]) return officeXmlToText(text("content.xml"));

  const sheets = byNumber(/^xl\/worksheets\/sheet\d+\.xml$/);
  if (sheets.length) {
    // Cells that hold text point into sharedStrings by index (t="s").
    const shared = Array.from(text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g), (m) =>
      decodeEntities(m[1].replace(/<[^>]+>/g, ""))
    );
    return tidy(
      sheets
        .map((sheet) =>
          Array.from(text(sheet).matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g), (row) =>
            Array.from(row[1].matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g), (cell) => {
              const attrs = cell[1];
              const inner = cell[2] ?? "";
              const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? "";
              if (/t="s"/.test(attrs)) return shared[Number(v)] ?? "";
              if (/t="inlineStr"/.test(attrs)) return decodeEntities(inner.replace(/<[^>]+>/g, ""));
              return decodeEntities(v);
            }).join("\t")
          ).join("\n")
        )
        .join("\n\n")
    );
  }

  const slides = byNumber(/^ppt\/slides\/slide\d+\.xml$/);
  if (slides.length) return tidy(slides.map((s) => officeXmlToText(text(s))).join("\n\n"));

  throw new ExtractionError("That file has no text Billy can read. Save it as a PDF, or take a screenshot of the bill.");
}

/** True when a decoded file looks like readable text rather than binary data. */
export function looksLikeText(s: string): boolean {
  if (!s) return false;
  const sample = s.slice(0, 4000);
  const bad = (sample.match(/[\u0000-\u0008\u000e-\u001f�]/g) ?? []).length;
  return bad / sample.length < 0.02;
}

async function fileSize(file: BillFile): Promise<number> {
  return file.size ?? (await FileSystem.getInfoAsync(file.uri).then((i) => (i.exists ? i.size : 0)).catch(() => 0));
}

const readUtf8 = (uri: string) => FileSystem.readAsStringAsync(uri);
const readBase64 = (uri: string) => FileSystem.readAsStringAsync(uri, { encoding: "base64" as FileSystem.EncodingType });

const CANT_READ_TYPE = (name: string) => {
  const e = ext(name);
  return `Billy can't read ${e ? `.${e}` : "this kind of"} files. Save the bill as a PDF, or take a screenshot of it.`;
};

/** The bill's text from a non-PDF, non-image file. */
async function textFromFile(file: BillFile, kind: BillFileKind): Promise<string> {
  if (kind === "legacyOffice") {
    throw new ExtractionError(`Old .${ext(file.name) || "doc"} files can't be read. Save it as .docx / .xlsx or PDF, or take a screenshot of the bill.`);
  }
  if (kind === "office") return officeToText(base64ToBytes(await readBase64(file.uri)));

  let raw: string;
  try {
    raw = await readUtf8(file.uri);
  } catch {
    throw new ExtractionError(kind === "unknown" ? CANT_READ_TYPE(file.name) : "The file couldn't be read. Please try again.");
  }
  if (kind === "unknown") {
    if (!looksLikeText(raw)) throw new ExtractionError(CANT_READ_TYPE(file.name));
    return /<\/?(html|body|div|table|td|p)\b/i.test(raw) ? htmlToText(raw) : tidy(raw);
  }
  if (kind === "html") return htmlToText(raw);
  if (ext(file.name) === "rtf" || raw.startsWith("{\\rtf")) return rtfToText(raw);
  return tidy(raw);
}

/** Read a bill file (anything but an image) and put it in billStore, ready for Review. */
export async function extractBillFromFile(file: BillFile): Promise<void> {
  const kind = classifyBillFile(file.name, file.mimeType);
  const bytes = await fileSize(file);

  if (kind === "pdf") {
    if (bytes > MAX_PDF_BYTES) {
      throw new ExtractionError("That PDF is too big (over 3 MB). Try a smaller file or a screenshot of the bill.");
    }
    const base64 = await readBase64(file.uri);
    if (!base64) throw new ExtractionError("The file couldn't be read. Please try again.");
    const bill = await parseBill("", { imageBase64: base64, mimeType: "application/pdf" });
    // The offline parser needs text, which a PDF doesn't give us.
    if (bill.extractionNote) {
      throw new ExtractionError("Couldn't read the PDF right now — the AI service is unavailable. Please try again in a moment.");
    }
    return finish(bill);
  }

  if (bytes > MAX_FILE_BYTES) {
    throw new ExtractionError("That file is too big (over 15 MB). Try a PDF or a screenshot of the bill.");
  }
  const text = (await textFromFile(file, kind)).slice(0, MAX_TEXT_CHARS);
  if (!text.trim()) throw new ExtractionError("That file is empty — no bill text found.");
  // Text works offline too: if the AI is unavailable, the offline parser reads
  // it and Review shows the usual "please check" note.
  return finish(await parseBill(text));
}

function finish(bill: Awaited<ReturnType<typeof parseBill>>) {
  if (bill.isBill === false) throw new ExtractionError(NOT_A_BILL, true);
  if (bill.items.length === 0) throw new ExtractionError("No items found in that file. Is it an itemised bill?");
  bill.items = bill.items.map((it) => ({ ...it, id: it.id || nanoid() }));
  billStore.set(bill, "", null, authStore.get().user);
}
