import { useState } from "react";
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
import { billStore } from "../services/billStore";
import type { ParsedBill } from "../services/parseBill";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OcrState = "idle" | "compressing" | "ocr" | "parsing" | "success" | "error";

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

  // -------------------------------------------------------------------------
  // Main OCR + Parse pipeline
  // -------------------------------------------------------------------------
  const handleRunOcr = async () => {
    if (!uri) {
      setErrorMessage("No image received. Go back and take a photo.");
      setState("error");
      return;
    }

    setState("compressing");
    setParsedBill(null);
    setErrorMessage("");

    try {
      console.time("[PIPELINE] Total");

      // ── Step 1: Verify file ──────────────────────────────────────────────
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        throw new Error(`File not found at: ${uri}\n\nTry retaking the photo.`);
      }

      const originalSizeKB =
        fileInfo.exists && "size" in fileInfo
          ? (fileInfo.size / 1024).toFixed(1)
          : "?";
      console.log("[PIPELINE] Original file size:", originalSizeKB, "KB");

      // ── Step 2: Compress image ───────────────────────────────────────────
      setStatusMessage("Compressing image...");
      const compressed = await compressImage(uri);

      // ── Step 3: Read compressed image as base64 ──────────────────────────
      setStatusMessage("Reading image...");
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: "base64" as FileSystem.EncodingType,
      });

      const compressedSizeKB = ((base64.length * 0.75) / 1024).toFixed(1);
      console.log(
        "[PIPELINE] Size:",
        originalSizeKB,
        "KB →",
        compressedSizeKB,
        "KB (compressed)"
      );

      if (!base64 || base64.length === 0) {
        throw new Error("Image read failed. File may be corrupt.");
      }

      // ── Step 4: OCR — Gemini Vision reads all text from the bill ──────────
      setState("ocr");
      setStatusMessage("Reading bill text...");

      const rawText = await extractTextFromImage(
        base64,
        compressed.uri,
        setStatusMessage
      );

      console.log("[PIPELINE] Raw OCR text length:", rawText.length);
      console.log("[PIPELINE] Raw OCR text (first 800):", rawText.substring(0, 800));

      // ── Step 5: Parse — structure the raw text into JSON ─────────────────
      setState("parsing");
      setStatusMessage("Structuring bill data...");

      const parsed = await parseBill(rawText);

      console.log("[PIPELINE] Parsed bill:", JSON.stringify(parsed, null, 2));
      console.timeEnd("[PIPELINE] Total");

      // Store in memory — avoids Expo Router URL param size limit
      billStore.set(parsed);
      setParsedBill(parsed);

      setState("success");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "OCR failed. Please try again.";
      console.error("[PIPELINE] Error:", message);
      setErrorMessage(message);
      setState("error");
    }
  };

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------
  const handleBack = () => router.back();
  const handleRetake = () => router.dismissAll();
  const handleContinue = () => router.push("/review-items");

  // -------------------------------------------------------------------------
  // Derived state for UI
  // -------------------------------------------------------------------------
  const isLoading = state === "compressing" || state === "ocr" || state === "parsing";

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Bill</Text>
      <Text style={styles.subtitle}>
        {isLoading ? statusMessage : "Tap the button to extract your bill"}
      </Text>

      {/* Bill image thumbnail */}
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
      {(state === "idle" || isLoading) && (
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
              <Text style={[styles.buttonText, { marginLeft: 10 }]}>
                {statusMessage || "Working..."}
              </Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Run OCR</Text>
          )}
        </Pressable>
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

          {/* Debug summary — shows what Gemini found */}
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
            <Text style={[styles.debugText, { marginTop: 8, fontWeight: "600" }]}>
              {parsedBill.items.length} items found:
            </Text>
            {parsedBill.items.map((item, i) => (
              <Text key={i} style={styles.debugText}>
                • {item.name}{item.quantity && item.quantity > 1 ? ` ×${item.quantity}` : ""} — ₹{item.price}
              </Text>
            ))}
            {parsedBill.gst ? (
              <Text style={styles.debugText}>GST: ₹{parsedBill.gst}</Text>
            ) : null}
            {parsedBill.serviceCharge ? (
              <Text style={styles.debugText}>Service charge: ₹{parsedBill.serviceCharge}</Text>
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
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 20,
  },
  imageContainer: {
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    marginBottom: 20,
  },
  image: { flex: 1, width: "100%" },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { color: "#9CA3AF", fontSize: 14 },

  button: {
    backgroundColor: "#000000",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: { backgroundColor: "#374151" },
  buttonPressed: { opacity: 0.75 },
  buttonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 16 },
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
    backgroundColor: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
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
});
