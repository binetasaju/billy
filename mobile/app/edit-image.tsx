// ---------------------------------------------------------------------------
// app/edit-image.tsx
//
// Image editor screen.
//
// Features:
//   • Rotate left / right (90° steps)
//   • Crop (drag-handle overlay — corners and interior move)
//   • Reset
//   • Save (expo-image-manipulator)
//
// Crop drag fix:
//   PanResponder gs.dx/gs.dy are CUMULATIVE from gesture start.
//   We capture the crop rect at gesture start and add the cumulative
//   delta to that snapshot — not to the current value each frame.
//   This prevents the compounding-delta shrink bug.
// ---------------------------------------------------------------------------

import { useState, useRef, useCallback } from "react";
import {
  View, Text, Image, Pressable, StyleSheet, ActivityIndicator,
  SafeAreaView, StatusBar, PanResponder, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as ImageManipulator from "expo-image-manipulator";

// Extra top padding for Android where SafeAreaView doesn't account for the
// status bar the same way iOS does.
const ANDROID_STATUS_BAR_H = Platform.OS === "android" ? (StatusBar.currentHeight ?? 24) : 0;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CropRect {
  /** 0–1 fractions of the display canvas */
  x: number; y: number; w: number; h: number;
}

type Handle = "tl" | "tr" | "bl" | "br" | "move";

const MIN_FRAC = 0.08; // minimum 8% of canvas dimension

// ---------------------------------------------------------------------------
// CropOverlay
// ---------------------------------------------------------------------------
function CropOverlay({
  crop,
  onCropChange,
  displayW,
  displayH,
}: {
  crop: CropRect;
  onCropChange: (r: CropRect) => void;
  displayW: number;
  displayH: number;
}) {
  // Snapshot of the crop rect at the START of each gesture.
  // We apply cumulative dx/dy ON TOP of this snapshot each frame.
  const startCrop = useRef<CropRect>(crop);
  const cropRef   = useRef<CropRect>(crop);
  cropRef.current = crop;

  const makePR = (handle: Handle) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        // Capture the current crop at gesture start
        startCrop.current = { ...cropRef.current };
      },
      onPanResponderMove: (_, gs) => {
        // Cumulative delta from gesture start (NOT incremental)
        const dx = gs.dx / displayW;
        const dy = gs.dy / displayH;
        const s  = startCrop.current; // immutable snapshot

        let { x, y, w, h } = s;

        if (handle === "move") {
          x = Math.max(0, Math.min(1 - w, s.x + dx));
          y = Math.max(0, Math.min(1 - h, s.y + dy));
        } else if (handle === "tl") {
          const nx = Math.max(0,     Math.min(s.x + s.w - MIN_FRAC, s.x + dx));
          const ny = Math.max(0,     Math.min(s.y + s.h - MIN_FRAC, s.y + dy));
          w = s.x + s.w - nx;
          h = s.y + s.h - ny;
          x = nx; y = ny;
        } else if (handle === "tr") {
          const ny = Math.max(0,     Math.min(s.y + s.h - MIN_FRAC, s.y + dy));
          h = s.y + s.h - ny;
          y = ny;
          w = Math.max(MIN_FRAC, Math.min(1 - s.x, s.w + dx));
        } else if (handle === "bl") {
          const nx = Math.max(0,     Math.min(s.x + s.w - MIN_FRAC, s.x + dx));
          w = s.x + s.w - nx;
          x = nx;
          h = Math.max(MIN_FRAC, Math.min(1 - s.y, s.h + dy));
        } else if (handle === "br") {
          w = Math.max(MIN_FRAC, Math.min(1 - s.x, s.w + dx));
          h = Math.max(MIN_FRAC, Math.min(1 - s.y, s.h + dy));
        }

        onCropChange({ x, y, w, h });
      },
    });

  // Stable PanResponder refs — created once
  const prTl   = useRef(makePR("tl")).current;
  const prTr   = useRef(makePR("tr")).current;
  const prBl   = useRef(makePR("bl")).current;
  const prBr   = useRef(makePR("br")).current;
  const prMove = useRef(makePR("move")).current;

  const l = crop.x * displayW;
  const t = crop.y * displayH;
  const w = crop.w * displayW;
  const h = crop.h * displayH;
  const HIT = 44; // generous touch target

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Dim outside crop */}
      <View style={[ov.dim, { top: 0,     left: 0, right: 0, height: t }]} />
      <View style={[ov.dim, { top: t + h, left: 0, right: 0, bottom: 0 }]} />
      <View style={[ov.dim, { top: t,     left: 0, width: l, height: h }]} />
      <View style={[ov.dim, { top: t,     left: l + w, right: 0, height: h }]} />

      {/* Crop border + grid (moveable interior) */}
      <View style={[ov.border, { left: l, top: t, width: w, height: h }]} {...prMove.panHandlers}>
        <View style={[ov.grid, { left: "33.3%", top: 0, bottom: 0, width: 1 }]} />
        <View style={[ov.grid, { left: "66.6%", top: 0, bottom: 0, width: 1 }]} />
        <View style={[ov.grid, { top: "33.3%", left: 0, right: 0, height: 1 }]} />
        <View style={[ov.grid, { top: "66.6%", left: 0, right: 0, height: 1 }]} />
      </View>

      {/* Corner handles */}
      {(["tl", "tr", "bl", "br"] as const).map((pos) => {
        const pr = pos === "tl" ? prTl : pos === "tr" ? prTr : pos === "bl" ? prBl : prBr;
        return (
          <View
            key={pos}
            style={[
              ov.handleHit,
              {
                left: pos.includes("l") ? l - HIT / 2 : l + w - HIT / 2,
                top:  pos.includes("t") ? t - HIT / 2 : t + h - HIT / 2,
                width: HIT, height: HIT,
              },
            ]}
            {...pr.panHandlers}
          >
            {/* L-shaped corner indicator */}
            <View style={[ov.cornerH, pos.includes("t") ? { top: HIT/2 - 2 } : { bottom: HIT/2 - 2 }]} />
            <View style={[ov.cornerV, pos.includes("l") ? { left: HIT/2 - 2 } : { right: HIT/2 - 2 }]} />
          </View>
        );
      })}
    </View>
  );
}

