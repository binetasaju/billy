// ---------------------------------------------------------------------------
// services/upiResult.ts — what did the UPI app say?
//
// Replies follow the NPCI intent spec, but apps differ in key case and
// spelling ("Status" / "status", "txnRef" / "ApprovalRefNo"…). Anything that
// isn't clearly SUCCESS or FAILURE is "unknown" — Billy then asks the person.
// ---------------------------------------------------------------------------

export type UpiOutcome = "success" | "failure" | "submitted" | "unknown";

export interface UpiResult {
  outcome: UpiOutcome;
  /** Transaction reference for the record, when the app gives one. */
  reference?: string;
}

export function parseUpiResponse(response: string | null | undefined): UpiResult {
  if (!response || !response.trim()) return { outcome: "unknown" };
  const fields = new Map<string, string>();
  for (const part of response.split("&")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    let value = part.slice(i + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // keep as is
    }
    fields.set(part.slice(0, i).trim().toLowerCase(), value);
  }
  const status = (fields.get("status") ?? "").toLowerCase();
  const code = fields.get("responsecode") ?? "";
  const reference =
    fields.get("txnref") || fields.get("approvalrefno") || fields.get("txnid") || fields.get("transactionid") || undefined;

  if (status === "success") return { outcome: "success", reference };
  if (status === "failure" || status === "failed") return { outcome: "failure", reference };
  if (status === "submitted" || status === "pending") return { outcome: "submitted", reference };
  // Some apps only send a response code ("00" = success).
  if (!status && code === "00") return { outcome: "success", reference };
  return { outcome: "unknown", reference };
}
