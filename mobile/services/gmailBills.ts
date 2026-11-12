// ---------------------------------------------------------------------------
// services/gmailBills.ts — find order e-bills in Gmail and read them
//
//   connectGmail()      Google account picker + "read your email" permission
//   listBillEmails()    recent order / invoice emails from food & shopping apps
//   readBillEmail()     one email → plain text for the bill parser
//
// gmail.readonly is a Google *restricted* scope: until Google verifies Billy
// (security assessment) only the test users on the OAuth consent screen can
// use it (max 100). For a public release these calls belong on a server.
// Before it works at all: enable the Gmail API in Google Cloud and add the
// scope + test users on the consent screen (see NEXT_STEPS.md).
// ---------------------------------------------------------------------------

import { ensureGoogleConfigured } from "./auth/googleSignIn";

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Senders whose order emails carry an itemised bill. */
export const BILL_SENDERS = [
  "swiggy.in",
  "zomato.com",
  "amazon.in",
  "bigbasket.com",
  "zeptonow.com",
  "blinkit.com",
  "dominos.co.in",
  "eatsure.com",
  "flipkart.com",
  "jiomart.com",
  "dunzo.in",
  "magicpin.in",
];

export const BILL_QUERY =
  `from:(${BILL_SENDERS.join(" OR ")}) ` +
  "subject:(order OR invoice OR receipt OR bill OR delivered) newer_than:90d";

/** Longest email text sent to the parser (order emails are much shorter). */
const MAX_TEXT = 12_000;

export class GmailError extends Error {
  constructor(message: string, readonly kind: "cancelled" | "setup" | "permission" | "network" = "network") {
    super(message);
    this.name = "GmailError";
  }
}

export interface BillEmail {
  id: string;
  subject: string;
  /** Sender's display name, e.g. "Swiggy". */
  from: string;
  date: Date | null;
  snippet: string;
}

// ── Pure helpers (unit tested) ──────────────────────────────────────────────

/** Gmail's base64url body → string (UTF-8). */
export function base64UrlToUtf8(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const c of b64) {
    const v = chars.indexOf(c);
    if (v < 0) continue; // padding / whitespace
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  // UTF-8 decode
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i++];
    let cp: number;
    if (b < 0x80) cp = b;
    else if (b >= 0xf0) cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xe0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else if (b >= 0xc0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else cp = 0xfffd;
    out += String.fromCodePoint(cp);
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'",
  rdquo: '"', ldquo: '"', ndash: "-", mdash: "-", times: "x", middot: "·", bull: "•", rupee: "₹", hellip: "...",
};

/** HTML email → readable lines (table cells on one line, rows on separate lines). */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/(td|th)>/gi, "  ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|table|section)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

interface GmailPart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

/** Best text of a Gmail message payload: text/html (keeps tables) → text/plain. */
export function messageText(payload: GmailPart | undefined): string {
  const found: Record<string, string> = {};
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    const type = (p.mimeType ?? "").toLowerCase();
    if ((type === "text/html" || type === "text/plain") && p.body?.data && !found[type]) {
      found[type] = base64UrlToUtf8(p.body.data);
    }
    p.parts?.forEach(walk);
  };
  walk(payload);
  // Order emails lay the bill out in HTML tables; plain-text versions often
  // drop the prices, so prefer HTML.
  const text = found["text/html"] ? htmlToText(found["text/html"]) : (found["text/plain"] ?? "").trim();
  return text.length > MAX_TEXT ? text.slice(0, MAX_TEXT) : text;
}

/** "Swiggy <noreply@swiggy.in>" → "Swiggy". */
export function senderName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*</);
  if (m) return m[1].trim();
  return from.replace(/[<>]/g, "").split("@")[0].trim();
}

function header(headers: { name: string; value: string }[] | undefined, name: string): string {
  return headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

// ── Google account + permission ─────────────────────────────────────────────

function loadLibrary(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-google-signin/google-signin");
  } catch {
    throw new GmailError("Importing from Gmail needs the app to be rebuilt.", "setup");
  }
}

let accessToken: string | null = null;

/**
 * Pick a Google account (the one that gets the order emails) and allow Billy
 * to read email. Returns false when the person cancels.
 */
