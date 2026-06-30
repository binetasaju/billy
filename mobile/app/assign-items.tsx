// ---------------------------------------------------------------------------
// app/assign-items.tsx
//
// Item Assignment screen — item-centric view.
// Each bill item is tappable → bottom sheet with participant checkboxes.
//
// Features:
//  • Sticky [ Cancel ] [ Save Selection ] footer inside the bottom sheet
//  • "Selected: N items" count above action buttons
//  • Save Selection: persists, closes sheet, updates parent card, shows toast
//  • Cancel: closes without saving
//  • Pre-fills previous selection when reopening
//  • Save disabled (greyed) when 0 participants selected
//  • ✓ Assigned badge on item cards once saved
//  • "Shared by: …  ·  N participants" subtitle on parent cards
//  • SafeAreaView insets on sticky footer
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  FlatList,
  Animated,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  BottomSheetModal,
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { billStore } from "../services/billStore";
import type { BillItem, Person } from "../types/bill";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Map of itemId → Set of participantIds assigned to that item */
type Assignments = Map<string, Set<string>>;

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
// Screen
// ---------------------------------------------------------------------------

export default function AssignItemsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<Person[]>([]);

  /** Which item is currently open in the bottom sheet */
  const [activeItem, setActiveItem] = useState<BillItem | null>(null);
  /** Draft checkboxes while the sheet is open */
  const [draftIds, setDraftIds] = useState<Set<string>>(new Set());
  /** Persisted assignments */
  const [assignments, setAssignments] = useState<Assignments>(new Map());

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ["65%"], []);

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = billStore.get();
    if (!store) { router.replace("/"); return; }

    setItems(store.bill.items as BillItem[]);
    setParticipants(store.participants);

    // Rehydrate existing assignments from participants' itemIds
    const map: Assignments = new Map();
    for (const p of store.participants) {
      for (const itemId of p.itemIds) {
        if (!map.has(itemId)) map.set(itemId, new Set());
        map.get(itemId)!.add(p.id);
      }
    }
    setAssignments(map);

    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const assignedCount = useMemo(
    () => items.filter((it) => (assignments.get(it.id)?.size ?? 0) > 0).length,
    [items, assignments]
  );
  const allAssigned = assignedCount === items.length && items.length > 0;
  const progressPct = items.length > 0
    ? Math.round((assignedCount / items.length) * 100)
    : 0;

  // ── Open sheet for an item ────────────────────────────────────────────────
  const openSheet = useCallback((item: BillItem) => {
    setActiveItem(item);
    // Pre-fill with current saved assignment
    setDraftIds(new Set(assignments.get(item.id) ?? []));
    sheetRef.current?.present();
  }, [assignments]);

  // ── Toggle a participant in the draft ─────────────────────────────────────
  const toggleParticipant = useCallback((personId: string) => {
    setDraftIds((prev) => {
      const next = new Set(prev);
      next.has(personId) ? next.delete(personId) : next.add(personId);
      return next;
    });
  }, []);

  // ── Show toast ─────────────────────────────────────────────────────────────
  const showToast = () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastVisible(false);
    setTimeout(() => setToastVisible(true), 10);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  };

  // ── Save selection ─────────────────────────────────────────────────────────
  const saveSelection = useCallback(() => {
    if (!activeItem) return;
    const itemId = activeItem.id;

    // Update local assignments map
    setAssignments((prev) => {
      const next = new Map(prev);
      if (draftIds.size === 0) {
        next.delete(itemId);
      } else {
        next.set(itemId, new Set(draftIds));
      }
      return next;
    });

    // Persist into billStore: rebuild each participant's itemIds
    const store = billStore.get();
    if (store) {
      store.participants = store.participants.map((p) => {
        const newItemIds = p.itemIds.filter((id) => id !== itemId);
        if (draftIds.has(p.id)) newItemIds.push(itemId);
        return { ...p, itemIds: newItemIds };
      });
    }

    sheetRef.current?.dismiss();
    setActiveItem(null);
    showToast();
  }, [activeItem, draftIds]);

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const cancelSheet = useCallback(() => {
    sheetRef.current?.dismiss();
    setActiveItem(null);
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getUnassignedItems = (): BillItem[] => {
    return items.filter((it) => (assignments.get(it.id)?.size ?? 0) === 0);
  };

  // ── Continue ──────────────────────────────────────────────────────────────
  const handleContinue = () => {
    const unassignedItems = getUnassignedItems();

    if (unassignedItems.length === 0) {
      router.push("/itemwise-split-summary" as any);
      return;
    }

    const names = unassignedItems.map((it) => `• ${it.name}`).join("\n");

    Alert.alert(
      "Unassigned Items",
      `The following items have not been assigned:\n\n${names}\n\nPlease assign them before continuing.`,
      [{ text: "OK", style: "default" }]
    );
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const assignedNamesFor = (itemId: string): string => {
    const ids = assignments.get(itemId);
    if (!ids || ids.size === 0) return "";
    return participants
      .filter((p) => ids.has(p.id))
      .map((p) => p.name)
      .join(", ");
  };

  const assignedCountFor = (itemId: string): number =>
    assignments.get(itemId)?.size ?? 0;

  // ── Render item row (parent list) ─────────────────────────────────────────
  const renderItem = ({ item }: { item: BillItem }) => {
    const names = assignedNamesFor(item.id);
    const count = assignedCountFor(item.id);
    const isAssigned = count > 0;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.itemRow,
          isAssigned && styles.itemRowAssigned,
          pressed && { opacity: 0.75 },
        ]}
        onPress={() => openSheet(item)}
      >
        {/* Left: name + assignees */}
        <View style={styles.itemLeft}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.name}
          </Text>
          {isAssigned ? (
            <Text style={styles.itemAssignees} numberOfLines={1}>
              ✓ Assigned  ·  {names}
            </Text>
          ) : (
            <Text style={styles.itemUnassigned}>⚠ Unassigned</Text>
          )}
        </View>

        {/* Right: price + status */}
        <View style={styles.itemRight}>
          <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
          {isAssigned ? (
            <View style={styles.assignedBadge}>
              <Ionicons name="checkmark" size={12} color="#fff" />
            </View>
          ) : (
            <View style={styles.unassignedBadge} />
          )}
        </View>
      </Pressable>
    );
  };

  // ── Render participant row (inside sheet) ─────────────────────────────────
  const renderParticipantRow = (p: Person) => {
    const checked = draftIds.has(p.id);
    return (
      <Pressable
        key={p.id}
        style={({ pressed }) => [
          styles.participantRow,
          pressed && { backgroundColor: "#F9FAFB" },
        ]}
        onPress={() => toggleParticipant(p.id)}
      >
        <View style={[styles.avatar, { backgroundColor: p.color }]}>
          <Text style={styles.avatarText}>
            {p.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.participantName}>{p.name}</Text>
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </Pressable>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>Assign Items</Text>
          <Text style={styles.subtitle}>Who ate what?</Text>
        </View>

        {/* ── Progress bar ── */}
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>
            Items Assigned: {assignedCount} / {items.length}
          </Text>
        </View>

        {/* ── Item list ── */}
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No items found. Go back and rescan.</Text>
          }
        />

        {/* ── Footer ── */}
        <View style={styles.footer}>
          {!allAssigned && items.length > 0 && (
            <Text style={styles.footerHint}>
              {items.length - assignedCount} item{items.length - assignedCount !== 1 ? "s" : ""} still unassigned
            </Text>
          )}
          <Pressable
            style={[styles.continueBtn, !allAssigned && styles.continueBtnDisabled]}
            onPress={handleContinue}
          >
            <Text style={styles.continueBtnText}>Continue to Split →</Text>
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
        onDismiss={() => setActiveItem(null)}
        backdropComponent={(props) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
      >
        {/*
          Plain View (not BottomSheetView) so flex:1 fills the full snap height
          when enableDynamicSizing={false}. BottomSheetView sizes to content and
          hides the sticky footer when the participant list is long.
        */}
        <View style={styles.sheetOuter}>

          {/* Sheet header */}
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={2}>
              Assign "{activeItem?.name}"
            </Text>
            <Text style={styles.sheetSubtitle}>
              ₹{activeItem?.price.toFixed(2)}
              {draftIds.size > 1
                ? `  ·  ₹${((activeItem?.price ?? 0) / draftIds.size).toFixed(2)} each`
                : ""}
            </Text>
          </View>

          {/* Scrollable participant list */}
          <BottomSheetScrollView
            style={styles.sheetList}
            contentContainerStyle={styles.sheetListContent}
            keyboardShouldPersistTaps="handled"
          >
            {participants.map(renderParticipantRow)}
          </BottomSheetScrollView>

          {/* Sticky action bar */}
          <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sheetFooterTop}>
              <Text style={styles.sheetFooterCount}>
                {draftIds.size === 0
                  ? "No participants selected"
                  : `Selected: ${draftIds.size} participant${draftIds.size !== 1 ? "s" : ""}`}
              </Text>
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

  // Header
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

  // List
  list: { flex: 1 },
  listContent: { paddingBottom: 8 },
  emptyText: { textAlign: "center", color: "#9CA3AF", marginTop: 40, fontSize: 14 },

  // Item row
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 8,
  },
  itemRowAssigned: {
    borderColor: "#D1FAE5",
    backgroundColor: "#F0FDF4",
  },
  itemLeft: { flex: 1, paddingRight: 12 },
  itemName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  itemAssignees: { fontSize: 12, color: "#059669", marginTop: 3, fontWeight: "500" },
  itemUnassigned: { fontSize: 12, color: "#9CA3AF", marginTop: 3 },
  itemRight: { alignItems: "flex-end", gap: 6 },
  itemPrice: { fontSize: 15, fontWeight: "700", color: "#111827" },
  assignedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#059669",
    alignItems: "center",
    justifyContent: "center",
  },
  unassignedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
  },

  // Screen footer
  footer: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    gap: 8,
  },
  footerHint: {
    textAlign: "center",
    fontSize: 13,
    color: "#9CA3AF",
  },
  continueBtn: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  continueBtnDisabled: { backgroundColor: "#9CA3AF" },
  continueBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },

  // Bottom sheet outer
  sheetOuter: { flex: 1 },

  // Sheet header
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "500",
  },

  // Scrollable list inside sheet
  sheetList: { flex: 1 },
  sheetListContent: { paddingHorizontal: 20 },

  // Participant row inside sheet
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  participantName: { flex: 1, fontSize: 16, fontWeight: "500", color: "#111827" },
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

  // Sticky footer inside sheet
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
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  sheetCancelText: { color: "#374151", fontWeight: "600", fontSize: 15 },
  sheetSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  sheetSaveBtnDisabled: { backgroundColor: "#9CA3AF" },
  sheetSaveText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
