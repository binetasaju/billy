// ---------------------------------------------------------------------------
// app/assign-by-person.tsx
//
// Item-wise split — participant-centric view.
// "What did each person order?"
//
// Features:
//  • Tap participant → bottom sheet with item checkboxes
//  • Sticky [ Cancel ] [ Save Selection ] action bar
//  • Save disabled when 0 items selected
//  • ✓ toast snackbar on save
//  • Pre-fills previous selection on reopen
//  • Progress bar: Participants Assigned X / Y
//  • Continue disabled until every participant has ≥1 item
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, SafeAreaView,
  FlatList, Animated,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetModal, BottomSheetBackdrop, BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { billStore } from "../services/billStore";
import type { BillItem, Person } from "../types/bill";

// ---------------------------------------------------------------------------
// Toast component
// ---------------------------------------------------------------------------
function Toast({ message, visible }: { message: string; visible: boolean }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  return (
    <Animated.View style={[toastStyles.wrap, { opacity }]} pointerEvents="none">
      <Ionicons name="checkmark-circle" size={18} color="#fff" />
      <Text style={toastStyles.text}>{message}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#111827",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 999,
  },
  text: { color: "#fff", fontSize: 14, fontWeight: "600" },
});

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function AssignByPersonScreen() {
  const router = useRouter();
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<Person[]>([]);
  const [activePerson, setActivePerson] = useState<Person | null>(null);
  const [draftItemIds, setDraftItemIds] = useState<Set<string>>(new Set());
  const insets = useSafeAreaInsets();

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["85%"], []);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = billStore.get();
    if (!store) { router.replace("/"); return; }
    setItems(store.bill.items as BillItem[]);
    setParticipants(store.participants);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  // ── Derived ────────────────────────────────────────────────────────────────
  const assignedCount = useMemo(
    () => participants.filter((p) => p.itemIds.length > 0).length,
    [participants]
  );
  const allAssigned = assignedCount === participants.length && participants.length > 0;
  const progressPct = participants.length > 0
    ? Math.round((assignedCount / participants.length) * 100)
    : 0;

  // ── Open sheet ─────────────────────────────────────────────────────────────
  const openSheet = useCallback((person: Person) => {
    setActivePerson(person);
    // Pre-fill with saved selection
    setDraftItemIds(new Set(person.itemIds));
    sheetRef.current?.present();
  }, []);

  // ── Toggle item in draft ───────────────────────────────────────────────────
  const toggleItem = useCallback((itemId: string) => {
    setDraftItemIds((prev) => {
      const next = new Set(prev);
      next.has(itemId) ? next.delete(itemId) : next.add(itemId);
      return next;
    });
  }, []);

  // ── Show toast ─────────────────────────────────────────────────────────────
  const showToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(false);
    // Defer to next tick so Animated resets
    setTimeout(() => setToastVisible(true), 10);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  };

  // ── Save selection ─────────────────────────────────────────────────────────
  const saveSelection = useCallback(() => {
    if (!activePerson) return;
    const personId = activePerson.id;
    const newItemIds = Array.from(draftItemIds);

    // Update local state
    setParticipants((prev) =>
      prev.map((p) => (p.id === personId ? { ...p, itemIds: newItemIds } : p))
    );

    // Persist to store
    const store = billStore.get();
    if (store) {
      store.participants = store.participants.map((p) =>
        p.id === personId ? { ...p, itemIds: newItemIds } : p
      );
    }

    sheetRef.current?.dismiss();
    setActivePerson(null);
    showToast();
  }, [activePerson, draftItemIds]);

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const cancelSheet = useCallback(() => {
    sheetRef.current?.dismiss();
    setActivePerson(null);
  }, []);

  // ── Draft total (live amount as items are checked) ────────────────────────
  const draftTotal = useMemo(() => {
    return items
      .filter((it) => draftItemIds.has(it.id))
      .reduce((sum, it) => sum + (it.price ?? 0), 0);
  }, [draftItemIds, items]);

  const renderPerson = ({ item: person }: { item: Person }) => {
    const count = person.itemIds.length;
    const isAssigned = count > 0;
    const savedTotal = items
      .filter((it) => person.itemIds.includes(it.id))
      .reduce((sum, it) => sum + (it.price ?? 0), 0);
    const itemNames = items
      .filter((it) => person.itemIds.includes(it.id))
      .map((it) => it.name)
      .join(", ");

    return (
      <Pressable
        style={({ pressed }) => [
          styles.personCard,
          isAssigned && styles.personCardAssigned,
          pressed && { opacity: 0.76 },
        ]}
        onPress={() => openSheet(person)}
      >
        <View style={[styles.avatar, { backgroundColor: person.color }]}>
          <Text style={styles.avatarText}>{person.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.personInfo}>
          <Text style={styles.personName}>{person.name}</Text>
          {isAssigned ? (
            <Text style={styles.personItems} numberOfLines={1}>
              {count} item{count !== 1 ? "s" : ""}  ·  <Text style={styles.personAmount}>₹{savedTotal.toFixed(2)}</Text>
            </Text>
          ) : (
            <Text style={styles.personUnassigned}>Tap to select items</Text>
          )}
        </View>
        <View style={styles.personRight}>
          {isAssigned ? (
            <View style={styles.assignedChip}>
              <Ionicons name="checkmark" size={12} color="#059669" />
              <Text style={styles.assignedChipText}>Assigned</Text>
            </View>
          ) : (
            <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
          )}
        </View>
      </Pressable>
    );
  };

  // ── Render item row (used in BottomSheetScrollView .map) ────────────────
  const renderSheetItemRow = (item: BillItem) => {
    const checked = draftItemIds.has(item.id);
    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.itemRow, pressed && { backgroundColor: "#F9FAFB" }]}
        onPress={() => toggleItem(item.id)}
      >
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
        </View>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </Pressable>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>Assign Items</Text>
          <Text style={styles.subtitle}>What did each person order?</Text>
        </View>

        {/* ── Progress bar ── */}
        <View style={styles.progressWrap}>
          <View style={[styles.progressTrack]}>
            <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>
            {assignedCount} / {participants.length} participants assigned
          </Text>
        </View>

        {/* ── Participant list ── */}
        <FlatList
          data={participants}
          keyExtractor={(p) => p.id}
          renderItem={renderPerson}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No participants found.</Text>}
        />

        {/* ── Footer ── */}
        <View style={styles.footer}>
          {!allAssigned && (
            <Text style={styles.footerHint}>
              Assign items to all {participants.length} participants to continue
            </Text>
          )}
          <Pressable
            style={[styles.continueBtn, !allAssigned && styles.continueBtnDisabled]}
            onPress={() => router.push("/itemwise-split-summary" as any)}
            disabled={!allAssigned}
          >
            <Text style={styles.continueBtnText}>View Settlement →</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Toast ── */}
      <Toast message="Items assigned successfully" visible={toastVisible} />

      {/* ── Bottom sheet ── */}
      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        enablePanDownToClose={false}
        enableDynamicSizing={false}
        onDismiss={() => setActivePerson(null)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
        )}
      >
        {/*
          Use a plain View (not BottomSheetView) so that flex:1 fills the full
          snap height when enableDynamicSizing={false}. BottomSheetView sizes
          itself to content, which hides the sticky footer on long lists.
        */}
        <View style={styles.sheetOuter}>
          {/* Sheet header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>
              Items for {activePerson?.name}
            </Text>
            <Text style={styles.sheetSubtitle}>
              {draftItemIds.size === 0
                ? "Select what they ordered"
                : `${draftItemIds.size} item${draftItemIds.size !== 1 ? "s" : ""} selected`}
            </Text>
          </View>

          {/* Scrollable item list */}
          <BottomSheetScrollView
            style={styles.sheetList}
            contentContainerStyle={styles.sheetListContent}
            keyboardShouldPersistTaps="handled"
          >
            {items.map(renderSheetItemRow)}
          </BottomSheetScrollView>

          {/* Sticky action bar / Footer */}
          <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetFooterTop}>
              {draftItemIds.size === 0 ? (
                <Text style={styles.sheetFooterCount}>No items selected</Text>
              ) : (
                <View style={styles.sheetFooterRow}>
                  <Text style={styles.sheetFooterAmount}>₹{draftTotal.toFixed(2)}</Text>
                  <Text style={styles.sheetFooterSep}>·</Text>
                  <Text style={styles.sheetFooterCount}>
                    {draftItemIds.size} item{draftItemIds.size !== 1 ? "s" : ""}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.sheetActions}>
              <Pressable
                style={styles.sheetCancelBtn}
                onPress={cancelSheet}
                accessibilityRole="button"
              >
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.sheetSaveBtn}
                onPress={saveSelection}
                accessibilityRole="button"
              >
                <Text style={styles.sheetSaveText}>
                  Save Selection
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </BottomSheetModal>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, paddingHorizontal: 16 },

  header: { marginTop: 24, marginBottom: 14 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827", letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: "#6B7280", marginTop: 4 },

  // Progress
  progressWrap: { marginBottom: 16, gap: 6 },
  progressTrack: {
    height: 8, backgroundColor: "#E5E7EB", borderRadius: 4, overflow: "hidden",
  },
  progressFill: {
    height: "100%", backgroundColor: "#111827", borderRadius: 4,
  },
  progressLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },

  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  emptyText: { textAlign: "center", color: "#9CA3AF", marginTop: 40, fontSize: 14 },

  // Participant card
  personCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB",
    padding: 14, marginBottom: 8,
  },
  personCardAssigned: { borderColor: "#D1FAE5", backgroundColor: "#F0FDF4" },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  personInfo: { flex: 1, paddingRight: 8 },
  personName: { fontSize: 16, fontWeight: "600", color: "#111827" },
  personItems: { fontSize: 13, color: "#059669", marginTop: 3, fontWeight: "600" },
  personAmount: { fontSize: 13, color: "#059669", fontWeight: "700" },
  personUnassigned: { fontSize: 13, color: "#9CA3AF", marginTop: 3 },
  personRight: { alignItems: "center", justifyContent: "center" },
  assignedBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: "#059669", alignItems: "center", justifyContent: "center",
  },
  assignedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  assignedChipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#059669",
  },

  // Footer
  footer: {
    paddingVertical: 16, borderTopWidth: 1,
    borderColor: "#E5E7EB", backgroundColor: "#F9FAFB", gap: 8,
  },
  footerHint: { textAlign: "center", fontSize: 13, color: "#9CA3AF" },
  continueBtn: {
    backgroundColor: "#111827", paddingVertical: 16,
    borderRadius: 12, alignItems: "center",
  },
  continueBtnDisabled: { backgroundColor: "#9CA3AF" },
  continueBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },

  // Bottom sheet
  sheetOuter: { flex: 1 },
  sheetHeader: {
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12,
    borderBottomWidth: 1, borderColor: "#F3F4F6",
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  sheetSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 3, fontWeight: "500" },
  sheetList: { flex: 1 },
  sheetListContent: { paddingHorizontal: 20 },

  // Item row inside sheet
  itemRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, borderBottomWidth: 1, borderColor: "#F3F4F6",
  },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemName: { fontSize: 15, fontWeight: "500", color: "#111827" },
  itemPrice: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2,
    borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: "#111827", borderColor: "#111827" },

  // Sticky action bar / Footer
  sheetFooter: {
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  sheetFooterTop: {
    marginBottom: 12,
    alignItems: "center",
  },
  sheetFooterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sheetFooterAmount: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.4,
  },
  sheetFooterSep: {
    fontSize: 16,
    color: "#9CA3AF",
    fontWeight: "400",
  },
  sheetFooterCount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#4B5563",
  },
  sheetActions: {
    flexDirection: "row",
    gap: 12,
  },
  sheetCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: "#E5E7EB", alignItems: "center",
  },
  sheetCancelText: { color: "#374151", fontWeight: "600", fontSize: 15 },
  sheetSaveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: "#111827", alignItems: "center",
  },
  sheetSaveBtnDisabled: { backgroundColor: "#9CA3AF" },
  sheetSaveText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
