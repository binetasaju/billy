// ---------------------------------------------------------------------------
// components/FullScreenViewer.tsx
//
// Full-screen bill image viewer.
// Pinch zoom, pan while zoomed, double-tap zoom — all handled by
// @openspacelabs/react-native-zoomable-view (New Architecture compatible).
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, SafeAreaView, Image,
} from "react-native";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";

interface FullScreenViewerProps {
  uri: string;
  visible: boolean;
  onClose: () => void;
}

export default function FullScreenViewer({ uri, visible, onClose }: FullScreenViewerProps) {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const handleRetry = () => {
    setHasError(false);
    setRetryKey((k) => k + 1);
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <SafeAreaView style={styles.safeArea}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Bill Image</Text>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
              accessibilityRole="button"
              accessibilityLabel="Close full-screen viewer"
            >
              <Text style={styles.closeBtnText}>✕  Close</Text>
            </Pressable>
          </View>

          {/* Image canvas */}
          <View style={styles.imageContainer}>
            {hasError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Could not load image.</Text>
                <Pressable onPress={handleRetry} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <ReactNativeZoomableView
                maxZoom={5}
                minZoom={1}
                zoomStep={2}
                initialZoom={1}
                bindToBorders
                doubleTapZoomToCenter
                style={styles.zoomable}
              >
                <Image
                  key={retryKey}
                  source={{ uri }}
                  style={styles.image}
                  resizeMode="contain"
                  onError={() => setHasError(true)}
                />
              </ReactNativeZoomableView>
            )}
          </View>

          {/* Zoom hint */}
          <View style={styles.footer} pointerEvents="none">
            <Text style={styles.footerText}>Pinch to zoom  ·  Double-tap to zoom  ·  Drag to pan</Text>
          </View>

        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: "#000" },
  safeArea: { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 10,
  },
  headerTitle:  { color: "#fff", fontSize: 17, fontWeight: "600" },
  closeBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: "#374151",
    borderRadius: 10,
  },
  closeBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  imageContainer: {
    flex: 1,
    backgroundColor: "#000",
    overflow: "hidden",
  },
  zoomable: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  image: {
    width: "100%",
    height: "100%",
  },

  footer: {
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  footerText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: {
    color: "#9CA3AF",
    fontSize: 16,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: "#374151",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: "#fff", fontWeight: "600" },
});
