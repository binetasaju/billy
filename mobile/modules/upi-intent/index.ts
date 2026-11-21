// JS side of the local UpiIntent module (Android only).
import { requireOptionalNativeModule } from "expo-modules-core";

export interface UpiIntentReply {
  /** False when no UPI app could open the link. */
  launched: boolean;
  /** Android result code (-1 = OK, 0 = cancelled / no result). */
  resultCode: number;
  /** The UPI app's raw reply, e.g. "txnId=…&responseCode=00&Status=SUCCESS&txnRef=…". */
  response: string;
}

const native = requireOptionalNativeModule<{ pay(uri: string, title: string): Promise<UpiIntentReply> }>("UpiIntent");

/** Null when this build doesn't include the module (iOS, or before a rebuild). */
export const upiIntent = native
  ? { pay: (uri: string, title = "Pay with") => native.pay(uri, title) }
  : null;
