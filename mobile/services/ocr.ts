// ---------------------------------------------------------------------------
// services/ocr.ts — prepare a receipt photo for reading
//
// Compression: max 1200px wide, JPEG quality 0.8 — small enough to send to
// Gemini with the bill text (services/parseBill.ts), sharp enough to read.
// Text itself is read on the phone by ML Kit (services/mlkitOcr.ts).
// ---------------------------------------------------------------------------

import * as ImageManipulator from "expo-image-manipulator";
import { devLog, devTime, devTimeEnd } from "../utils/devLog";

export async function compressImage(uri: string): Promise<{
  uri: string;
  width: number;
  height: number;
}> {
  devTime("[OCR] compress");

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  devTimeEnd("[OCR] compress");
  devLog("[OCR] Compressed:", `${result.width}×${result.height}`);

  return { uri: result.uri, width: result.width, height: result.height };
}
