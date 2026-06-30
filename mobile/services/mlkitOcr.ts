import { NativeModules } from "react-native";
import TextRecognition from "@react-native-ml-kit/text-recognition";

console.log("[MLKIT] Module loaded");
console.log("[MLKIT] Package version: 2.0.0");

// Accurate native-module detection — TextRecognition (the JS export) is always
// a plain object, so checking it directly is a false positive.
// NativeModules.TextRecognition is only non-null when the native side is linked.
console.log(
  "[MLKIT] NativeModules.TextRecognition:",
  NativeModules.TextRecognition
);

if (NativeModules.TextRecognition != null) {
  console.log("[MLKIT] Native module FOUND");
} else {
  console.log("[MLKIT] Native module MISSING");
}

export async function extractTextWithMLKit(
  imageUri: string
): Promise<string> {
  console.log("[MLKIT] Starting OCR");
  console.log("[MLKIT] URI:", imageUri);

  // Pre-call diagnostic — confirms native module presence immediately before
  // the call that would throw if it is missing.
  console.log(
    "[MLKIT] Native module value:",
    NativeModules.TextRecognition
  );

  try {
    const result = await TextRecognition.recognize(imageUri);
    const text = result.text;
    console.log("[MLKIT] OCR success");
    console.log("[MLKIT] Final text length:", text.length);
    console.log("[MLKIT] OCR Text:");
    console.log(text);
    return text;
  } catch (error: any) {
    console.error("[MLKIT] Full error:", error);
    console.error("[MLKIT] Message:", error?.message);
    console.error("[MLKIT] Stack:", error?.stack);

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