const ov = StyleSheet.create({
  dim:      { position: "absolute", backgroundColor: "rgba(0,0,0,0.55)" },
  border:   { position: "absolute", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.9)", overflow: "hidden" },
  grid:     { position: "absolute", backgroundColor: "rgba(255,255,255,0.2)" },
  handleHit:{ position: "absolute", justifyContent: "center", alignItems: "center" },
  cornerH:  { position: "absolute", width: 20, height: 3, backgroundColor: "#fff", borderRadius: 2 },
  cornerV:  { position: "absolute", width: 3, height: 20, backgroundColor: "#fff", borderRadius: 2 },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function EditImageScreen() {
  const { uri }  = useLocalSearchParams<{ uri: string }>();
  const router   = useRouter();

  const [rotation,    setRotation]    = useState(0);
  const [crop,        setCrop]        = useState<CropRect>({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
  const [cropEnabled, setCropEnabled] = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [canvasSize,  setCanvasSize]  = useState({ w: 1, h: 1 });

  const onCanvasLayout = useCallback((e: any) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 0 && height > 0) setCanvasSize({ w: width, h: height });
  }, []);

  const handleRotateLeft  = () => setRotation((r) => (r - 90 + 360) % 360);
  const handleRotateRight = () => setRotation((r) => (r + 90) % 360);
  const handleReset = () => {
    setRotation(0);
    setCrop({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 });
    setCropEnabled(false);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!uri) return;
    setSaving(true);
    try {
      const actions: ImageManipulator.Action[] = [];

      if (rotation !== 0) {
        actions.push({ rotate: rotation });
      }

      if (cropEnabled) {
        // Get real pixel dimensions
        const info = await ImageManipulator.manipulateAsync(uri, [], {
          format: ImageManipulator.SaveFormat.JPEG,
        });
        // After rotation, width/height may swap — account for 90/270 cases
        const rotated = rotation === 90 || rotation === 270;
        const realW = rotated ? info.height : info.width;
        const realH = rotated ? info.width  : info.height;

        actions.push({
          crop: {
            originX: Math.max(0, Math.round(crop.x * realW)),
            originY: Math.max(0, Math.round(crop.y * realH)),
            width:   Math.min(realW, Math.round(crop.w * realW)),
            height:  Math.min(realH, Math.round(crop.h * realH)),
          },
        });
      }

      if (actions.length === 0) {
        router.back();
        return;
      }

      const result = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.85,
        format: ImageManipulator.SaveFormat.JPEG,
      });

      // replace → edit-image is removed from the back stack
      router.replace({ pathname: "/preview", params: { uri: result.uri } });
    } catch (err) {
      console.error("[EditImage] Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1F2937" />

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: ANDROID_STATUS_BAR_H + 14 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Text style={styles.headerBtnText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Edit Image</Text>
        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.75 }]}
          hitSlop={12}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={styles.saveBtnText}>Save</Text>
          }
        </Pressable>
      </View>

      {/* ── Canvas ── */}
      <View style={styles.canvas} onLayout={onCanvasLayout}>
        {uri ? (
          <>
            <Image
              source={{ uri }}
              style={[styles.image, { transform: [{ rotate: `${rotation}deg` }] }]}
              resizeMode="contain"
            />
            {cropEnabled && (
              <CropOverlay
                crop={crop}
                onCropChange={setCrop}
                displayW={canvasSize.w}
                displayH={canvasSize.h}
              />
            )}
          </>
        ) : (
          <Text style={{ color: "#9CA3AF" }}>No image</Text>
        )}
      </View>

      {/* ── Crop hint ── */}
      {cropEnabled && (
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>Drag corners or box to adjust · Tap Crop again to hide</Text>
        </View>
      )}

      {/* ── Toolbar ── */}
      <View style={styles.toolbar}>
        <ToolBtn icon="↺"  label="Rotate L"  onPress={handleRotateLeft} />
        <ToolBtn icon="↻"  label="Rotate R"  onPress={handleRotateRight} />
        <ToolBtn icon="✂️" label="Crop"      onPress={() => setCropEnabled(v => !v)} active={cropEnabled} />
        <ToolBtn icon="⊘"  label="Reset"     onPress={handleReset} danger />
      </View>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// ToolBtn
