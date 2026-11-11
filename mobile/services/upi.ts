import { Linking } from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
import * as Clipboard from "expo-clipboard";

/**
 * Basic UPI ID (VPA) format check: <handle>@<psp>.
 * Deliberately permissive — this catches typos, it does not verify the VPA
 * exists (only a PSP can do that).
 */
export function isValidUpiId(value: string): boolean {
  return /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/.test(value.trim());
}

export interface UpiPaymentConfig {
  upiId: string;
  receiverName: string;
  amount: number;
  note?: string;
}

/**
 * Build a UPI payment link per the NPCI deep-link spec:
 * upi://pay?pa=name@bank&pn=ReceiverName&am=10.00&cu=INR&tn=OptionalNote
 */
export function buildUpiUri({ upiId, receiverName, amount, note }: UpiPaymentConfig): string {
  const pa = encodeURIComponent(upiId.trim());
  const pn = encodeURIComponent(receiverName);
  const am = amount.toFixed(2);
  const tn = note ? `&tn=${encodeURIComponent(note)}` : "";
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR${tn}`;
}

/**
 * Text for a "please pay me" message (WhatsApp / SMS). Includes a one-tap UPI
 * link when the requester has a valid UPI ID.
 */
export function buildPaymentRequestMessage(opts: {
  payerName: string;
  requesterName: string;
  requesterUpiId?: string | null;
  amount: number;
  billTitle: string;
}): string {
  const { payerName, requesterName, requesterUpiId, amount, billTitle } = opts;
  const lines = [
    `Hi ${payerName}, your share for "${billTitle}" is ₹${amount.toFixed(2)}.`,
  ];
  if (requesterUpiId && isValidUpiId(requesterUpiId)) {
    lines.push(
      `Pay ${requesterName} on UPI: ${requesterUpiId.trim()}`,
      buildUpiUri({ upiId: requesterUpiId, receiverName: requesterName, amount, note: billTitle })
    );
  }
  lines.push("— sent from Billy");
  return lines.join("\n");
}

/**
 * One message for the whole bill — shared to the group chat from the bill
 * page (replaces per-person "Request" messages).
 */
export function buildBillShareMessage(opts: {
  title: string;
  date: string;
  total: number;
  payerName: string;
  payerUpiId?: string | null;
  rows: { name: string; amount: number; status: "pending" | "paid" | "cancelled" }[];
  closed?: boolean;
  /** Link that opens this bill in the Billy app. */
  link?: string;
}): string {
  const money = (n: number) => `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
  const lines = [
    `🧾 ${opts.title} · ${opts.date}`,
    `Bill total: ${money(opts.total)}`,
    `Paid by ${opts.payerName}`,
  ];
  if (opts.closed) lines.push("This bill was closed — a corrected bill will follow.");
  if (opts.rows.length > 0) {
    lines.push("", "Shares:");
    for (const r of opts.rows) {
      const state = r.status === "paid" ? "✓ paid" : r.status === "cancelled" ? "cancelled" : "pending";
      lines.push(`• ${r.name} — ${money(Math.round(r.amount * 100) / 100)} (${state})`);
    }
  }
  const anyPending = opts.rows.some((r) => r.status === "pending");
  if (anyPending && opts.payerUpiId && isValidUpiId(opts.payerUpiId)) {
    lines.push("", `Pay ${opts.payerName} on UPI: ${opts.payerUpiId.trim()}`);
  }
  if (opts.link) lines.push("", `Open in Billy: ${opts.link}`);
  lines.push("— sent from Billy");
  return lines.join("\n");
}

/** Web host for shared bill links (Firebase Hosting, see /web). */
export const BILL_LINK_HOST = "billy-ed9eb.web.app";

/**
 * Tappable link to a saved bill. WhatsApp only links https URLs, so this is a
 * web link: with Billy installed Android opens it straight in the app (App
 * Links, verified by web/public/.well-known/assetlinks.json); otherwise the
 * web page offers an "Open in Billy" button.
 */
export function billLink(billId: string, inviteCode?: string): string {
  const base = `https://${BILL_LINK_HOST}/bill/${encodeURIComponent(billId)}`;
  // The invite code lets friends who aren't on the bill yet join it.
  return inviteCode ? `${base}?c=${encodeURIComponent(inviteCode)}` : base;
}

export async function openUpiPayment(config: UpiPaymentConfig): Promise<void> {
  const { upiId } = config;
  const url = buildUpiUri(config);

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Clipboard.setStringAsync(upiId);
      appAlert.alert(
        "No UPI App Found",
        "We couldn't find a UPI app installed on your device. The receiver's UPI ID has been copied to your clipboard."
      );
    }
  } catch (err) {
    appAlert.alert("Payment Error", "Something went wrong while trying to open a UPI app.");
    console.error("[UPI Error]", err);
  }
}
