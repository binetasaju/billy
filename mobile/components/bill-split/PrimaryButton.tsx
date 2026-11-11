// ---------------------------------------------------------------------------
// components/bill-split/PrimaryButton.tsx
//
// Reusable primary CTA button with disabled state.
// ---------------------------------------------------------------------------

import React from "react";
import { Pressable, Text, StyleSheet, ViewStyle } from "react-native";
import { C } from "@/constants/colors";

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function PrimaryButton({ label, onPress, disabled = false, style }: PrimaryButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: C.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: C.textSubtle,
  },
  buttonPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: C.white,
    fontSize: 14,
    fontWeight: "600",
  },
});
