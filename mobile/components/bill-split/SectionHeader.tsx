// ---------------------------------------------------------------------------
// components/bill-split/SectionHeader.tsx
//
// Reusable section header with uppercase label and optional subtitle.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { C } from "@/constants/colors";

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
    fontSize: 12,
    fontWeight: "600",
    color: C.textMuted,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 12,
    color: C.textSubtle,
    marginTop: 2,
  },
});
