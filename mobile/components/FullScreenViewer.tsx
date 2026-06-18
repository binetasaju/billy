// ---------------------------------------------------------------------------
// components/FullScreenViewer.tsx
//
// Full-screen bill image viewer.
// Supports: pinch-to-zoom, double-tap zoom, pan when zoomed, close button.
// No bounding boxes. No item overlays. Just the image.
// ---------------------------------------------------------------------------

import React, { useState, useEffect } from "react";
import {
  View, Text, Pressable, StyleSheet, Modal, SafeAreaView, Image
} from "react-native";
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

interface FullScreenViewerProps {
  uri: string;
  visible: boolean;
  onClose: () => void;
}

export default function FullScreenViewer({ uri, visible, onClose }: FullScreenViewerProps) {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      console.log("[FullScreen] URI:", uri);
      setHasError(false);
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  }, [uri, visible, retryKey]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 5));
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onStart(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        savedScale.value = 1;
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withTiming(2.5);
        savedScale.value = 2.5;
      }
    });

  const composed = Gesture.Simultaneous(pinchGesture, panGesture, doubleTapGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
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
                <Pressable onPress={() => setRetryKey(k => k + 1)} style={styles.retryBtn}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </Pressable>
              </View>
            ) : (
              <GestureDetector gesture={composed}>
                <Animated.View style={[styles.canvas, animatedStyle]}>
                  <Image
                    key={retryKey}
                    source={{ uri }}
                    style={styles.image}
                    resizeMode="contain"
                    onLoad={() => console.log("[FullScreen] Image loaded")}
                    onError={(e) => {
                      console.log("[FullScreen] Image error", e.nativeEvent);
                      setHasError(true);
                    }}
                  />
                </Animated.View>
              </GestureDetector>
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
    overflow: "hidden",
  },
  canvas: {
    flex: 1,
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  image: { width: "100%", height: "100%" },

  footer: {
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  footerText: { color: "rgba(255,255,255,0.6)", fontSize: 12 },

  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#9CA3AF',
    fontSize: 16,
    marginBottom: 16,
  },
  retryBtn: {
    backgroundColor: '#374151',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});
