// ---------------------------------------------------------------------------
// app/preview.tsx
//
// Preview screen — shown after camera or gallery pick.
//
// Buttons:
//   [ Edit Image ]  → opens /edit-image
//   [ Continue ]    → starts OCR pipeline at /ocr
//
// When the user returns from /edit-image, the URI param is updated
// by edit-image via router.replace, so this screen always shows the
// latest (possibly edited) image.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, Dimensions, ActivityIndicator } from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { autoCropReceipt } from "../services/optimizer";
import { extractBill, ExtractionError, type ExtractionStage } from "../services/billExtraction";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";

const { height: SCREEN_H } = Dimensions.get("window");
const IMAGE_MAX_H = Math.round(SCREEN_H * 0.55);

export default function PreviewScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router  = useRouter();
  const [autoCropping, setAutoCropping] = useState(false);
  // Continue → "Extracting bill…" on the button → "Building bill details…" screen → Review
  const [stage, setStage] = useState<ExtractionStage | null>(null);
  const [slow, setSlow] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = stage !== null || autoCropping;

  useEffect(() => () => {
    abortRef.current?.abort();
    if (slowTimer.current) clearTimeout(slowTimer.current);
  }, []);

  // AI auto-crop costs one Gemini request, so it only runs when asked.
  const handleAutoCrop = async () => {
    if (!uri || autoCropping) return;
    setAutoCropping(true);
    try {
      const result = await autoCropReceipt(uri);
      if (result.status === "cropped") {
        router.setParams({ uri: result.uri });
      } else {
        appAlert.alert("Auto-crop", result.message);
      }
    } finally {
      setAutoCropping(false);
    }
  };

  useEffect(() => {
    if (uri) console.log("[Preview] URI:", uri);
  }, [uri]);

  const handleRetake = () => {
    // Dismiss the entire stack — return to Home to start over.
    router.dismissAll();
  };

  const handleEditImage = () => {
    // Open the image editor. Editor will replace this screen with an updated URI.
    router.push({ pathname: "/edit-image", params: { uri } });
  };

  const stopExtracting = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current);
    setSlow(false);
    setStage(null);
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    stopExtracting();
  };

  const handleContinue = async () => {
    if (!uri || stage) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSlow(false);
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => setSlow(true), 30000);
    try {
      await extractBill(uri, { signal: controller.signal, onStage: setStage });
      if (controller.signal.aborted) return;
      router.push("/review-items");
      // Coming back from Review shows the photo again, ready to retry.
      setTimeout(stopExtracting, 600);
    } catch (e: any) {
      if (e?.name === "AbortError" || controller.signal.aborted) return;
      stopExtracting();
      if (e instanceof ExtractionError && e.notABill) {
        appAlert.alert(
          "This doesn\u2019t look like a bill",
          "Take a clearer photo of the receipt, or choose another one.",
          [
            { text: "OK", style: "cancel" },
            { text: "Retake", onPress: handleRetake },
          ]
        );
      } else {
        appAlert.alert(
          "Couldn\u2019t read the receipt",
          e instanceof Error ? e.message : "Please try again.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Try again", onPress: () => void handleContinue() },
          ]
        );
      }
    }
  };

  // After the text is read: its own loading screen while the bill is built.
  if (stage === "building") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.buildingScreen}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.buildingTitle}>Building bill details…</Text>
          <Text style={styles.buildingSub}>Finding items, prices, taxes and the total.{"\n"}This takes a few seconds.</Text>
          {slow && (
            <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancelLink}>
              <Text style={styles.slowText}>Taking longer than usual · <Text style={styles.cancelText}>Cancel</Text></Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <Text style={styles.title}>Preview</Text>

      {/* Image */}
      <View style={styles.imageContainer}>
        {uri ? (
          <Image source={{ uri }} style={styles.image} resizeMode="contain" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>No image selected</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {/* Retake — slim tertiary link above the main buttons */}
        <Pressable
          onPress={handleRetake}
          disabled={busy}
          style={({ pressed }) => [styles.retakeBtn, (pressed || busy) && { opacity: 0.6 }]}
        >
          <Text style={styles.retakeBtnText}>← Retake / Choose Again</Text>
        </Pressable>

        {/* Crop tools — side by side, same size */}
        <View style={styles.cropRow}>
          <Pressable
            onPress={handleEditImage}
            disabled={busy}
            style={({ pressed }) => [styles.button, styles.buttonSecondary, (pressed || busy) && styles.buttonPressed]}
            accessibilityRole="button"
          >
            <View style={styles.btnInner}>
              <Ionicons name="crop-outline" size={18} color={C.ink} />
              <Text style={styles.buttonTextSecondary}>Adjust Crop</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={handleAutoCrop}
            disabled={busy}
            style={({ pressed }) => [
              styles.button,
              styles.buttonAi,
              (pressed || autoCropping) && styles.buttonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Crop automatically with AI"
          >
            <View style={styles.btnInner}>
              {autoCropping
                ? <ActivityIndicator size="small" color={C.primary} />
                : <Ionicons name="sparkles" size={17} color={C.primary} />}
              <Text style={styles.buttonTextAi}>{autoCropping ? "Finding…" : "AI Crop"}</Text>
            </View>
          </Pressable>
        </View>

        {/* Main action — full width */}
        <Pressable
          onPress={() => void handleContinue()}
          disabled={busy}
          style={({ pressed }) => [
            styles.continueBtn,
            stage === "reading" && styles.continueBusy,
            (pressed || autoCropping) && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={stage === "reading" ? "Extracting bill" : "Continue"}
        >
          {stage === "reading" ? (
            <View style={styles.btnInner}>
              <ActivityIndicator size="small" color={C.white} />
              <Text style={styles.buttonTextPrimary}>Extracting bill…</Text>
            </View>
          ) : (
            <Text style={styles.buttonTextPrimary}>Continue →</Text>
          )}
        </Pressable>
        {stage === "reading" && slow && (
          <Pressable onPress={handleCancel} hitSlop={8} style={styles.cancelLink}>
            <Text style={styles.slowText}>Taking longer than usual · <Text style={styles.cancelText}>Cancel</Text></Text>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  container: {
    flex: 1,
    backgroundColor: C.bg,
    padding: 24,
    paddingTop: 20,
  },
  title: {
    ...T.largeTitle,
    color: C.ink,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 12,
    color: C.textMuted,
    marginBottom: 24,
  },
  imageContainer: {
    width: "100%",
    height: IMAGE_MAX_H,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#000000",
    marginBottom: 14,
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { color: C.textSubtle, fontSize: 14 },

  actions: { gap: 12 },
  retakeBtn: { alignItems: "center", paddingVertical: 6 },
  retakeBtnText: { fontSize: 12, color: C.textMuted, fontWeight: "500" },

  btnInner: { flexDirection: "row", alignItems: "center", gap: 7 },
  cropRow: { flexDirection: "row", gap: 12 },
  button: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonAi: { backgroundColor: C.primarySoft, borderWidth: 1.5, borderColor: C.primary },
  buttonTextAi: { color: C.primary, fontWeight: "700", fontSize: 14 },
  continueBtn: {
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
  buttonSecondary: {
    backgroundColor: C.glassStrong,
    borderWidth: 1.5,
    borderColor: C.glassBorder,
  },
  buttonPressed: { opacity: 0.75 },
  continueBusy: { backgroundColor: C.text },
  cancelLink: { alignItems: "center", paddingVertical: 4 },
  slowText: { fontSize: 12, color: C.textMuted, textAlign: "center", marginTop: 8 },
  cancelText: { color: C.danger, fontWeight: "700" },
  // "Building bill details" loading screen (centred column)
  buildingScreen: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", paddingBottom: 40 },
  buildingTitle: { fontSize: 18, fontWeight: "700", color: C.ink, textAlign: "center", marginTop: 20 },
  buildingSub: { fontSize: 13, color: C.textMuted, textAlign: "center", marginTop: 8, lineHeight: 19, maxWidth: 280 },
  buttonTextPrimary: { color: C.white, fontWeight: "700", fontSize: 15 },
  buttonTextSecondary: { color: C.ink, fontWeight: "600", fontSize: 14 },
});
