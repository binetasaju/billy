// ---------------------------------------------------------------------------
// components/bill-split/SectionHeader.tsx
//
// Reusable section header with uppercase label and optional subtitle.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  style?: object;
}

export default function SectionHeader({ title, subtitle, style }: SectionHeaderProps) {
  return (
    <View style={[styles.container, style]}>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 2,
  },
});
