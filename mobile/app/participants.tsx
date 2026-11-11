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
  ScrollView,
  Pressable,
  LayoutAnimation,
  Modal,
  TextInput,
} from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";
import { authStore } from "../services/authStore";
import { contactGroupStore, membersToParticipants } from "../services/contactGroupStore";
import ContactPickerModal, { ContactData } from "../components/ContactPickerModal";
import AddBillyPersonModal, { type BillyPerson } from "../components/AddBillyPersonModal";
import type { Person } from "../types/bill";
import type { ContactGroup } from "../types/group";

// Reusable components
import SectionHeader from "../components/bill-split/SectionHeader";
import PrimaryButton from "../components/bill-split/PrimaryButton";
import ParticipantCard from "../components/bill-split/ParticipantCard";
import ParticipantCheckbox from "../components/bill-split/ParticipantCheckbox";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";

// People's avatar colours — emerald / black / white theme
const COLORS = [
  "#065F46", "#0A0A0A", "#115E59", "#525252",
  "#047857", "#78716C", "#14532D", "#0F766E",
];

export default function ParticipantsScreen() {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [participants, setParticipants] = useState<Person[]>([]);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [sharingIds, setSharingIds] = useState<Set<string>>(new Set());
  // Problems are only shown after the user tries to continue.
  const [showValidation, setShowValidation] = useState(false);
  const [billTotal, setBillTotal] = useState(0);

  // Modals
  const [isContactPickerVisible, setContactPickerVisible] = useState(false);
  const [billyPickerVisible, setBillyPickerVisible] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Person | null>(null);
  const [editName, setEditName] = useState("");

  // Saved-group picker (prefill this bill's participants from a saved group)
  const [groupPickerVisible, setGroupPickerVisible] = useState(false);
  const [savedGroups, setSavedGroups] = useState<ContactGroup[]>([]);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = billStore.get();
    if (!store) {
      router.replace("/");
      return;
    }

    const currentUser = authStore.get().user;

    // Payment identity belongs to the person it describes. This screen only
    // ever deals in contact identity (name + phone); the single UPI ID it
    // copies is the current user's own, read from their profile in authStore.
    // Everyone else's UPI ID is resolved from their own Billy account once
    // accounts/sync exist — never typed in by whoever created the bill.

    // Ensure "Me" participant exists
    let meParticipant = store.participants.find((p) => p.isCurrentUser === true);
    if (!meParticipant) {
      meParticipant = {
        // Always the auth uid — everything downstream (Pay / Mark as Received
        // visibility, History totals) matches on currentUser.uid, so the two
        // must never diverge. Mirrors billStore.set()'s own fallback.
        id: currentUser?.uid ?? "me",
        name: currentUser?.name ?? "Me",
        color: COLORS[store.participants.length % COLORS.length],
        itemIds: [],
        isCurrentUser: true,
        upiId: currentUser?.upiId,
      };
      billStore.addParticipant(meParticipant);
    } else if (!meParticipant.upiId && currentUser?.upiId) {
      // Backfill: "me" may have been created before the profile had a UPI ID.
      store.participants = store.participants.map((p) =>
        p.isCurrentUser ? { ...p, upiId: currentUser.upiId } : p
      );
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

  // ── Saved groups (read-only here; all CRUD lives in contactGroupStore) ────
  useEffect(() => {
    setSavedGroups(contactGroupStore.getGroups());
    return contactGroupStore.subscribe(() => {
      setSavedGroups(contactGroupStore.getGroups());
    });
  }, []);

  // ── Derived values ────────────────────────────────────────────────────────
  // Rules: someone paid, at least 2 people share, and the payer is one of
  // them (downstream screens, saved bills and UPI pay look the payer up in
  // the sharing list — "paid for others" is handled by custom amounts).
  const hasPayerSelected = !!payerId;
  const hasEnoughSharers = sharingIds.size >= 2;
  const payerIsSharing = !!payerId && sharingIds.has(payerId);
  const canContinue = hasPayerSelected && hasEnoughSharers && payerIsSharing;
  const sharerCount = sharingIds.size;

  // ── Validation status label ───────────────────────────────────────────────
  const validationStatus = useMemo(() => {
    if (!hasPayerSelected) return { icon: "alert-circle" as const, text: "Select who paid", color: C.danger };
    if (!hasEnoughSharers) return { icon: "alert-circle" as const, text: "Select at least 2 people sharing", color: C.danger };
    if (!payerIsSharing) return { icon: "alert-circle" as const, text: "Who paid must also be sharing", color: C.danger };
    return { icon: "checkmark-circle" as const, text: "Ready to split", color: C.successDark };
  }, [hasPayerSelected, hasEnoughSharers, payerIsSharing]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePayerSelect = useCallback((id: string) => {
    setPayerId(id);
    billStore.updatePayer(id);
    // The payer always shares the bill — tick them automatically.
    setSharingIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
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

  // A Billy account added by email / from "On Billy" — linked to the bill.
  const handleAddBillyPerson = useCallback((person: BillyPerson) => {
    if (participants.some((p) => p.id === person.id || (person.authUid && p.authUid === person.authUid))) {
      setBillyPickerVisible(false);
      return;
    }
    const newPerson: Person = {
      ...person,
      color: COLORS[participants.length % COLORS.length],
      itemIds: [],
    };
    billStore.addParticipant(newPerson);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setParticipants((prev) => [...prev, newPerson]);
    setSharingIds((prev) => new Set(prev).add(newPerson.id));
    setBillyPickerVisible(false);
  }, [participants]);

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

  /**
   * Copy a saved group's members onto this bill. The group is only a source:
   * members are copied, and adding/removing people here afterwards never
   * writes back to it.
   */
  const handleUseGroup = useCallback((group: ContactGroup) => {
    const merged = membersToParticipants(group.members, participants);
    const store = billStore.get();
    if (store) store.participants = merged;
    billStore.setContactGroupId(group.id);

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setParticipants(merged);
    setSharingIds(new Set(merged.map((p) => p.id)));
    setGroupPickerVisible(false);
  }, [participants]);

  const handleRemoveParticipant = useCallback((person: Person) => {
    if (participants.length <= 2) {
      appAlert.alert("Cannot remove", "A bill must have at least 2 participants.");
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

  const handleParticipantOptions = useCallback((person: Person) => {
    appAlert.alert(person.name, undefined, [
      { text: "Edit name", onPress: () => handleEditName(person) },
      { text: "Remove", style: "destructive", onPress: () => handleRemoveParticipant(person) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [handleEditName, handleRemoveParticipant]);

  const saveEditName = useCallback(() => {
    if (!editingParticipant) return;
    const name = editName.trim();
    if (!name) {
      appAlert.alert("Invalid Name", "Please enter a valid name.");
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
    if (!canContinue || !payerId) {
      setShowValidation(true);
      appAlert.alert("Can't split yet", validationStatus.text + ".");
      return;
    }

    // Save payer to store
    billStore.updatePayer(payerId);

    // Sync participants with sharing selection
    const store = billStore.get();
    if (store) {
      store.participants = participants.filter((p) => sharingIds.has(p.id));
    }

    router.push("/choose-split-method" as any);
  }, [canContinue, payerId, participants, sharingIds, router, validationStatus]);

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
              onOptions={() => handleParticipantOptions(p)}
            />
          ))}

          {/* Accounts first: Billy users are linked to the bill at once */}
          <Pressable
            style={[styles.addBtn, styles.addBillyBtn]}
            onPress={() => setBillyPickerVisible(true)}
            accessibilityRole="button"
          >
            <Ionicons name="person-add" size={18} color={C.white} />
            <Text style={[styles.addBtnText, styles.addBillyText]}>Add a Billy User</Text>
          </Pressable>

          {/* Add contacts button — they join later with the share link */}
          <Pressable
            style={styles.addBtn}
            onPress={() => setContactPickerVisible(true)}
          >
            <Ionicons name="person-add" size={18} color={C.ink} />
            <Text style={styles.addBtnText}>Add From Contacts</Text>
          </Pressable>

          {/* Prefill from a saved group */}
          {savedGroups.length > 0 && (
            <Pressable
              style={styles.addBtn}
              onPress={() => setGroupPickerVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Use a saved group"
            >
              <Ionicons name="people" size={18} color={C.ink} />
              <Text style={styles.addBtnText}>Use a Saved Group</Text>
            </Pressable>
          )}
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
          {/* Status: "Ready" when valid; problems only after Continue was pressed */}
          {(canContinue || showValidation) && (
            <>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <View style={styles.statusRow}>
                  <Ionicons name={validationStatus.icon} size={16} color={validationStatus.color} />
                  <Text style={[styles.statusText, { color: validationStatus.color }]}>
                    {validationStatus.text}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Bottom spacer for button */}
        <View style={{ height: 90 }} />
      </ScrollView>

      {/* ── Footer: Continue button ─────────────────────────────── */}
      <View style={styles.footer}>
        <PrimaryButton
          label="Continue to Split →"
          onPress={handleContinue}
        />
      </View>

      {/* ── Contact Picker Modal ─────────────────────────────────── */}
      <AddBillyPersonModal
        visible={billyPickerVisible}
        existingIds={new Set(participants.flatMap((p) => (p.authUid ? [p.id, p.authUid] : [p.id])))}
        onAdd={handleAddBillyPerson}
        onClose={() => setBillyPickerVisible(false)}
      />

      <ContactPickerModal
        visible={isContactPickerVisible}
        onClose={() => setContactPickerVisible(false)}
        onAddContacts={handleAddContacts}
        existingParticipantIds={participants.map((p) => p.id)}
        existingPhones={participants.map((p) => p.phone || "").filter(Boolean)}
      />

      {/* ── Saved Group Picker ───────────────────────────────────── */}
      <Modal visible={groupPickerVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Use a Saved Group</Text>
            <ScrollView style={{ maxHeight: 280 }}>
              {savedGroups.map((g) => (
                <Pressable
                  key={g.id}
                  style={({ pressed }) => [styles.groupOption, pressed && { opacity: 0.7 }]}
                  onPress={() => handleUseGroup(g)}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${g.name}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupOptionName}>{g.name}</Text>
                    <Text style={styles.groupOptionMeta}>
                      {g.members.length} member{g.members.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.borderStrong} />
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setGroupPickerVisible(false)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
    backgroundColor: C.bg,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },

  // Header
  header: {
    marginBottom: 20,
  },
  title: {
    ...T.largeTitle,
    color: C.ink,
  },
  subtitle: {
    fontSize: 14,
    color: C.textMuted,
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
    backgroundColor: C.border,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 8,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  addBillyBtn: { backgroundColor: C.primary, borderColor: C.primary },
  addBillyText: { color: C.white },

  // Summary card
  summaryCard: {
    backgroundColor: C.glass,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.glassBorder,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 0,
  },
  summaryTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: C.textMuted,
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
    fontSize: 12,
    color: C.textMuted,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "600",
    color: C.ink,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: C.surfaceAlt,
    marginVertical: 6,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 12,
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
    backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: C.border,
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
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 6,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: C.ink,
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: C.ink,
    marginBottom: 20,
  },
  groupOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.surfaceAlt,
  },
  groupOptionName: { fontSize: 14, fontWeight: "600", color: C.ink },
  groupOptionMeta: { fontSize: 12, color: C.textMuted, marginTop: 2 },
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
    fontSize: 13,
    fontWeight: "600",
    color: C.textMuted,
  },
  modalSaveBtn: {
    backgroundColor: C.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: C.white,
  },
});
