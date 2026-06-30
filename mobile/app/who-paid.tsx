// ---------------------------------------------------------------------------
// app/who-paid.tsx
//
// "Who Paid?" screen.
// - "Paid By" card with a dropdown selector.
// - Bottom-sheet shows exactly two options: Me | Other Person.
// - When "Other Person" is chosen, a secondary "Select Contact ▼" dropdown
//   appears inline; tapping it opens the ContactPickerModal.
// - No Alert.alert() for payer selection.
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";
import { nanoid } from "../utils/nanoid";
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import ContactPickerModal, { ContactData } from "../components/ContactPickerModal";
import type { Person } from "../types/bill";

const COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
];

// Which high-level option is active in the main dropdown
type PayerMode = "me" | "other";

export default function WhoPaidScreen() {
  const router = useRouter();
  const [participants, setParticipants] = useState<Person[]>([]);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [payerMode, setPayerMode] = useState<PayerMode>("me");
  // Payer contact — tracked independently of participants[]
  const [selectedPayer, setSelectedPayer] = useState<ContactData | null>(null);

  // Contact picker modal
  const [isContactPickerVisible, setContactPickerVisible] = useState(false);

  // Bottom sheet for main payer selection
  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["38%"], []);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = billStore.get();
    if (!store) {
      router.replace("/");
      return;
    }

    // Ensure "Me" participant exists
    let meParticipant = store.participants.find(
      (p) => p.isCurrentUser === true
    );
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
    setParticipants(latestStore.participants);

    if (!store.payerId || store.payerId === meParticipant.id) {
      // Default: Me
      setPayerId(meParticipant.id);
      setPayerMode("me");
      billStore.updatePayer(meParticipant.id);
    } else {
      // A non-Me payer was previously set
      setPayerId(store.payerId);
      setPayerMode("other");
    }
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const getMeParticipant = () =>
    participants.find((p) => p.isCurrentUser === true);

  // The label shown in the main dropdown pill
  const mainDropdownLabel =
    payerMode === "me"
      ? "Me"
      : selectedPayer?.name ?? "Other Person";

  // ── Handlers ───────────────────────────────────────────────────────────────
  const selectMe = () => {
    const me = getMeParticipant();
    if (me) {
      setPayerId(me.id);
      billStore.updatePayer(me.id);
    }
    setPayerMode("me");
    bottomSheetRef.current?.dismiss();
  };

  const selectOther = () => {
    setPayerMode("other");
    // Clear payer if it was "Me"
    const me = getMeParticipant();
    if (payerId === me?.id) {
      setPayerId(null);
    }
    // Dismiss sheet first, then open contact picker
    bottomSheetRef.current?.dismiss();
    // Small delay so the sheet animation completes before picker opens
    setTimeout(() => setContactPickerVisible(true), 300);
  };

  const handleContactSelected = (newContacts: ContactData[]) => {
    if (newContacts.length === 0) return;
    const c = newContacts[0];

    // Store payer separately — do NOT add to participants[]
    setSelectedPayer(c);
    setPayerId(c.id);
    billStore.updatePayer(c.id);
    setContactPickerVisible(false);
  };

  const handleContinue = () => {
    if (!payerId) {
      // Only guard: payer must be chosen
      return;
    }
    router.push("/participants" as any);
  };

  const canContinue = !!payerId;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>Who Paid?</Text>
          <Text style={styles.subtitle}>Who paid the restaurant bill?</Text>
        </View>

        {/* ── Paid By card ── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Paid By</Text>

          {/* Main dropdown pill */}
          <Pressable
            style={styles.dropdown}
            onPress={() => bottomSheetRef.current?.present()}
            accessibilityRole="button"
            accessibilityLabel="Select who paid"
          >
            <Text
              style={[
                styles.dropdownText,
                !payerId && payerMode === "other" && styles.dropdownPlaceholder,
              ]}
            >
              {mainDropdownLabel}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#6B7280" />
          </Pressable>

        </View>

        <View style={{ flex: 1 }} />

        {/* ── Continue ── */}
        <View style={styles.footer}>
          <Pressable
            style={[
              styles.continueBtn,
              !canContinue && styles.continueBtnDisabled,
            ]}
            onPress={handleContinue}
            disabled={!canContinue}
          >
            <Text style={styles.continueBtnText}>Continue</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Contact Picker — no existingNames filter for payer selection ── */}
      <ContactPickerModal
        visible={isContactPickerVisible}
        onClose={() => setContactPickerVisible(false)}
        onAddContacts={handleContactSelected}
        existingParticipantIds={[]}
        existingPhones={[]}
        singleSelection
      />

      {/* ── Payer selector bottom sheet ── */}
      <BottomSheetModal
        ref={bottomSheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose
        enableDynamicSizing={false}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
      >
        <BottomSheetView style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Select Payer</Text>

          {/* Me option */}
          <Pressable style={styles.sheetOption} onPress={selectMe}>
            <View style={styles.sheetOptionRow}>
              {payerMode === "me" ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color="#111827"
                  style={styles.sheetIcon}
                />
              ) : (
                <Ionicons
                  name="ellipse-outline"
                  size={22}
                  color="#D1D5DB"
                  style={styles.sheetIcon}
                />
              )}
              <Text
                style={[
                  styles.sheetOptionText,
                  payerMode === "me" && styles.sheetOptionTextActive,
                ]}
              >
                Me
              </Text>
            </View>
          </Pressable>

          {/* Divider */}
          <View style={styles.sheetDivider} />

          {/* Other Person option */}
          <Pressable style={styles.sheetOption} onPress={selectOther}>
            <View style={styles.sheetOptionRow}>
              {payerMode === "other" ? (
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color="#111827"
                  style={styles.sheetIcon}
                />
              ) : (
                <Ionicons
                  name="ellipse-outline"
                  size={22}
                  color="#D1D5DB"
                  style={styles.sheetIcon}
                />
              )}
              <Text
                style={[
                  styles.sheetOptionText,
                  payerMode === "other" && styles.sheetOptionTextActive,
                ]}
              >
                Other Person
              </Text>
            </View>
          </Pressable>

          {/* Cancel */}
          <Pressable
            style={[styles.sheetOption, styles.sheetOptionCancel]}
            onPress={() => bottomSheetRef.current?.dismiss()}
          >
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </Pressable>
        </BottomSheetView>
      </BottomSheetModal>
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
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },

  // Header
  header: {
    marginTop: 24,
    marginBottom: 28,
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

  // Card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },

  // Main dropdown
  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dropdownText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "600",
  },
  dropdownPlaceholder: {
    color: "#9CA3AF",
    fontWeight: "400",
  },

  // Secondary contact row
  secondaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  secondaryArrow: {
    marginLeft: 4,
  },
  secondaryDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  secondaryDropdownText: {
    fontSize: 15,
    color: "#0369A1",
    fontWeight: "500",
  },

  // Footer
  footer: {
    paddingVertical: 16,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },
  continueBtn: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  continueBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  continueBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },

  // Bottom sheet
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    paddingTop: 4,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  sheetOption: {
    paddingVertical: 15,
  },
  sheetOptionRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  sheetIcon: {
    marginRight: 14,
  },
  sheetOptionText: {
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "500",
  },
  sheetOptionTextActive: {
    color: "#111827",
    fontWeight: "700",
  },
  sheetDivider: {
    height: 1,
    backgroundColor: "#F3F4F6",
  },
  sheetOptionCancel: {
    marginTop: 8,
    borderTopWidth: 1,
    borderColor: "#F3F4F6",
    alignItems: "center",
  },
  sheetCancelText: {
    fontSize: 16,
    color: "#EF4444",
    fontWeight: "600",
    paddingTop: 4,
  },
});
