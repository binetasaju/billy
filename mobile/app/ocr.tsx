import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { compressImage, extractTextFromImage } from "../services/ocr";
import { parseBill } from "../services/parseBill";
import { extractBlocksWithVision } from "../services/visionOcr";
import { matchItemsToBlocks, buildBlocksFromRawText } from "../services/matchItems";
import { billStore } from "../services/billStore";
import type { ParsedBill } from "../services/parseBill";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OcrState =
  | "idle"
  | "compressing"
  | "ocr"
  | "parsing"
  | "matching"
  | "success"
  | "error";

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function OcrScreen() {
  const rawUri = useLocalSearchParams<{ uri: string }>().uri;
  const uri = rawUri ? decodeURIComponent(rawUri) : undefined;
  const router = useRouter();

  const [state, setState] = useState<OcrState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [parsedBill, setParsedBill] = useState<ParsedBill | null>(null);
  const [isSlow, setIsSlow] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // -------------------------------------------------------------------------
  // Main pipeline
  // -------------------------------------------------------------------------
  const handleRunOcr = async () => {
    if (!uri) {
      setErrorMessage("No image received. Go back and take a photo.");
      setState("error");
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    setIsSlow(false);

    // 30 second timeout for "taking longer than expected"
    slowTimerRef.current = setTimeout(() => {
      setIsSlow(true);
    }, 30000);

    setState("compressing");
    setParsedBill(null);
    setErrorMessage("");

    try {
      console.time("[PIPELINE] Total");

      // ── Step 1: Verify file ────────────────────────────────────────────────
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error(`File not found: ${uri}\n\nTry retaking the photo.`);
      }
      const originalSizeBytes =
        fileInfo.exists && "size" in fileInfo ? (fileInfo as any).size as number : 0;
      const originalSizeKB = (originalSizeBytes / 1024).toFixed(1);
      console.log("[PIPELINE] Original size:", originalSizeKB, "KB");

      // ── Step 2: Compress ───────────────────────────────────────────────────
      setStatusMessage("Scanning receipt...");
      const compressStart = Date.now();
      const compressed = await compressImage(uri);
      const compressDurationMs = Date.now() - compressStart;
      console.log("[PIPELINE] Original dimensions:", compressed.width, "×", compressed.height);

      // ── Step 3: Read base64 ────────────────────────────────────────────────
      const base64Start = Date.now();
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: "base64" as FileSystem.EncodingType,
      });
      const base64DurationMs = Date.now() - base64Start;
      const compressedSizeKB = ((base64.length * 0.75) / 1024).toFixed(1);
      console.log("[PIPELINE] Original size:", originalSizeKB, "KB");
      console.log("[PIPELINE] Compressed size:", compressedSizeKB, "KB");
      console.log("[PIPELINE] Compression duration:", compressDurationMs, "ms");
      console.log("[PIPELINE] Base64 read duration:", base64DurationMs, "ms");
      console.log(`[PIPELINE] Size reduction: ${originalSizeKB} KB → ${compressedSizeKB} KB`);

      if (!base64 || base64.length === 0) {
        throw new Error("Image read failed. File may be corrupt.");
      }

      // ── Step 4 (parallel): Gemini OCR text + Vision API bounding boxes ─────
      setState("ocr");
      setStatusMessage("Extracting text...");

      // Vision API and Gemini OCR run in parallel to save time.
      // Vision API is optional — if no key is set, it returns null.
      const [rawText, visionResult] = await Promise.all([
        extractTextFromImage(base64, compressed.uri, setStatusMessage, abortControllerRef.current.signal),
        extractBlocksWithVision(base64, abortControllerRef.current.signal),
      ]);

      console.log("[PIPELINE] OCR text length:", rawText.length);
      if (visionResult) {
        console.log("[PIPELINE] Vision API blocks:", visionResult.blocks.length);
      } else {
        console.log("[PIPELINE] Vision API not configured — using line estimates");
      }

      // ── Step 5: Parse raw text into structured JSON ────────────────────────
      setState("parsing");
      setStatusMessage("Analyzing items...");
      const parsed = await parseBill(rawText);
      console.log("[PIPELINE] Parsed:", parsed.items.length, "items");

      // ── Step 6: Match items to OCR blocks (attach bounding boxes) ──────────
      setState("matching");
      setStatusMessage("Analyzing items...");

      // Use Vision blocks if available, otherwise build from raw text lines
      const blocks = visionResult?.blocks ?? buildBlocksFromRawText(rawText);
      const itemsWithBoxes = matchItemsToBlocks(
        parsed.items as any[],
        blocks,
        rawText.split("\n").length
      );

      const enrichedBill = {
        ...parsed,
        items: itemsWithBoxes,
        imageWidth: visionResult?.imageWidth,
        imageHeight: visionResult?.imageHeight,
      };

      console.log("[PIPELINE] Parsed bill:", JSON.stringify(enrichedBill, null, 2));
      console.timeEnd("[PIPELINE] Total");

      billStore.set(enrichedBill, uri, visionResult?.blocks ?? null);
      setParsedBill(enrichedBill);
      setState("success");
    } catch (err: any) {
      if (err.name === "AbortError" || err.message === "OCR cancelled.") {
        console.log("[PIPELINE] Run cancelled.");
        return;
      }

      let message =
        err instanceof Error ? err.message : "Unable to process the receipt right now.\nPlease try again in a few moments.";
      
      const lowerMsg = message.toLowerCase();
      if (
        lowerMsg.includes("503") ||
        lowerMsg.includes("504") ||
        lowerMsg.includes("429") ||
        lowerMsg.includes("unavailable") ||
        lowerMsg.includes("api error")
      ) {
        message = "Unable to process the receipt right now.\nPlease try again in a few moments.";
      }

      console.error("[PIPELINE] Error:", message);
      setErrorMessage(message);
      setState("error");
    } finally {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    }
  };

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  const handleBack = () => router.back();
  const handleRetake = () => router.dismissAll();
  const handleContinue = () => router.push("/review-items");

  // -------------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------------
  const isLoading =
    state === "compressing" ||
    state === "ocr" ||
    state === "parsing" ||
    state === "matching";

  const stepLabel: Record<OcrState, string> = {
    idle: "Tap the button to scan your bill",
    compressing: "Scanning receipt...",
    ocr: "Extracting text...",
    parsing: "Analyzing items...",
    matching: "Analyzing items...",
    success: "Bill scanned successfully",
    error: "",
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Bill</Text>
      <Text style={styles.subtitle}>{stepLabel[state]}</Text>

      {/* Bill image — plain thumbnail, no overlays */}
      <View style={styles.imageContainer}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>No image</Text>
          </View>
        )}
      </View>

      {/* ── Idle / Loading ── */}
      {(state === "idle" || (isLoading && !isSlow)) && (
        <Pressable
          onPress={handleRunOcr}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.button,
            isLoading && styles.buttonDisabled,
            pressed && !isLoading && styles.buttonPressed,
          ]}
        >
          {isLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={[styles.buttonText, { marginLeft: 10, textAlign: "center" }]}>
                {statusMessage || "Working..."}
              </Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Run OCR</Text>
          )}
        </Pressable>
      )}

      {/* ── Slow Connection Timeout ── */}
      {isLoading && isSlow && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>This is taking longer than expected.</Text>
          <View style={styles.errorActions}>
            <Pressable
              onPress={() => setIsSlow(false)}
              style={({ pressed }) => [
                styles.errorButton,
                styles.errorButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.errorButtonSecondaryText}>Keep Waiting</Text>
            </Pressable>
            <Pressable
              onPress={handleRunOcr}
              style={({ pressed }) => [
                styles.errorButton,
                styles.errorButtonPrimary,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Error ── */}
      {state === "error" && (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Failed</Text>
          <Text style={styles.errorMessage}>{errorMessage}</Text>
          <View style={styles.errorActions}>
            <Pressable
              onPress={handleRunOcr}
              style={({ pressed }) => [
                styles.errorButton,
                styles.errorButtonPrimary,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Retry</Text>
            </Pressable>
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.errorButton,
                styles.errorButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.errorButtonSecondaryText}>Go Back</Text>
            </Pressable>
            <Pressable
              onPress={handleRetake}
              style={({ pressed }) => [
                styles.errorButton,
                styles.errorButtonSecondary,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.errorButtonSecondaryText}>Retake Photo</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Success ── */}
      {state === "success" && parsedBill && (
        <View style={styles.successContainer}>
          <Text style={styles.successLabel}>✓ Bill scanned successfully</Text>

          <ScrollView
            style={styles.debugBox}
            contentContainerStyle={{ padding: 12 }}
          >
            <Text style={styles.debugLabel}>Scan Summary</Text>
            {parsedBill.restaurant ? (
              <Text style={styles.debugText}>🏪 {parsedBill.restaurant}</Text>
            ) : null}
            {parsedBill.billNumber ? (
              <Text style={styles.debugText}>📄 Bill #{parsedBill.billNumber}</Text>
            ) : null}
            {parsedBill.date ? (
              <Text style={styles.debugText}>📅 {parsedBill.date}</Text>
            ) : null}
            <Text style={[styles.debugText, { marginTop: 8, fontWeight: "600", marginBottom: 6 }]}>
              {parsedBill.items.length} items found (tap to verify):
            </Text>
            {parsedBill.items.map((item: any, i: number) => (
              <View key={i} style={styles.debugItemRow}>
                <Text style={styles.debugText}>
                  {"• "}
                  {item.name}
                  {item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ""}{" "}
                  — ₹{item.amount ?? item.price}
                  {(item.confidence ?? 1) < 0.8 ? " ⚠️" : ""}
                </Text>
              </View>
            ))}
            {parsedBill.gst ? (
              <Text style={styles.debugText}>GST: ₹{parsedBill.gst}</Text>
            ) : null}
            {parsedBill.serviceCharge ? (
              <Text style={styles.debugText}>
                Service charge: ₹{parsedBill.serviceCharge}
              </Text>
            ) : null}
            <Text style={[styles.debugText, { fontWeight: "700", marginTop: 4 }]}>
              Total: ₹{parsedBill.total}
            </Text>
          </ScrollView>

          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonText}>Review Items →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 14, color: "#6B7280", marginBottom: 20 },
  imageContainer: {
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    marginBottom: 20,
    position: "relative"
  },
  image: { flex: 1, width: "100%" },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { color: "#9CA3AF", fontSize: 14 },
  button: {
    backgroundColor: "#000",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#374151" },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  loadingRow: { flexDirection: "row", alignItems: "center" },
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#991B1B",
    marginBottom: 6,
  },
  errorMessage: {
    fontSize: 13,
    color: "#B91C1C",
    lineHeight: 20,
    marginBottom: 12,
  },
  errorActions: { gap: 8 },
  errorButton: {
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center" as const,
  },
  errorButtonPrimary: { backgroundColor: "#991B1B" },
  errorButtonSecondary: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorButtonSecondaryText: {
    color: "#991B1B",
    fontWeight: "600" as const,
    fontSize: 14,
  },
  successContainer: { flex: 1 },
  successLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#15803D",
    marginBottom: 12,
  },
  debugBox: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 16,
  },
  debugLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  debugText: {
    fontFamily: "monospace",
    fontSize: 12,
    color: "#111827",
    lineHeight: 20,
  },
  debugItemRow: {
    paddingVertical: 4, paddingHorizontal: 4,
    borderRadius: 6, backgroundColor: "#F3F4F6", marginBottom: 4
  }
});
