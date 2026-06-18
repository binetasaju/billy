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

import { useEffect } from "react";
import { View, Text, Image, Pressable, StyleSheet, SafeAreaView, Dimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

const { height: SCREEN_H } = Dimensions.get("window");
const IMAGE_MAX_H = Math.round(SCREEN_H * 0.55);

export default function PreviewScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router  = useRouter();

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

  const handleContinue = () => {
    router.push({ pathname: "/ocr", params: { uri } });
  };

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
          style={({ pressed }) => [styles.retakeBtn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.retakeBtnText}>← Retake / Choose Again</Text>
        </Pressable>

        <View style={styles.mainButtons}>
          <Pressable
            onPress={handleEditImage}
            style={({ pressed }) => [
              styles.button,
              styles.buttonSecondary,
              pressed && styles.buttonPressed,
            ]}
          >
            <View style={styles.btnInner}>
              <Ionicons name="crop-outline" size={18} color="#111827" />
              <Text style={styles.buttonTextSecondary}>Crop & Edit</Text>
            </View>
          </Pressable>

          <Pressable
            onPress={handleContinue}
            style={({ pressed }) => [
              styles.button,
              styles.buttonPrimary,
              pressed && styles.buttonPressed,
            ]}
          >
            <Text style={styles.buttonTextPrimary}>Continue →</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB", padding: 24, paddingTop: 20 },
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 24,
    paddingTop: 20,
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
    marginBottom: 24,
  },
  imageContainer: {
    width: "100%",
    height: IMAGE_MAX_H,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    marginBottom: 14,
  },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  imagePlaceholderText: { color: "#9CA3AF", fontSize: 16 },

  actions: { gap: 10 },
  retakeBtn: { alignItems: "center", paddingVertical: 6 },
  retakeBtnText: { fontSize: 14, color: "#6B7280", fontWeight: "500" },

  btnInner: { flexDirection: "row", alignItems: "center", gap: 7 },
  mainButtons: { flexDirection: "row", gap: 12 },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonPrimary: { backgroundColor: "#000000" },
  buttonSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  buttonPressed: { opacity: 0.75 },
  buttonTextPrimary: { color: "#FFFFFF", fontWeight: "600", fontSize: 16 },
  buttonTextSecondary: { color: "#111827", fontWeight: "600", fontSize: 16 },
});
