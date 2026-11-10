// ---------------------------------------------------------------------------
// components/ItemAssignmentSection.tsx
//
// Extracted inline item assignment component for Billy.
// Displays horizontal participant chips, an item checklist, and Next/Previous
// controls to assign bill items.
//
// Assignment is item-centric: unassigned items are valid (calculateSettlement
// splits them equally among everyone) and a participant with no items is valid
// too, so nothing here blocks Continue.
// ---------------------------------------------------------------------------

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";
import type { BillItem, Person } from "../types/bill";
import { C } from "@/constants/colors";

interface ItemAssignmentSectionProps {
  /** Shows a "View Settlement" button when provided. */
  onDone?: () => void;
  /** Called after every assignment change (already saved to billStore). */
  onChange?: () => void;
}

export default function ItemAssignmentSection({ onDone, onChange }: ItemAssignmentSectionProps) {
  const router = useRouter();

  // ── States ────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<BillItem[]>([]);
  const [participants, setParticipants] = useState<Person[]>([]);
  const [activePersonIndex, setActivePersonIndex] = useState(0);

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const store = billStore.get();
    if (!store) {
      router.replace("/");
      return;
    }
    setItems(store.bill.items as BillItem[]);
    setParticipants(store.participants);
  }, []);

  const activePerson = participants[activePersonIndex] || null;

  // ── Derived ────────────────────────────────────────────────────────────────
  // Progress is item-centric: a participant with no items is legitimate (they
  // simply owe ₹0), so completeness is measured over items, not people.
  const assignedItemCount = useMemo(
    () => items.filter((it) => participants.some((p) => p.itemIds.includes(it.id))).length,
    [items, participants]
  );

  const unassignedCount = items.length - assignedItemCount;

  const progressPct = items.length > 0
    ? Math.round((assignedItemCount / items.length) * 100)
    : 0;

  // Live amount for the active participant
  const activePersonTotal = useMemo(() => {
    if (!activePerson) return 0;

    // Find how many people share each item to divide correctly
    const itemShares: Record<string, number> = {};
    participants.forEach((p) => {
      p.itemIds.forEach((itemId) => {
        itemShares[itemId] = (itemShares[itemId] || 0) + 1;
      });
    });

    return items
      .filter((it) => activePerson.itemIds.includes(it.id))
      .reduce((sum, it) => {
        const shares = itemShares[it.id] || 1;
        return sum + (it.price ?? 0) / shares;
      }, 0);
  }, [activePerson, items, participants]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const toggleItem = useCallback((itemId: string) => {
    if (!activePerson) return;

    const currentItemIds = activePerson.itemIds || [];
    const isAssigned = currentItemIds.includes(itemId);
    const nextItemIds = isAssigned
      ? currentItemIds.filter((id) => id !== itemId)
      : [...currentItemIds, itemId];

    // Update local state
    const nextParticipants = participants.map((p, idx) => {
      if (idx === activePersonIndex) {
        return { ...p, itemIds: nextItemIds };
      }
      return p;
    });
    setParticipants(nextParticipants);

    // Persist immediately to billStore
    const store = billStore.get();
    if (store) {
      store.participants = nextParticipants;
    }
    onChange?.();
  }, [activePerson, activePersonIndex, participants, onChange]);

  const handlePrev = () => {
    if (activePersonIndex > 0) {
      setActivePersonIndex(activePersonIndex - 1);
    }
  };

  const handleNext = () => {
    if (activePersonIndex < participants.length - 1) {
      setActivePersonIndex(activePersonIndex + 1);
    }
  };

  // ── Render Helpers ─────────────────────────────────────────────────────────
  const renderParticipantChip = (person: Person, idx: number) => {
    const isSelected = idx === activePersonIndex;
    const count = person.itemIds.length;
    const isAssigned = count > 0;

    // Calculate subtotal for this participant (split items proportionally)
    const itemShares: Record<string, number> = {};
    participants.forEach((p) => {
      p.itemIds.forEach((itemId) => {
        itemShares[itemId] = (itemShares[itemId] || 0) + 1;
      });
    });
    const subtotal = items
      .filter((it) => person.itemIds.includes(it.id))
      .reduce((sum, it) => sum + (it.price ?? 0) / (itemShares[it.id] || 1), 0);

    return (
      <Pressable
        key={person.id}
        style={[
          styles.chip,
          isSelected && { borderColor: person.color, backgroundColor: C.white },
          isSelected && styles.chipSelected,
        ]}
        onPress={() => setActivePersonIndex(idx)}
      >
        <View style={[styles.avatar, { backgroundColor: person.color }]}>
          <Text style={styles.avatarText}>
            {person.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.chipTextContainer}>
          <Text style={[styles.chipName, isSelected && styles.chipNameSelected]}>
            {person.name}
          </Text>
          <Text style={styles.chipSub}>
            {isAssigned ? `₹${subtotal.toFixed(0)} (${count})` : "No items"}
          </Text>
        </View>
        {isAssigned && (
          <View style={styles.chipCheck}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}
      </Pressable>
    );
  };

  const renderItemRow = (item: BillItem) => {
    if (!activePerson) return null;
    const isChecked = activePerson.itemIds.includes(item.id);

    // Find other people sharing this item (excluding active person)
    const otherSharers = participants
      .filter((p) => p.id !== activePerson.id && p.itemIds.includes(item.id))
      .map((p) => p.name);

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [
          styles.itemRow,
          isChecked && styles.itemRowChecked,
          pressed && { backgroundColor: C.bg },
        ]}
        onPress={() => toggleItem(item.id)}
      >
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.name}</Text>
          {otherSharers.length > 0 && (
            <Text style={styles.itemSharers}>
              Shared with: {otherSharers.join(", ")}
            </Text>
          )}
        </View>
        <View style={styles.itemRight}>
          <Text style={styles.itemPrice}>₹{item.price.toFixed(2)}</Text>
          <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
            {isChecked && <Ionicons name="checkmark" size={14} color="#fff" />}
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Progress tracking */}
      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>
          {assignedItemCount} of {items.length} item{items.length !== 1 ? "s" : ""} assigned ({progressPct}%)
        </Text>
      </View>

      {/* Horizontal Participant chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsContent}
      >
        {participants.map(renderParticipantChip)}
      </ScrollView>

      {/* Active participant banner */}
      {activePerson && (
        <View style={[styles.activeBanner, { borderLeftColor: activePerson.color }]}>
          <View style={styles.activeBannerBlock}>
            <Text style={styles.activeBannerLabel}>Assigning to</Text>
            <Text style={styles.activeBannerValue} numberOfLines={2} ellipsizeMode="tail">
              {activePerson.name}
            </Text>
          </View>
          <View style={styles.activeBannerSep} />
          <View style={styles.activeBannerBlock}>
            <Text style={styles.activeBannerLabel}>Current share</Text>
            <Text style={styles.activeBannerValue}>₹{activePersonTotal.toFixed(2)}</Text>
          </View>
        </View>
      )}

      {/* Item checklist */}
      <View style={styles.listContainer}>
        {items.map(renderItemRow)}
        {items.length === 0 && (
          <Text style={styles.emptyText}>No items on the bill.</Text>
        )}
      </View>

      {/* Previous / Next selection controls */}
      {participants.length > 1 && (
        <View style={styles.navButtons}>
          <Pressable
            style={[styles.navBtn, activePersonIndex === 0 && styles.navBtnDisabled]}
            disabled={activePersonIndex === 0}
            onPress={handlePrev}
          >
            <Ionicons name="chevron-back" size={18} color={activePersonIndex === 0 ? C.textSubtle : C.text} />
            <Text style={[styles.navBtnText, activePersonIndex === 0 && styles.navBtnTextDisabled]}>Previous</Text>
          </Pressable>

          <Pressable
            style={[styles.navBtn, activePersonIndex === participants.length - 1 && styles.navBtnDisabled]}
            disabled={activePersonIndex === participants.length - 1}
            onPress={handleNext}
          >
            <Text style={[styles.navBtnText, activePersonIndex === participants.length - 1 && styles.navBtnTextDisabled]}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color={activePersonIndex === participants.length - 1 ? C.textSubtle : C.text} />
          </Pressable>
        </View>
      )}

      {/* Status warning box */}
      <View style={styles.statusBoxWrap}>
        {unassignedCount > 0 ? (
          <View style={styles.warningBox}>
            <Ionicons name="warning" size={16} color={C.warningDark} />
            <Text style={styles.warningText}>
              {unassignedCount === 1
                ? "1 item isn't assigned. Its cost will be split equally among all participants."
                : `${unassignedCount} items aren't assigned. Their cost will be split equally among all participants.`}
            </Text>
          </View>
        ) : (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={16} color={C.successDark} />
            <Text style={styles.successText}>All items assigned!</Text>
          </View>
        )}
      </View>

      {/* Continue Action */}
      {onDone && (
        <View style={styles.footer}>
          <Pressable style={styles.continueBtn} onPress={onDone}>
            <Text style={styles.continueBtnText}>View Settlement →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },

  // Progress
  progressWrap: {
    marginBottom: 16,
    gap: 6,
  },
  progressTrack: {
    height: 6,
    backgroundColor: C.border,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: C.primary,
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.text,
  },

  // Chips Scroll
  chipsScroll: {
    marginBottom: 16,
  },
  chipsContent: {
    paddingRight: 16,
    gap: 8,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    position: "relative",
  },
  chipSelected: {
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  avatarText: {
    color: C.white,
    fontWeight: "700",
    fontSize: 12,
  },
  chipTextContainer: {
    justifyContent: "center",
  },
  chipName: {
    fontSize: 13,
    fontWeight: "600",
    color: C.text,
  },
  chipNameSelected: {
    color: C.ink,
    fontWeight: "700",
  },
  chipSub: {
    fontSize: 10,
    color: C.textMuted,
  },
  chipCheck: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.successDark,
    alignItems: "center",
    justifyContent: "center",
  },

  // Active banner — label above value, stacked vertically
  activeBanner: {
    backgroundColor: C.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 16,
  },
  activeBannerBlock: {
    gap: 2,
  },
  activeBannerSep: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 10,
  },
  activeBannerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: C.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  activeBannerValue: {
    fontSize: 15,
    fontWeight: "700",
    color: C.ink,
  },

  // Item List
  listContainer: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    overflow: "hidden",
    marginBottom: 16,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: C.surfaceAlt,
  },
  itemRowChecked: {
    backgroundColor: C.successSoft,
  },
  itemInfo: {
    flex: 1,
    paddingRight: 12,
  },
  itemName: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
  },
  itemSharers: {
    fontSize: 11,
    color: C.successDark,
    fontWeight: "500",
    marginTop: 2,
  },
  itemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "700",
    color: C.ink,
  },
  checkbox: {
    width: 22,
    height: 22,
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
  emptyText: {
    textAlign: "center",
    color: C.textSubtle,
    paddingVertical: 20,
    fontSize: 14,
  },

  // Navigation between participants
  navButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  navBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.white,
  },
  navBtnDisabled: {
    opacity: 0.5,
    backgroundColor: C.surfaceAlt,
  },
  navBtnText: {
    fontSize: 13,
    fontWeight: "600",
    color: C.text,
  },
  navBtnTextDisabled: {
    color: C.textSubtle,
  },

  // Warnings / Statuses
  statusBoxWrap: {
    marginBottom: 20,
  },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.warningSoft,
    borderColor: "#FDE68A",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  warningText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#92400E",
    flex: 1,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: C.successSoft,
    borderColor: "#A7F3D0",
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  },
  successText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#065F46",
    flex: 1,
  },

  // Footer / Continue Button
  footer: {
    gap: 8,
  },
  continueBtn: {
    backgroundColor: C.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  continueBtnText: {
    color: C.white,
    fontWeight: "600",
    fontSize: 16,
  },
});
