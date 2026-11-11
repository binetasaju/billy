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