// ---------------------------------------------------------------------------
function ToolBtn({
  icon, label, onPress, active, danger,
}: {
  icon: string; label: string; onPress: () => void; active?: boolean; danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.toolBtn,
        active  && styles.toolBtnActive,
        danger  && styles.toolBtnDanger,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={styles.toolBtnIcon}>{icon}</Text>
      <Text style={[styles.toolBtnLabel, active && styles.toolBtnLabelActive]}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#111827" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 14,
    backgroundColor: "#1F2937",
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  headerBtn:     { paddingVertical: 6, paddingHorizontal: 4, minWidth: 70 },
  headerBtnText: { fontSize: 15, color: "#D1D5DB", fontWeight: "500" },
  headerTitle:   { fontSize: 17, fontWeight: "700", color: "#F9FAFB" },
  saveBtn: {
    backgroundColor: "#2563EB",
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 8,
    minWidth: 70,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  canvas: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },

  hintBar: {
    paddingVertical: 7,
    alignItems: "center",
    backgroundColor: "#1F2937",
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  hintText: { color: "#6B7280", fontSize: 12 },

  toolbar: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingVertical: 14,
    paddingHorizontal: 8,
    paddingBottom: 20,
    backgroundColor: "#1F2937",
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  toolBtn: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 5,
    minWidth: 68,
    backgroundColor: "#374151",
  },
  toolBtnActive: { backgroundColor: "#1D4ED8" },
  toolBtnDanger: { backgroundColor: "#7F1D1D" },
  toolBtnIcon:   { fontSize: 22, color: "#E5E7EB" },
  toolBtnLabel:  { fontSize: 11, color: "#9CA3AF", fontWeight: "600" },
  toolBtnLabelActive: { color: "#BFDBFE" },
});
