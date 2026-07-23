// ---------------------------------------------------------------------------
// app/participants.tsx
//
// Combined "Participants" screen — single payer selection + sharing toggle.
//
// Section 1: "Who paid the bill?" — Radio cards, single selection only.
// Section 2: "Who is sharing this bill?" — Checkboxes per participant.
// Section 3: Live summary with validation status.
//
// Architecture: UI-only — delegates to billStore / existing services.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Pressable,
  Alert,
  LayoutAnimation,
  Platform,
  UIManager,
  Modal,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";
import ContactPickerModal, { ContactData } from "../components/ContactPickerModal";
import type { Person } from "../types/bill";
import { nanoid } from "../utils/nanoid";

// Reusable components
import SectionHeader from "../components/bill-split/SectionHeader";
import PrimaryButton from "../components/bill-split/PrimaryButton";
import ParticipantCard from "../components/bill-split/ParticipantCard";
import ParticipantCheckbox from "../components/bill-split/ParticipantCheckbox";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
];

export default function ParticipantsScreen() {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [participants, setParticipants] = useState<Person[]>([]);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());
  const [billTotal, setBillTotal] = useState(0);

  // Modals
  const [isContactPickerVisible, setContactPickerVisible] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Person | null>(null);
  const [editName, setEditName] = useState("");

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = billStore.get();
    if (!store) {
      router.replace("/");
      return;
    }

    // Ensure "Me" participant exists
    let meParticipant = store.participants.find((p) => p.isCurrentUser === true);
    if (!meParticipant) {
      meParticipant = {
        id: nanoid(),
        name: "Me",
        color: COLORS[store.participants.length % COLORS.length],
        itemIds: [],
        isCurrentUser: true,
      };
      billStore.addParticipant(meParticipant);
    }

    const latestStore = billStore.get()!;
    const parts = latestStore.participants;
    setParticipants(parts);
    setBillTotal(latestStore.bill.total || 0);

    // Initialize payer — default to Me
    if (latestStore.payerId) {
      setPayerId(latestStore.payerId);
    } else {
      const me = parts.find((p) => p.isCurrentUser);
      if (me) {
        setPayerId(me.id);
        billStore.updatePayer(me.id);
      }
    }

    // Initialize all participants as sharing by default
    setSharingIds(new Set(parts.map((p) => p.id)));
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  const hasPayerSelected = !!payerId;
  const hasAtLeastOneSharer = sharingIds.size > 0;
  const canContinue = hasPayerSelected && hasAtLeastOneSharer;
  const sharerCount = sharingIds.size;

  // ── Validation status label ───────────────────────────────────────────────
  const validationStatus = useMemo(() => {
    if (!hasPayerSelected) return { icon: "alert-circle" as const, text: "Select who paid", color: "#EF4444" };
    if (!hasAtLeastOneSharer) return { icon: "alert-circle" as const, text: "Select who's sharing", color: "#EF4444" };
    return { icon: "checkmark-circle" as const, text: "Ready to split", color: "#059669" };
  }, [hasPayerSelected, hasAtLeastOneSharer]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePayerSelect = useCallback((id: string) => {
    setPayerId(id);
    billStore.updatePayer(id);
  }, []);

  const handleToggleSharing = useCallback((id: string) => {
    setSharingIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleAddContacts = useCallback((newContacts: ContactData[]) => {
    const updatedParticipants = [...participants];

    newContacts.forEach((c) => {
      const newPerson: Person = {
        id: c.id,
        name: c.name,
        phone: c.phone,
        color: COLORS[updatedParticipants.length % COLORS.length],
        itemIds: [],
      };
      billStore.addParticipant(newPerson);
      updatedParticipants.push(newPerson);
    });

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setParticipants(updatedParticipants);

    // Auto-share new participants
    setSharingIds((prev) => {
      const next = new Set(prev);
      newContacts.forEach((c) => next.add(c.id));
      return next;
    });

    setContactPickerVisible(false);
  }, [participants]);

  const handleRemoveParticipant = useCallback((person: Person) => {
    if (participants.length <= 2) {
      Alert.alert("Cannot remove", "A bill must have at least 2 participants.");
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = participants.filter((p) => p.id !== person.id);

    // Update store
    const store = billStore.get();
    if (store) {
      store.participants = updated;
    }

    setParticipants(updated);

    // Clean up sharing
    setSharingIds((prev) => {
      const next = new Set(prev);
      next.delete(person.id);
      return next;
    });

    // If the removed person was the payer, fall back to Me or first participant
    if (payerId === person.id) {
      const me = updated.find((p) => p.isCurrentUser);
      const fallbackId = me?.id || updated[0]?.id || null;
      setPayerId(fallbackId);
      if (fallbackId) billStore.updatePayer(fallbackId);
    }
  }, [participants, payerId]);

  const handleEditName = useCallback((person: Person) => {
    setEditingParticipant(person);
    setEditName(person.name);
  }, []);

  const saveEditName = useCallback(() => {
    if (!editingParticipant) return;
    const name = editName.trim();
    if (!name) {
      Alert.alert("Invalid Name", "Please enter a valid name.");
      return;
    }

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = participants.map((p) =>
      p.id === editingParticipant.id ? { ...p, name } : p
    );

    const store = billStore.get();
    if (store) store.participants = updated;

    setParticipants(updated);
    setEditingParticipant(null);
  }, [editingParticipant, editName, participants]);

  const handleContinue = useCallback(() => {
    if (!canContinue || !payerId) return;

    // Save payer to store
    billStore.updatePayer(payerId);

    // Sync participants with sharing selection
    const store = billStore.get();
    if (store) {
      store.participants = participants.filter((p) => sharingIds.has(p.id));
    }

    router.push("/choose-split-method" as any);
  }, [canContinue, payerId, participants, sharingIds, router]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.title}>Participants</Text>
          <Text style={styles.subtitle}>Set up payer and sharing details</Text>
        </View>

        {/* ── Section 1: Who paid the bill? ───────────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Who paid the bill?" />
          {participants.map((p) => (
            <ParticipantCard
              key={p.id}
              name={p.name}
              color={p.color}
              isSelected={payerId === p.id}
              onPress={() => handlePayerSelect(p.id)}
            />
          ))}
        </View>

        {/* ── Section 2: Who is sharing this bill? ────────────────── */}
        <View style={styles.section}>
          <SectionHeader title="Who is sharing this bill?" />
          {participants.map((p) => (
            <ParticipantCheckbox
              key={p.id}
              name={p.name}
              color={p.color}
              phone={p.phone}
              isChecked={sharingIds.has(p.id)}
              onToggle={() => handleToggleSharing(p.id)}
            />
          ))}

          {/* Add contacts button */}
          <Pressable
            style={styles.addBtn}
            onPress={() => setContactPickerVisible(true)}
          >
            <Ionicons name="person-add" size={18} color="#111827" />
            <Text style={styles.addBtnText}>Add From Contacts</Text>
          </Pressable>
        </View>

        {/* ── Section 3: Live Summary ────────────────────────────── */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Sharing</Text>
            <Text style={styles.summaryValue}>{sharerCount} participant{sharerCount !== 1 ? "s" : ""}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Bill Total</Text>
            <Text style={styles.summaryValue}>₹{billTotal.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Paid by</Text>
            <Text style={styles.summaryValue}>
              {payerId ? (participants.find((p) => p.id === payerId)?.name ?? "—") : "—"}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <View style={styles.statusRow}>
              <Ionicons name={validationStatus.icon} size={16} color={validationStatus.color} />
              <Text style={[styles.statusText, { color: validationStatus.color }]}>
                {validationStatus.text}
              </Text>
            </View>
          </View>
        </View>

        {/* Bottom spacer for button */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* ── Footer: Continue button ─────────────────────────────── */}
      <View style={styles.footer}>
        <PrimaryButton
          label="Continue to Split →"
          onPress={handleContinue}
          disabled={!canContinue}
        />
      </View>

      {/* ── Contact Picker Modal ─────────────────────────────────── */}
      <ContactPickerModal
        visible={isContactPickerVisible}
        onClose={() => setContactPickerVisible(false)}
        onAddContacts={handleAddContacts}
        existingParticipantIds={participants.map((p) => p.id)}
        existingPhones={participants.map((p) => p.phone || "").filter(Boolean)}
      />

      {/* ── Edit Name Modal ──────────────────────────────────────── */}
      <Modal visible={!!editingParticipant} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              onSubmitEditing={saveEditName}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setEditingParticipant(null)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={saveEditName}>
                <Text style={styles.modalSaveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },

  // Header
  header: {
    marginTop: 24,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 4,
  },

  // Sections
  section: {
    marginBottom: 24,
  },

  // Add button
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E5E7EB",
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },

  // Summary card
  summaryCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#6B7280",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
    marginVertical: 6,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },

  // Edit name modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalCancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  modalSaveBtn: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
