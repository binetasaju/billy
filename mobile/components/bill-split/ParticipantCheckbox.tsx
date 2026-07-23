// ---------------------------------------------------------------------------
// components/bill-split/ParticipantCheckbox.tsx
//
// Checkbox row for selecting which participants share the bill.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface ParticipantCheckboxProps {
  name: string;
  color?: string;
  phone?: string;
  isChecked: boolean;
  onToggle: () => void;
}

export default function ParticipantCheckbox({
  name,
  color = "#6B7280",
  phone,
  isChecked,
  onToggle,
}: ParticipantCheckboxProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
      ]}
      onPress={onToggle}
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
      <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
        {isChecked && <Ionicons name="checkmark" size={16} color="#FFF" />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#F3F4F6",
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
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  nameContainer: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  nameUnchecked: {
    color: "#9CA3AF",
  },
  phone: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 2,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
});
