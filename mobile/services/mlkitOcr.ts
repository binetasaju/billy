import TextRecognition from "@react-native-ml-kit/text-recognition";
import { rebuildReceiptRows } from "./receiptLayout";
import { devLog } from "../utils/devLog";

export async function extractTextWithMLKit(
  imageUri: string
): Promise<string> {
  try {
    const result = await TextRecognition.recognize(imageUri);
    // Re-pair item names with their qty/price columns using line positions;
    // fall back to ML Kit's block-ordered text if positions are missing.
    const rows = rebuildReceiptRows(result.blocks);
    const text = rows ?? result.text;
    devLog("[MLKIT] Row rebuild:", rows ? "used" : "unavailable (plain text)");
    devLog("[MLKIT] OCR Text:\n" + text);
    return text;
  } catch (error: any) {
    console.error("[MLKIT] OCR failed:", error?.message ?? error);

    const errMessage = error?.message || String(error);
    if (
      errMessage.includes("doesn't seem to be linked") ||
      errMessage.includes("Native module cannot be null")
    ) {
      throw new Error(
        "ML Kit OCR is not available in the current build.\n\nPlease rebuild the Android app after installing ML Kit."
      );
    }

    throw new Error(
      "Unable to read this receipt.\n\nPlease try:\n• Better lighting\n• A clearer photo\n• Cropping the receipt"
    );
  }
}
