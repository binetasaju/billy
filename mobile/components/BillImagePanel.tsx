// ---------------------------------------------------------------------------
// components/BillImagePanel.tsx
//
// Inline bill image panel on the Review Items screen.
//
// Level 1 — Inline gestures (no modal needed):
//   • Pinch to zoom (1× – 5×)
//   • Pan while zoomed
//   • Double-tap to zoom in / reset
//
// Level 2 — Fullscreen:
//   • Single tap when at 1× zoom → calls onTap() to open FullScreenViewer
//
// Uses @openspacelabs/react-native-zoomable-view (already installed, New Arch safe).
// ---------------------------------------------------------------------------

import React, { useRef, useState } from "react";
import { View, Text, StyleSheet, Image, Pressable, Animated } from "react-native";
import { ReactNativeZoomableView } from "@openspacelabs/react-native-zoomable-view";

interface BillImagePanelProps {
  uri: string;
  height: number;
  onTap: () => void;
}

export default function BillImagePanel({ uri, height, onTap }: BillImagePanelProps) {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [hintVisible, setHintVisible] = useState(true);
  const hintOpacity = useRef(new Animated.Value(1)).current;
  const zoomRef = useRef<any>(null);

  const dismissHint = () => {
    Animated.timing(hintOpacity, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => setHintVisible(false));
  };

  if (hasError) {
    return (
      <View style={[styles.container, { height, justifyContent: "center", alignItems: "center" }]}>
        <Text style={styles.errorText}>Unable to load bill image</Text>
        <Text
          onPress={() => { setHasError(false); setRetryKey((k) => k + 1); }}
          style={styles.retryText}
        >
          Retry
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      <ReactNativeZoomableView
        ref={zoomRef}
        maxZoom={5}
        minZoom={1}
        zoomStep={2}
        initialZoom={1}
        bindToBorders
        doubleTapZoomToCenter
        onSingleTap={() => {
          const zoom = zoomRef.current?.zoomLevel ?? 1;
          if (zoom <= 1.05) onTap();
        }}
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

      {/* Transparent overlay — sits ABOVE the zoomable view only while the hint is visible.
          onPressIn fires immediately on any touch (tap or start of pinch),
          fades the hint out, then removes both itself and the hint from the tree
          so all future touches go directly to the zoomable view. */}
      {hintVisible && (
        <Pressable style={styles.dismissOverlay} onPressIn={dismissHint} />
      )}

      {/* Hint badge */}
      {hintVisible && (
        <Animated.View style={[styles.hint, { opacity: hintOpacity }]} pointerEvents="none">
          <Text style={styles.hintText}>🔍 Pinch to zoom  ·  ⤢ Tap to expand</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111827",
    width: "100%",
    overflow: "hidden",
    position: "relative",
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
  dismissOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // fully transparent — only purpose is to catch the very first touch
  },
  hint: {
    position: "absolute",
    bottom: 10,
    right: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  hintText: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 12,
    fontWeight: "500",
  },
  errorText: {
    color: "#9CA3AF",
    marginBottom: 10,
    fontSize: 14,
  },
  retryText: {
    color: "#fff",
    backgroundColor: "#374151",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: "hidden",
    fontSize: 13,
    fontWeight: "600",
  },
});
