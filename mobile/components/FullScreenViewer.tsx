// ---------------------------------------------------------------------------
// components/FullScreenViewer.tsx
//
// Full-screen bill image viewer.
// Supports: pinch-to-zoom, double-tap zoom, pan when zoomed, close button.
// No bounding boxes. No item overlays. Just the image.
// ---------------------------------------------------------------------------

import React, { useEffect } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, Dimensions, SafeAreaView,
} from "react-native";
import { Image } from "react-native";
import { GestureDetector, Gesture, GestureHandlerRootView } from "react-native-gesture-handler";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, clamp, runOnJS,
} from "react-native-reanimated";

const { width: SW, height: SH } = Dimensions.get("window");

interface FullScreenViewerProps {
  uri: string;
  visible: boolean;
  onClose: () => void;
}

export default function FullScreenViewer({ uri, visible, onClose }: FullScreenViewerProps) {
  const scale      = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx         = useSharedValue(0);
  const ty         = useSharedValue(0);
  const savedTx    = useSharedValue(0);
  const savedTy    = useSharedValue(0);

  // Reset zoom whenever the modal opens
  useEffect(() => {
    if (visible) {
      scale.value      = 1;
      savedScale.value = 1;
      tx.value         = 0;
      ty.value         = 0;
      savedTx.value    = 0;
      savedTy.value    = 0;
    }
  }, [visible]);

  function resetZoom() {
    scale.value      = withSpring(1, { damping: 20 });
    savedScale.value = 1;
    tx.value         = withSpring(0, { damping: 20 });
    ty.value         = withSpring(0, { damping: 20 });
    savedTx.value    = 0;
    savedTy.value    = 0;
  }

  // ── Gestures ──────────────────────────────────────────────────────────────

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd((e) => {
      if (scale.value > 1.5) {
        runOnJS(resetZoom)();
      } else {
        const targetScale = 3;
        const targetTx    = (SW / 2 - e.x) * (targetScale - 1);
        const targetTy    = (SH / 2 - e.y) * (targetScale - 1);
        scale.value      = withSpring(targetScale);
        tx.value         = withSpring(targetTx);
        ty.value         = withSpring(targetTy);
        savedScale.value = targetScale;
        savedTx.value    = targetTx;
        savedTy.value    = targetTy;
      }
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(savedScale.value * e.scale, 1, 6);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value < 1.05) { runOnJS(resetZoom)(); }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        const mx = (SW * (savedScale.value - 1)) / 2;
        const my = (SH * (savedScale.value - 1)) / 2;
        tx.value = clamp(savedTx.value + e.translationX, -mx, mx);
        ty.value = clamp(savedTy.value + e.translationY, -my, my);
      }
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const composed = Gesture.Simultaneous(pinch, pan);
  const gestures = Gesture.Exclusive(doubleTap, composed);

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.root}>
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
          <GestureDetector gesture={gestures}>
            <Animated.View style={[styles.imageContainer, imgStyle]}>
              <Image
                source={{ uri }}
                style={styles.image}
                resizeMode="contain"
              />
            </Animated.View>
          </GestureDetector>

          {/* Zoom hint — disappears on first zoom */}
          <View style={styles.footer} pointerEvents="none">
            <Text style={styles.footerText}>Pinch to zoom  ·  Double-tap to zoom  ·  Drag to pan</Text>
          </View>

        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: "#000" },
  safeArea:  { flex: 1 },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: "rgba(0,0,0,0.85)",
    zIndex: 10,
  },
  headerTitle: { color: "#fff", fontSize: 17, fontWeight: "600" },
  closeBtn: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    backgroundColor: "#374151",
    borderRadius: 10,
  },
  closeBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },

  imageContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  image: { width: SW, height: SH - 120, resizeMode: "contain" },

  footer: {
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  footerText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },
});