export async function connectGmail(): Promise<boolean> {
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = loadLibrary();
  try {
    ensureGoogleConfigured();
  } catch (e: any) {
    throw new GmailError(e?.message || "Google isn't set up for Billy yet.", "setup");
  }
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    if (!GoogleSignin.getCurrentUser()) {
      const res = GoogleSignin.hasPreviousSignIn() ? await GoogleSignin.signInSilently() : await GoogleSignin.signIn();
      if (!isSuccessResponse(res)) {
        // No saved account (silent) → show the picker.
        const picked = await GoogleSignin.signIn();
        if (!isSuccessResponse(picked)) return false;
      }
    }
    const granted: string[] = GoogleSignin.getCurrentUser()?.scopes ?? [];
    if (!granted.includes(GMAIL_SCOPE)) {
      const res = await GoogleSignin.addScopes({ scopes: [GMAIL_SCOPE] });
      if (!res || !isSuccessResponse(res)) return false;
    }
    accessToken = (await GoogleSignin.getTokens()).accessToken;
    return !!accessToken;
  } catch (e: any) {
    if (isErrorWithCode(e) && (e.code === statusCodes.SIGN_IN_CANCELLED || e.code === statusCodes.IN_PROGRESS)) {
      return false;
    }
    if (isErrorWithCode(e) && (String(e.code) === "10" || /DEVELOPER_ERROR/i.test(String(e.code)))) {
      throw new GmailError("Google isn't set up correctly for this build of Billy.", "setup");
    }
    throw new GmailError(e?.message || "Couldn't connect to Gmail.", "network");
  }
}

/** Use another Google account next time. */
export async function disconnectGmail(): Promise<void> {
  accessToken = null;
  try {
    await loadLibrary().GoogleSignin.signOut();
  } catch {
    // nothing to clear
  }
}

async function gmailGet(path: string, retried = false): Promise<any> {
  if (!accessToken) throw new GmailError("Not connected to Gmail.", "permission");
  let res: Response;
  try {
    res = await fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new GmailError("No internet connection. Please try again.", "network");
  }
  if (res.status === 401 && !retried) {
    // Token expired: get a fresh one once.
    const { GoogleSignin } = loadLibrary();
    await GoogleSignin.clearCachedAccessToken(accessToken).catch(() => {});
    accessToken = (await GoogleSignin.getTokens()).accessToken;
    return gmailGet(path, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(body)) {
      throw new GmailError("Gmail import isn't switched on for Billy yet (Gmail API not enabled).", "setup");
    }
    if (res.status === 403 || res.status === 401) {
      throw new GmailError("Billy wasn't allowed to read your email.", "permission");
    }
    throw new GmailError(`Gmail didn't answer (${res.status}). Please try again.`, "network");
  }
  return res.json();
}

// ── Emails ──────────────────────────────────────────────────────────────────

export async function listBillEmails(max = 25): Promise<BillEmail[]> {
  const list = await gmailGet(`messages?maxResults=${max}&q=${encodeURIComponent(BILL_QUERY)}`);
  const ids: string[] = (list.messages ?? []).map((m: any) => m.id);
  const metas = await Promise.all(
    ids.map((id) =>
      gmailGet(`messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`).catch(() => null)
    )
  );
  return metas
    .filter(Boolean)
    .map((m: any) => {
      const date = header(m.payload?.headers, "Date");
      const parsed = date ? new Date(date) : null;
      return {
        id: m.id,
        subject: header(m.payload?.headers, "Subject") || "(no subject)",
        from: senderName(header(m.payload?.headers, "From")),
        date: parsed && !isNaN(parsed.getTime()) ? parsed : null,
        snippet: htmlToText(m.snippet ?? ""),
      };
    });
}

/** The email as plain text, ready for parseBill. */
export async function readBillEmail(id: string): Promise<string> {
  const msg = await gmailGet(`messages/${id}?format=full`);
  const text = messageText(msg.payload);
  if (!text) throw new GmailError("This email has no readable bill.", "network");
  const subject = header(msg.payload?.headers, "Subject");
  const from = senderName(header(msg.payload?.headers, "From"));
  // Sender + subject help the parser pick the restaurant / shop name.
  return [`From: ${from}`, `Subject: ${subject}`, "", text].join("\n");
}
