// ---------------------------------------------------------------------------
// services/documentScanner.ts — Google ML Kit Document Scanner (Android)
//
// The scanner finds the receipt's edges, fixes the perspective and cleans the
// image up on the phone (free, offline). It needs a native rebuild; until then
// — or on a phone without Google Play services — `scanReceipt` returns
// "unavailable" and the caller uses the normal camera instead.
// ---------------------------------------------------------------------------
import { Platform, TurboModuleRegistry } from "react-native";

export type ScanResult =
  | { status: "success"; uri: string }
  | { status: "cancel" }
  | { status: "unavailable" };

/** True when this build includes the scanner's native module. */
export function documentScannerAvailable(): boolean {
  // The package's own import throws when the module isn't linked, so check first.
  return Platform.OS === "android" && TurboModuleRegistry.get("DocumentScanner") != null;
}

export async function scanReceipt(): Promise<ScanResult> {
  if (!documentScannerAvailable()) return { status: "unavailable" };
  try {
    // Required lazily: importing it in a build without the module would crash.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const DocumentScanner = require("react-native-document-scanner-plugin").default;
    const res = await DocumentScanner.scanDocument({ maxNumDocuments: 1, croppedImageQuality: 90 });
    const uri: string | undefined = res?.scannedImages?.[0];
    if (res?.status === "success" && uri) return { status: "success", uri };
    return { status: "cancel" };
  } catch (e) {
    // e.g. Google Play services missing or the scanner couldn't download.
    console.warn("[Scanner] unavailable:", e);
    return { status: "unavailable" };
  }
}
