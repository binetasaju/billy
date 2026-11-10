// ---------------------------------------------------------------------------
// components/bill-split/ParticipantCheckbox.tsx
//
// Checkbox row for selecting which participants share the bill.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/constants/colors";

interface ParticipantCheckboxProps {
  name: string;
  color?: string;
  phone?: string;
  isChecked: boolean;
  onToggle: () => void;
  /** Opens per-person options (edit name / remove). Also triggered by long-press. */
  onOptions?: () => void;
}

export default function ParticipantCheckbox({
  name,
  color = C.textMuted,
  phone,
  isChecked,
  onToggle,
  onOptions,
}: ParticipantCheckboxProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
      onPress={onToggle}
      onLongPress={onOptions}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isChecked }}
      accessibilityLabel={`${isChecked ? "Deselect" : "Select"} ${name}`}
    >
      <View style={styles.left}>
        <View style={[styles.avatar, { backgroundColor: color }]}>
          <Text style={styles.avatarText}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.nameContainer}>
          <Text style={[styles.name, !isChecked && styles.nameUnchecked]}>
            {name}
          </Text>
          {phone && <Text style={styles.phone}>{phone}</Text>}
        </View>
      </View>
      <View style={styles.right}>
        {onOptions && (
          <Pressable
            onPress={onOptions}
            hitSlop={10}
            style={styles.optionsBtn}
            accessibilityRole="button"
            accessibilityLabel={`Options for ${name}`}
          >
            <Ionicons name="ellipsis-vertical" size={18} color={C.textMuted} />
          </Pressable>
        )}
        <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
          {isChecked && <Ionicons name="checkmark" size={16} color="#FFF" />}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  optionsBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.glassStrong,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.glassBorder,
    marginBottom: 6,
  },
  rowPressed: {
    opacity: 0.85,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: C.white,
    fontSize: 16,
    fontWeight: "700",
  },
  nameContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: C.ink,
  },
  nameUnchecked: {
    color: C.textSubtle,
  },
  phone: {
    fontSize: 13,
    color: C.textMuted,
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
});
