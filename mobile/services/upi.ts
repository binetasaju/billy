import { Linking, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";

export interface UpiPaymentConfig {
  upiId: string;
  receiverName: string;
  amount: number;
  note?: string;
}

export async function openUpiPayment(config: UpiPaymentConfig): Promise<void> {
  const { upiId, receiverName, amount, note } = config;
  
  // Format the URI per UPI specs
  // upi://pay?pa=name@bank&pn=ReceiverName&am=10.00&cu=INR&tn=OptionalNote
  const pa = encodeURIComponent(upiId);
  const pn = encodeURIComponent(receiverName);
  const am = amount.toFixed(2);
  const cu = "INR";
  const tn = note ? `&tn=${encodeURIComponent(note)}` : "";
  
  const url = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=${cu}${tn}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (supported) {
      await Linking.openURL(url);
    } else {
      await Clipboard.setStringAsync(upiId);
      Alert.alert(
        "No UPI App Found",
        "We couldn't find a UPI app installed on your device. The receiver's UPI ID has been copied to your clipboard."
      );
    }
  } catch (err) {
    Alert.alert("Payment Error", "Something went wrong while trying to open a UPI app.");
    console.error("[UPI Error]", err);
  }
}
