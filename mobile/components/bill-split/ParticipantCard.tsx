// ---------------------------------------------------------------------------
// components/bill-split/ParticipantCard.tsx
//
// Selectable card with a radio button for single-payer selection.
// ---------------------------------------------------------------------------

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/constants/colors";

interface ParticipantCardProps {
  name: string;
  color?: string;
  isSelected: boolean;
  onPress: () => void;
}

export default function ParticipantCard({
  name,
  color = C.textMuted,
  isSelected,
  onPress,
}: ParticipantCardProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.card,
        isSelected && styles.cardSelected,
        pressed && styles.cardPressed,
      ]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`Select ${name} as payer`}
    >
      <View style={styles.left}>
        <View style={[styles.avatar, { backgroundColor: color }]}>
          <Text style={styles.avatarText}>
            {name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={[styles.name, isSelected && styles.nameSelected]}>
          {name}
        </Text>
      </View>
      <Ionicons
        name={isSelected ? "radio-button-on" : "radio-button-off"}
        size={22}
        color={isSelected ? C.ink : C.borderStrong}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: C.white,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 8,
  },
  cardSelected: {
    borderColor: C.primary,
    backgroundColor: C.bg,
  },
  cardPressed: {
    opacity: 0.85,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
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
  name: {
    fontSize: 16,
    fontWeight: "500",
    color: C.text,
  },
  nameSelected: {
    fontWeight: "700",
    color: C.ink,
  },
});
