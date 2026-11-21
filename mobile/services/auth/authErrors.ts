// ---------------------------------------------------------------------------
// services/auth/authErrors.ts — plain-language messages for sign-in errors
//
// Firebase errors carry a code like "auth/billing-not-enabled" (on `code`, and
// in the message as "[auth/...] ..."). The login screen shows these messages
// instead of Firebase's raw text.
// ---------------------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  "auth/billing-not-enabled":
    "Text messages can't be sent yet — the app's SMS service isn't switched on. Please try again later.",
  "auth/quota-exceeded": "Too many codes have been sent today. Please try again later.",
  "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
  "auth/invalid-phone-number": "That phone number doesn't look right. Check it and try again.",
  "auth/missing-phone-number": "Enter your phone number.",
  "auth/invalid-verification-code": "That code is wrong. Check the SMS and try again.",
  "auth/code-expired": "That code has expired. Go back and request a new one.",
  "auth/session-expired": "That code has expired. Go back and request a new one.",
  "auth/network-request-failed": "No internet connection. Check your connection and try again.",
  "auth/app-not-authorized": "This version of Billy isn't allowed to sign in. Please update the app.",
  "auth/missing-client-identifier": "This version of Billy isn't allowed to sign in. Please update the app.",
  "auth/captcha-check-failed": "Couldn't verify this device. Please try again.",
  // Email + password
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead.",
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/weak-password": "Choose a stronger password (at least 6 characters).",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "No account with this email. Create one instead.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/operation-not-allowed": "This sign-in method isn't switched on for Billy yet.",
  "auth/user-mismatch": "That's a different Google account. Pick the one you use for Billy.",
  "auth/requires-recent-login": "For your safety, please log out, sign in again and retry.",
  "auth/account-exists-with-different-credential":
    "This email already has a Billy account. Sign in with your email and password.",
};

/** The Firebase error code, from `code` or from a "[auth/...]" message. */
export function authErrorCode(e: unknown): string | null {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.startsWith("auth/")) return code;
  const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  return message.match(/auth\/[a-z0-9-]+/i)?.[0].toLowerCase() ?? null;
}

/** A message the person can act on. Unknown errors get `fallback`. */
export function friendlyAuthError(e: unknown, fallback: string): string {
  const code = authErrorCode(e);
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (code) return fallback;
  // Non-Firebase errors (e.g. our own validation) are already readable.
  return e instanceof Error && e.message ? e.message : fallback;
}
