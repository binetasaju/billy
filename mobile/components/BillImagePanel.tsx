// ---------------------------------------------------------------------------
// components/BillImagePanel.tsx
//
// Clean bill image thumbnail shown on the Review Items screen.
// No bounding boxes. No gestures. Tap to open full-screen viewer.
// ---------------------------------------------------------------------------

import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Image } from "react-native";

interface BillImagePanelProps {
  uri: string;
  height: number;
  onTap: () => void;
}

export default function BillImagePanel({ uri, height, onTap }: BillImagePanelProps) {
  const [hasError, setHasError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  if (hasError) {
    return (
      <View style={[styles.container, { height, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: "#9CA3AF", marginBottom: 10 }}>Unable to load bill image</Text>
        <Pressable onPress={() => { setHasError(false); setRetryKey(k => k + 1); }} style={{ padding: 10, backgroundColor: "#374151", borderRadius: 8 }}>
          <Text style={{ color: "white" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onTap}
      style={[styles.container, { height }]}
      accessibilityRole="imagebutton"
      accessibilityLabel="Bill image — tap to expand"
    >
      <Image
        key={retryKey}
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
        onLoad={() => console.log("[BillImage] Loaded")}
        onError={(e) => {
          console.log("[BillImage] Error:", e.nativeEvent);
          setHasError(true);
        }}
      />

      {/* Tap hint badge */}
      <View style={styles.hint} pointerEvents="none">
        <Text style={styles.hintText}>⤢  Tap to expand</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#111827",
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
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
});
