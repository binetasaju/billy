// ---------------------------------------------------------------------------
// utils/normalizePhoneNumber.ts
//
// Normalizes phone numbers to standard format for Firebase and matching.
// ---------------------------------------------------------------------------

/**
 * Normalizes a raw phone number string into an E.164-like format.
 * 
 * Rules:
 * - Remove spaces, dashes, brackets, and non-numeric characters.
 * - Retain the leading "+" if it exists.
 * - Without a "+", strip leading zeros; a 12-digit number starting with 91
 *   is taken as already having the country code, otherwise prepend "+91"
 *   (assumes India for MVP).
 * 
 * @example
 * normalizePhoneNumber("98765 43210") // returns "+919876543210"
 * normalizePhoneNumber("+91 98765-43210") // returns "+919876543210"
 * normalizePhoneNumber("(987) 654-3210") // returns "+919876543210"
 * normalizePhoneNumber("098765 43210") // returns "+919876543210"
 * normalizePhoneNumber("919876543210") // returns "+919876543210"
 */
export function normalizePhoneNumber(phone?: string | null): string | undefined {
  if (!phone) return undefined;

  // Check if there is a leading '+'
  const hasLeadingPlus = phone.trim().startsWith('+');

  // Remove everything except digits
  const digits = phone.replace(/\D/g, '');

  if (!digits) return undefined;

  if (hasLeadingPlus) {
    return `+${digits}`;
  }

  // Drop trunk/international prefixes: "098765..." or "0091 98765...".
  const national = digits.replace(/^0+/, "");
  if (!national) return undefined;

  // Already carries the 91 country code without a "+" (e.g. "919876543210").
  if (national.length === 12 && national.startsWith("91")) {
    return `+${national}`;
  }

  // Fallback MVP logic: assume Indian number if no country code provided
  return `+91${national}`;
}

/**
 * Validates a phone number a user typed in.
 *
 * - Indian numbers (+91 or no country code) must be a 10-digit mobile number
 *   starting with 6–9.
 * - Other countries (entered with "+") must be a plausible E.164 number
 *   (8–15 digits including the country code).
 */
export function isValidPhoneNumber(phone?: string | null): boolean {
  const norm = normalizePhoneNumber(phone);
  if (!norm) return false;
  const digits = norm.slice(1);
  if (digits.startsWith("91")) {
    return /^91[6-9]\d{9}$/.test(digits);
  }
  return /^[1-9]\d{7,14}$/.test(digits);
}
