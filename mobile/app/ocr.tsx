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
import { extractTextWithMLKit } from "../services/mlkitOcr";
import { parseBill } from "../services/parseBill";
import { extractBlocksWithVision } from "../services/visionOcr";
import { matchItemsToBlocks, buildBlocksFromRawText } from "../services/matchItems";
import { billStore } from "../services/billStore";
import { authStore } from "../services/authStore";
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

const BASE_MESSAGES = [
  "Extracting bill information...",
  "Reviewing receipt details...",
  "Preparing your bill summary...",
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function OcrScreen() {
  const rawUri = useLocalSearchParams<{ uri: string }>().uri;
  const uri = rawUri ? decodeURIComponent(rawUri) : undefined;
  const router = useRouter();

  useEffect(() => {
    if (uri) console.log("[OCR] URI:", uri);
  }, [uri]);

  const [state, setState] = useState<OcrState>("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isBillError, setIsBillError] = useState(false);
  const [parsedBill, setParsedBill] = useState<ParsedBill | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  const [messages, setMessages] = useState<string[]>(BASE_MESSAGES);
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  // Auto-navigate on success — no success popup
  useEffect(() => {
    if (state === "success") {
      router.push("/review-items");
    }
  }, [state]);

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
    setIsBillError(false);

    // Randomize messages for this run
    const shuffled = [...BASE_MESSAGES].sort(() => Math.random() - 0.5);
    setMessages(shuffled);
    setLoadingMsgIdx(0);

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

      // ── Step 4 (parallel): ML Kit OCR text + Vision API bounding boxes ─────
      setState("ocr");

      const ocrStart = Date.now();

      // Gemini OCR disabled.
      // ML Kit OCR is now the primary OCR engine.
      // TODO: If OCR quality is poor -> Optional Gemini Enhancement
      const [rawText, visionResult] = await Promise.all([
        // extractTextFromImage(base64, compressed.uri, setStatusMessage, abortControllerRef.current.signal),
        extractTextWithMLKit(compressed.uri),
        extractBlocksWithVision(base64, abortControllerRef.current.signal),
      ]);
      const ocrDuration = Date.now() - ocrStart;

      console.log(`[PIPELINE] OCR duration: ${ocrDuration}ms`);
      console.log("[PIPELINE] OCR text length:", rawText.length);
      if (visionResult) {
        console.log("[PIPELINE] Vision API blocks:", visionResult.blocks.length);
      } else {
        console.log("[PIPELINE] Vision API not configured — using line estimates");
      }

      // ── Step 5: Parse raw text into structured JSON ────────────────────────
      setState("parsing");
      setMessages(["Receipt extracted successfully.\nBuilding bill details..."]);
      setLoadingMsgIdx(0);

      const parsed = await parseBill(rawText);
      console.log("[PIPELINE] Parsed:", parsed.items.length, "items");

      if (parsed.isBill === false) {
        throw new Error("BILL_NOT_DETECTED");
      }

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

      billStore.set(enrichedBill, uri, visionResult?.blocks ?? null, authStore.get().user);
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
      if (message === "BILL_NOT_DETECTED") {
        setIsBillError(true);
        setState("error");
        console.error("[PIPELINE] Non-bill image detected.");
        return;
      } else if (
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
    idle: "Review the receipt below and extract items from the bill.",
    compressing: "Extracting Bill...",
    ocr: "Extracting Bill...",
    parsing: "Extracting Bill...",
    matching: "Extracting Bill...",
    success: "Bill scanned successfully",
    error: "",
  };

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading && !isSlow && messages.length > 0) {
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => {
          if (prev >= messages.length - 1) {
            clearInterval(interval);
            return prev;
          }
          return prev + 1;
        });
      }, 5000);
    } else {
      setLoadingMsgIdx(0);
    }
    return () => clearInterval(interval);
  }, [isLoading, isSlow, messages]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      {/* Title — always "Extract Bill" */}
      <Text style={styles.title}>Extract Bill</Text>
      <Text style={styles.subtitle}>{stepLabel["idle"]}</Text>

      {/* Bill image — always visible */}
      <View style={styles.imageContainer}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>No image</Text>
          </View>
        )}
      </View>



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

      {/* ── Non-bill detected — upload bill prompt ── */}
      {state === "error" && isBillError && (
        <View style={styles.notBillBox}>
          <Text style={styles.notBillIcon}>🧾</Text>
          <Text style={styles.notBillTitle}>Not a Bill</Text>
          <Text style={styles.notBillMessage}>
            The image you uploaded doesn't look like a bill.{"\n"}Please upload a clear photo of your bill or receipt.
          </Text>
          <Pressable
            onPress={handleRetake}
            style={({ pressed }) => [
              styles.notBillButton,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.notBillButtonText}>Upload a Bill</Text>
          </Pressable>
        </View>
      )}

      {/* ── Generic Error ── */}
      {state === "error" && !isBillError && (
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

      {/* ── Extract Bill button — hidden when non-bill error is shown ── */}
      {state !== "success" && !isBillError && (
        <Pressable
          onPress={handleRunOcr}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.button,
            isLoading && styles.buttonLoading,
            pressed && !isLoading && styles.buttonPressed,
          ]}
        >
          {isLoading && !isSlow ? (
            <View style={styles.buttonInner}>
              <ActivityIndicator color="#FFFFFF" size="small" />
              <Text style={styles.buttonLoadingText}>
                {messages[loadingMsgIdx]}
              </Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Extract Bill</Text>
          )}
        </Pressable>
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
  buttonLoading: { backgroundColor: "#374151" },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  buttonInner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingHorizontal: 8,
  },
  buttonLoadingText: {
    color: "#fff",
    fontWeight: "600" as const,
    fontSize: 15,
    textAlign: "center" as const,
    flex: 1,
  },
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
  // ── Not-a-bill card ────────────────────────────────────────────────────────
  notBillBox: {
    backgroundColor: "#FFFBEB",
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: "#FDE68A",
    alignItems: "center" as const,
    gap: 8,
  },
  notBillIcon: {
    fontSize: 48,
    marginBottom: 4,
  },
  notBillTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
    color: "#92400E",
    textAlign: "center" as const,
  },
  notBillMessage: {
    fontSize: 14,
    color: "#78350F",
    lineHeight: 22,
    textAlign: "center" as const,
    marginBottom: 8,
  },
  notBillButton: {
    backgroundColor: "#D97706",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    alignItems: "center" as const,
    width: "100%" as any,
  },
  notBillButtonText: {
    color: "#FFFFFF",
    fontWeight: "700" as const,
    fontSize: 16,
    letterSpacing: 0.3,
  },
  successContainer: { flex: 1 },
  successLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#15803D",
    marginBottom: 4,
  },
  successHelper: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 16,
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
