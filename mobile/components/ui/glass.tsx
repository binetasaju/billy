// ---------------------------------------------------------------------------
// components/ui/glass.tsx — Billy's glassmorphism design system
//
//   GlassScreen      screen wrapper: soft emerald / mint / grey glows behind
//                    the content (drop-in replacement for SafeAreaView)
//   GlassCard        translucent white card with a bright edge
//   GlassButton      primary (solid indigo) or glass (translucent) button
//   GlassTextInput   translucent input
//
// No native modules: works with a Metro reload. The glows are built from
// stacked translucent circles (a soft fake blur). To switch to real blur
// later, install expo-blur and wrap GlassCard's content in <BlurView> here —
// screens don't need to change.
// ---------------------------------------------------------------------------
import React from "react";
import {
  View, Text, Pressable, TextInput, StyleSheet,
  type ViewProps, type PressableProps, type TextInputProps, type StyleProp, type ViewStyle,
} from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { C } from "@/constants/colors";

// ── Background glows ────────────────────────────────────────────────────────

/** A soft radial glow: concentric circles, each fainter than the last. */
function Glow({ color, size, top, left, right, bottom, strength = 0.22 }: {
  color: string; size: number; strength?: number;
  top?: number; left?: number; right?: number; bottom?: number;
}) {
  const RINGS = 7;
  return (
    <View pointerEvents="none" style={[s.glowBox, { width: size, height: size, top, left, right, bottom }]}>
      {Array.from({ length: RINGS }, (_, i) => {
        const d = size * (1 - i / RINGS);
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              width: d,
              height: d,
              borderRadius: d / 2,
              backgroundColor: color,
              opacity: strength / RINGS * 1.6,
            }}
          />
        );
      })}
    </View>
  );
}

export function GlassBackground() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: C.glassBase }]} />
      <Glow color={C.glowPrimary} size={520} top={-200} left={-180} strength={0.22} />
      <Glow color={C.glowTertiary} size={420} top={220} right={-220} strength={0.30} />
      <Glow color={C.glowSecondary} size={480} bottom={-200} left={-80} strength={0.24} />
    </View>
  );
}

type ScreenProps = ViewProps & { edges?: readonly Edge[] };

/**
 * Drop-in replacement for SafeAreaView that paints the glass background.
 * Each screen stays opaque, so navigation animations look clean.
 */
export function GlassScreen({ style, children, edges, ...rest }: ScreenProps) {
  return (
    <View style={s.screen}>
      <GlassBackground />
      <SafeAreaView edges={edges} {...rest} style={[style, s.transparent]}>
        {children}
      </SafeAreaView>
    </View>
  );
}

// ── Building blocks ─────────────────────────────────────────────────────────

export function GlassCard({ style, ...rest }: ViewProps) {
  return <View {...rest} style={[s.card, style]} />;
}

type ButtonProps = Omit<PressableProps, "style"> & {
  label: string;
  variant?: "primary" | "glass";
  style?: StyleProp<ViewStyle>;
};

export function GlassButton({ label, variant = "primary", disabled, style, ...rest }: ButtonProps) {
  return (
    <Pressable
      {...rest}
      disabled={disabled}
      style={({ pressed }) => [
        s.button,
        variant === "primary" ? s.buttonPrimary : s.buttonGlass,
        disabled && s.buttonDisabled,
        pressed && !disabled && s.pressed,
        style,
      ]}
    >
      <Text style={variant === "primary" ? s.buttonPrimaryText : s.buttonGlassText}>{label}</Text>
    </Pressable>
  );
}

export function GlassTextInput({ style, ...rest }: TextInputProps) {
  return <TextInput placeholderTextColor={C.textSubtle} {...rest} style={[s.input, style]} />;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.glassBase, overflow: "hidden" },
  transparent: { backgroundColor: "transparent" },
  glowBox: { position: "absolute", alignItems: "center", justifyContent: "center" },

  card: {
    backgroundColor: C.glass,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.glassBorder,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },

  button: { paddingVertical: 15, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  buttonPrimary: { backgroundColor: C.primary },
  buttonGlass: { backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.glassBorder },
  buttonDisabled: { opacity: 0.5 },
  buttonPrimaryText: { color: C.white, fontSize: 16, fontWeight: "600" },
  buttonGlassText: { color: C.primary, fontSize: 16, fontWeight: "600" },
  pressed: { opacity: 0.8 },

  input: {
    backgroundColor: C.glassStrong,
    borderWidth: 1,
    borderColor: C.glassBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    fontSize: 16,
    color: C.ink,
  },
});
