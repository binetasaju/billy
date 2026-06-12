import { useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type Participant = {
  id: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function SplitScreen() {
  const router = useRouter();

  // Who paid
  const [payer, setPayer] = useState<"me" | "contact" | null>(null);

  // Participants splitting the bill
  const [participants, setParticipants] = useState<Participant[]>([
    { id: "me", name: "Me" },
  ]);

  const handleSelectContact = () => {
    // expo-contacts integration goes here later
    Alert.alert("Select Contact", "Contact picker — coming soon.");
  };

  const handleAddParticipant = () => {
    // expo-contacts integration goes here later
    Alert.alert("Add Participant", "Contact picker — coming soon.");
  };

  const handleRemoveParticipant = (id: string) => {
    if (id === "me") {
      Alert.alert("Can't remove", "You must be included as a participant.");
      return;
    }
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  };

  const handleSettlement = () => {
    if (!payer) {
      Alert.alert("Who paid?", "Please select who paid the bill.");
      return;
    }
    Alert.alert(
      "Settlement Summary",
      "Full settlement screen coming soon.\n\nThis will show each person's share.",
      [{ text: "OK" }]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <Text style={styles.title}>Split Bill</Text>
      <Text style={styles.subtitle}>
        Choose who paid and who's splitting
      </Text>

      {/* ------------------------------------------------------------------ */}
      {/* Who Paid? */}
      {/* ------------------------------------------------------------------ */}
      <Text style={styles.sectionLabel}>Who Paid?</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() => setPayer("me")}
          style={({ pressed }) => [
            styles.payerOption,
            payer === "me" && styles.payerOptionSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.payerOptionText,
              payer === "me" && styles.payerOptionTextSelected,
            ]}
          >
            Me
          </Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable
          onPress={() => {
            setPayer("contact");
            handleSelectContact();
          }}
          style={({ pressed }) => [
            styles.payerOption,
            payer === "contact" && styles.payerOptionSelected,
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.payerOptionText,
              payer === "contact" && styles.payerOptionTextSelected,
            ]}
          >
            Select Contact →
          </Text>
        </Pressable>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Participants */}
      {/* ------------------------------------------------------------------ */}
      <Text style={styles.sectionLabel}>Participants</Text>
      <View style={styles.card}>
        {participants.map((p) => (
          <View key={p.id} style={styles.participantRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {p.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.participantName}>{p.name}</Text>
            <Pressable
              onPress={() => handleRemoveParticipant(p.id)}
              style={({ pressed }) => [
                styles.removeButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.removeButtonText}>✕</Text>
            </Pressable>
          </View>
        ))}

        <View style={styles.divider} />

        <Pressable
          onPress={handleAddParticipant}
          style={({ pressed }) => [
            styles.addParticipantButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.addParticipantText}>+ Add Participant</Text>
        </Pressable>
      </View>

      {/* ------------------------------------------------------------------ */}
      {/* Settlement Summary placeholder */}
      {/* ------------------------------------------------------------------ */}
      <Text style={styles.sectionLabel}>Settlement Summary</Text>
      <View style={styles.card}>
        <Text style={styles.summaryPlaceholder}>
          Settlement details will appear here once items and participants are
          confirmed.
        </Text>
      </View>

      {/* Calculate */}
      <Pressable
        onPress={handleSettlement}
        style={({ pressed }) => [
          styles.calculateButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.calculateButtonText}>Calculate Settlement</Text>
      </Pressable>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  content: {
    padding: 24,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 24,
    overflow: "hidden",
  },
  payerOption: {
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  payerOptionSelected: {
    backgroundColor: "#F0FDF4",
  },
  payerOptionText: {
    fontSize: 15,
    color: "#374151",
    fontWeight: "500",
  },
  payerOptionTextSelected: {
    color: "#15803D",
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: "#E5E7EB",
  },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 14,
  },
  participantName: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
    fontWeight: "500",
  },
  removeButton: {
    padding: 6,
  },
  removeButtonText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  addParticipantButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  addParticipantText: {
    color: "#111827",
    fontWeight: "500",
    fontSize: 14,
  },
  summaryPlaceholder: {
    padding: 18,
    color: "#9CA3AF",
    fontSize: 14,
    lineHeight: 22,
  },
  calculateButton: {
    backgroundColor: "#000000",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  calculateButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  pressed: {
    opacity: 0.7,
  },
});
