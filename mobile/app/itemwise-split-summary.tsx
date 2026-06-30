// ---------------------------------------------------------------------------
// app/itemwise-split-summary.tsx
//
// Item-wise split result screen.
// Reads each participant's assigned itemIds from billStore, computes their
// items subtotal, then distributes charges (taxes, fees) proportionally.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, SafeAreaView,
  ScrollView, Modal, TextInput
} from "react-native";
import { useRouter } from "expo-router";
import { billStore } from "../services/billStore";
import { authStore } from "../services/authStore";
import { groupStore } from "../services/groupStore";
import { calculateSettlement } from "../services/calculateSettlement";
import type { BillGroup } from "../types/group";
import type { BillItem } from "../types/bill";
import type { ParticipantTotal, SettlementTransaction } from "../services/calculateSettlement";
import { Ionicons } from "@expo/vector-icons";
// Removed inline computeRows ent
// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function ItemwiseSplitSummaryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<ParticipantTotal[]>([]);
  const [settlementLines, setSettlementLines] = useState<Record<string, string>>({});
  const [itemNamesMap, setItemNamesMap] = useState<Record<string, string[]>>({});
  const [itemObjectsMap, setItemObjectsMap] = useState<Record<string, BillItem[]>>({});
  const [billTotal, setBillTotal] = useState(0);
  const [restaurantName, setRestaurantName] = useState("");
  const [chargesTotal, setChargesTotal] = useState(0);
  const [unassignedItems, setUnassignedItems] = useState<BillItem[]>([]);
  const [showUnassignedModal, setShowUnassignedModal] = useState(false);
  const [transactions, setTransactions] = useState<SettlementTransaction[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const store = billStore.get();
    if (!store) { router.replace("/"); return; }

    const allItems = (store.bill.items || []) as BillItem[];

    // Detect unassigned items
    const assignedItemIds = new Set<string>();
    store.participants.forEach((p) => p.itemIds.forEach((id) => assignedItemIds.add(id)));
    const unassigned = allItems.filter((it) => !assignedItemIds.has(it.id));
    setUnassignedItems(unassigned);
    if (unassigned.length > 0) setShowUnassignedModal(true);

    const gstAmount = store.bill.gst ?? 0;
    const serviceCharge = store.bill.serviceCharge ?? 0;
    const totalCharges = (store.bill.charges ?? []).reduce((s, c) => s + c.amount, 0);
    const additionalCharges = totalCharges - gstAmount - serviceCharge;

    const result = calculateSettlement({
      payerId: store.payerId ?? "",
      splitMethod: "itemwise",
      participants: store.participants,
      items: allItems,
      gstAmount,
      serviceCharge,
      additionalCharges,
    });

    const lines: Record<string, string> = {};
    const namesMap: Record<string, string[]> = {};
    const objsMap: Record<string, BillItem[]> = {};
    const payer = store.participants.find((p) => p.id === store.payerId);
    const payerIsMe = payer?.isCurrentUser === true;

    result.participantTotals.forEach((pt) => {
      const person = store.participants.find(p => p.id === pt.personId);
      const isMe = person?.isCurrentUser === true;
      const isPayer = pt.personId === store.payerId;
      let line = "";
      if (isPayer) line = "Paid the bill";
      else if (payerIsMe) line = `${pt.personName} owes You ₹${pt.total.toFixed(2)}`;
      else if (isMe && payer) line = `You owe ${payer.name} ₹${pt.total.toFixed(2)}`;
      else if (payer) line = `${pt.personName} owes ${payer.name} ₹${pt.total.toFixed(2)}`;
      lines[pt.personId] = line;

      // Extract item names
      namesMap[pt.personId] = person?.itemIds
        .map((id) => store.bill.items.find((it) => it.id === id)?.name ?? "")
        .filter(Boolean) ?? [];

      // Extract full item objects
      objsMap[pt.personId] = (person?.itemIds ?? [])
        .map((id) => store.bill.items.find((it: BillItem) => it.id === id))
        .filter(Boolean) as BillItem[];
    });

    setRows(result.participantTotals);
    setSettlementLines(lines);
    setItemNamesMap(namesMap);
    setItemObjectsMap(objsMap);
    setTransactions(result.settlements);
    setBillTotal(store.bill.total ?? 0);
    setRestaurantName(store.bill.restaurant ?? "");
    setGroupTitle(store.bill.restaurant || "Untitled Bill");
    setChargesTotal(totalCharges);
  }, []);

  const handleCreateGroup = async () => {
    const user = authStore.get().user;
    const store = billStore.get();
    if (!user || !store) return;

    const newGroup: BillGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: groupTitle.trim() || "Untitled Bill",
      createdBy: user.uid,
      participants: [...store.participants],
      settlements: (transactions || []).map(tx => ({ ...tx, status: "pending" })),
      totalAmount: store.bill.total ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
      billSnapshot: store.bill,
    };

    await groupStore.createGroup(newGroup);
    setShowSaveModal(false);
    router.replace("/(tabs)/pay-bills" as any);
  };

  return (
    <SafeAreaView style={s.safeArea}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.title}>Item-wise Split</Text>
          {restaurantName ? <Text style={s.restaurant}>{restaurantName}</Text> : null}
        </View>



        {/* Summary card */}
        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total Amount</Text>
            <Text style={s.summaryValue}>₹{billTotal.toFixed(2)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Participants</Text>
            <Text style={s.summaryValue}>{rows.length}</Text>
          </View>
          {chargesTotal !== 0 && (
            <>
              <View style={s.divider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Taxes & Charges</Text>
                <Text style={s.summaryValue}>₹{chargesTotal.toFixed(2)}</Text>
              </View>
            </>
          )}
          <View style={s.divider} />
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Split Method</Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>Item-wise</Text>
            </View>
          </View>
        </View>

        {/* Per-person breakdown */}
        <Text style={s.sectionLabel}>Breakdown</Text>
        <View style={s.personList}>
          {rows.map((pt, idx) => {
            const p = billStore.get()?.participants.find(x => x.id === pt.personId);
            const personItems = itemObjectsMap[pt.personId] || [];
            const isExpanded = expandedId === pt.personId;
            const chargesShare = pt.taxShare + pt.serviceChargeShare + pt.additionalChargesShare;

            return (
              <View
                key={pt.personId}
                style={[s.personRow, idx < rows.length - 1 && !isExpanded && s.personRowBorder]}
              >
                {/* Tappable header row */}
                <Pressable
                  style={s.personRowHeader}
                  onPress={() => setExpandedId(isExpanded ? null : pt.personId)}
                >
                  {/* Avatar */}
                  <View style={[s.avatar, { backgroundColor: p?.color ?? "#111827" }]}>
                    <Text style={s.avatarText}>{pt.personName.charAt(0).toUpperCase()}</Text>
                  </View>

                  {/* Info */}
                  <View style={s.personInfo}>
                    <Text style={s.personName}>{pt.personName}</Text>
                    {settlementLines[pt.personId] ? (
                      <Text style={s.settleLine}>{settlementLines[pt.personId]}</Text>
                    ) : null}
                    <Text style={s.expandHint}>
                      {isExpanded ? "Tap to collapse" : `${personItems.length} item${personItems.length !== 1 ? "s" : ""}  ·  Tap to expand`}
                    </Text>
                  </View>

                  {/* Total + chevron */}
                  <View style={s.amounts}>
                    <Text style={s.personTotal}>₹{pt.total.toFixed(2)}</Text>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#9CA3AF"
                      style={{ marginTop: 4, alignSelf: "flex-end" }}
                    />
                  </View>
                </Pressable>

                {/* Expanded detail panel */}
                {isExpanded && (
                  <View style={s.expandedPanel}>
                    {/* Item rows */}
                    {personItems.map((it) => (
                      <View key={it.id} style={s.expandedItemRow}>
                        <Text style={s.expandedItemName} numberOfLines={1}>{it.name}</Text>
                        <Text style={s.expandedItemPrice}>₹{(it.price ?? it.amount ?? 0).toFixed(2)}</Text>
                      </View>
                    ))}
                    {personItems.length === 0 && (
                      <Text style={s.expandedNoItems}>No items assigned</Text>
                    )}

                    {/* Charges row */}
                    {chargesShare > 0 && (
                      <View style={s.expandedItemRow}>
                        <Text style={[s.expandedItemName, { color: "#6B7280" }]}>Taxes &amp; Charges</Text>
                        <Text style={[s.expandedItemPrice, { color: "#6B7280" }]}>+₹{chargesShare.toFixed(2)}</Text>
                      </View>
                    )}

                    {/* Total footer */}
                    <View style={s.expandedTotal}>
                      <Text style={s.expandedTotalLabel}>Total</Text>
                      <Text style={s.expandedTotalValue}>₹{pt.total.toFixed(2)}</Text>
                    </View>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <Pressable style={s.changeBtn} onPress={() => router.back()}>
            <Ionicons name="swap-horizontal" size={16} color="#374151" />
            <Text style={s.changeBtnText}>Back to Assignment</Text>
          </Pressable>
          <Pressable style={s.doneBtn} onPress={() => setShowSaveModal(true)}>
            <Text style={s.doneBtnText}>Done ✓</Text>
          </Pressable>
        </View>

      </ScrollView>

      {/* ── Unassigned items themed modal ── */}
      <Modal
        visible={showUnassignedModal}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            {/* Icon + title */}
            <View style={s.modalIconWrap}>
              <Ionicons name="warning" size={28} color="#D97706" />
            </View>
            <Text style={s.modalTitle}>Unassigned Items</Text>
            <Text style={s.modalSubtitle}>
              {unassignedItems.length} item{unassignedItems.length !== 1 ? "s" : ""} weren’t assigned to anyone.
              They will be split equally among all participants.
            </Text>

            {/* Item list */}
            <View style={s.modalItemList}>
              {unassignedItems.map((it) => (
                <View key={it.id} style={s.modalItemRow}>
                  <View style={s.modalItemDot} />
                  <Text style={s.modalItemName} numberOfLines={1}>{it.name}</Text>
                  <Text style={s.modalItemPrice}>₹{it.price.toFixed(2)}</Text>
                </View>
              ))}
              {unassignedItems.length > 0 && (
                <View style={s.modalItemTotalRow}>
                  <Text style={s.modalItemTotalLabel}>Unassigned total</Text>
                  <Text style={s.modalItemTotalValue}>
                    ₹{unassignedItems.reduce((s, it) => s + it.price, 0).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>

            {/* Actions */}
            <View style={s.modalActions}>
              <Pressable
                style={s.modalBtnSecondary}
                onPress={() => { setShowUnassignedModal(false); router.back(); }}
              >
                <Text style={s.modalBtnSecondaryText}>Go Back & Assign</Text>
              </Pressable>
              <Pressable
                style={s.modalBtnPrimary}
                onPress={() => setShowUnassignedModal(false)}
              >
                <Text style={s.modalBtnPrimaryText}>Split Equally</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {/* ── Save Group Modal ── */}
      <Modal visible={showSaveModal} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Save Group</Text>
            <Text style={s.modalSubtitle}>Create a group to track these payments.</Text>
            
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>Group Name</Text>
              <TextInput
                style={s.input}
                value={groupTitle}
                onChangeText={setGroupTitle}
                placeholder="e.g. Friday Dinner"
                placeholderTextColor="#9CA3AF"
                autoFocus
              />
            </View>

            <View style={s.modalActions}>
              <Pressable style={s.modalBtnSecondary} onPress={() => setShowSaveModal(false)}>
                <Text style={s.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalBtnPrimary} onPress={handleCreateGroup}>
                <Text style={s.modalBtnPrimaryText}>Create Group</Text>
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
const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  header: { marginTop: 28, marginBottom: 24 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827", letterSpacing: -0.5 },
  restaurant: { fontSize: 15, fontWeight: "600", color: "#1D4ED8", marginTop: 4 },

  summaryCard: { backgroundColor: "#111827", borderRadius: 20, padding: 20, marginBottom: 28 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  summaryLabel: { fontSize: 14, color: "#9CA3AF", fontWeight: "500" },
  summaryValue: { fontSize: 16, color: "#F9FAFB", fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#374151", marginVertical: 4 },
  badge: {
    backgroundColor: "#059669",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  badgeText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  sectionLabel: {
    fontSize: 13, fontWeight: "600", color: "#6B7280",
    textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12,
  },
  personList: {
    backgroundColor: "#fff", borderRadius: 16,
    borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 28, overflow: "hidden",
  },
  personRow: {
    flexDirection: "column",
  },
  personRowBorder: { borderBottomWidth: 1, borderColor: "#F3F4F6" },

  personRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  expandHint: { fontSize: 12, color: "#9CA3AF", marginTop: 3 },

  // Expanded detail panel
  expandedPanel: {
    marginHorizontal: 16,
    marginBottom: 14,
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  expandedItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
  },
  expandedItemName: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "500", paddingRight: 12 },
  expandedItemPrice: { fontSize: 14, fontWeight: "600", color: "#111827" },
  expandedNoItems: { fontSize: 13, color: "#EF4444", padding: 14 },
  expandedTotal: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "#111827",
  },
  expandedTotalLabel: { fontSize: 14, fontWeight: "700", color: "#9CA3AF" },
  expandedTotalValue: { fontSize: 16, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.3 },

  avatar: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: "center", justifyContent: "center", marginRight: 12, marginTop: 2,
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },

  personInfo: { flex: 1, paddingRight: 8 },
  personName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  itemList: { fontSize: 12, color: "#6B7280", marginTop: 2, lineHeight: 17 },
  settleLine: { fontSize: 12, color: "#059669", marginTop: 4, fontWeight: "600" },

  breakdownRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  breakdownText: { fontSize: 11, color: "#9CA3AF" },

  amounts: { alignItems: "flex-end" },
  personTotal: { fontSize: 16, fontWeight: "700", color: "#111827" },

  actions: { gap: 12 },
  changeBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff",
  },
  changeBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  doneBtn: { backgroundColor: "#111827", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  // Unassigned warning banner
  warnBanner: {
    backgroundColor: "#FEF3C7",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 14,
    marginBottom: 20,
    gap: 6,
  },
  warnBannerHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  warnBannerTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: "#92400E" },
  warnItemRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  warnItemDot: { fontSize: 14, color: "#B45309" },
  warnItemName: { flex: 1, fontSize: 13, color: "#78350F" },
  warnItemPrice: { fontSize: 13, fontWeight: "600", color: "#78350F" },
  warnItemNote: { fontSize: 12, color: "#92400E", marginTop: 6, fontStyle: "italic" },

  // Themed unassigned modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 20,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  modalItemList: {
    backgroundColor: "#F9FAFB",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 24,
  },
  modalItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
    gap: 10,
  },
  modalItemDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#D97706",
  },
  modalItemName: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "500" },
  modalItemPrice: { fontSize: 14, fontWeight: "700", color: "#374151" },
  modalItemTotalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#F3F4F6",
  },
  modalItemTotalLabel: { flex: 1, fontSize: 13, color: "#6B7280", fontWeight: "600" },
  modalItemTotalValue: { fontSize: 15, fontWeight: "700", color: "#111827" },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  modalBtnSecondaryText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  modalBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  modalBtnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  
  // Save Modal overrides
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 6 },
  modalSubtitle: { fontSize: 15, color: "#6B7280", marginBottom: 20, lineHeight: 22 },
  inputWrap: { marginBottom: 24 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, height: 52, fontSize: 16, color: "#111827", backgroundColor: "#F9FAFB" },
});
