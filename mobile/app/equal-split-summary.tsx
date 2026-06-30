// ---------------------------------------------------------------------------
// app/equal-split-summary.tsx — Equal split result screen
// ---------------------------------------------------------------------------
import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, SafeAreaView, ScrollView, Modal, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";
import { authStore } from "../services/authStore";
import { groupStore } from "../services/groupStore";
import { calculateSettlement } from "../services/calculateSettlement";
import type { Person, BillItem } from "../types/bill";
import type { ParticipantTotal, SettlementTransaction } from "../services/calculateSettlement";
import type { BillGroup } from "../types/group";

export default function EqualSplitSummaryScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<ParticipantTotal[]>([]);
  const [settlementLines, setSettlementLines] = useState<Record<string, string>>({});
  const [transactions, setTransactions] = useState<SettlementTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [restaurantName, setRestaurantName] = useState("");

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");

  useEffect(() => {
    const store = billStore.get();
    if (!store) { router.replace("/"); return; }
    const gstAmount = store.bill.gst ?? 0;
    const serviceCharge = store.bill.serviceCharge ?? 0;
    const totalCharges = (store.bill.charges ?? []).reduce((s, c) => s + c.amount, 0);
    const additionalCharges = totalCharges - gstAmount - serviceCharge;

    const result = calculateSettlement({
      payerId: store.payerId ?? "",
      splitMethod: "equal",
      participants: store.participants,
      items: (store.bill.items || []) as BillItem[],
      gstAmount,
      serviceCharge,
      additionalCharges,
    });

    const lines: Record<string, string> = {};
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
    });

    setRows(result.participantTotals);
    setSettlementLines(lines);
    setTransactions(result.settlements);
    setTotal(store.bill.total ?? 0);
    setRestaurantName(store.bill.restaurant ?? "");
    setGroupTitle(store.bill.restaurant || "Untitled Bill");
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
        <View style={s.header}>
          <Text style={s.title}>Equal Split</Text>
          {restaurantName ? <Text style={s.restaurant}>{restaurantName}</Text> : null}
        </View>

        {/* Summary card */}
        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Total Amount</Text>
            <Text style={s.summaryValue}>₹{total.toFixed(2)}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>Participants</Text>
            <Text style={s.summaryValue}>{rows.length}</Text>
          </View>
          {rows.length > 0 && (
            <>
              <View style={s.divider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Each Pays</Text>
                <Text style={[s.summaryValue, s.highlight]}>₹{rows[0]?.total.toFixed(2)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Per-person breakdown */}
        <Text style={s.sectionLabel}>Breakdown</Text>
        <View style={s.personList}>
          {rows.map((pt, idx) => {
            const p = billStore.get()?.participants.find(x => x.id === pt.personId);
            return (
              <View key={pt.personId} style={[s.personRow, idx < rows.length - 1 && s.personRowBorder]}>
                <View style={[s.avatar, { backgroundColor: p?.color ?? "#111827" }]}>
                  <Text style={s.avatarText}>{pt.personName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={s.personInfo}>
                  <Text style={s.personName}>{pt.personName}</Text>
                  {settlementLines[pt.personId] ? <Text style={s.settleLine}>{settlementLines[pt.personId]}</Text> : null}
                  <View style={s.breakdownRow}>
                    <Text style={s.breakdownText}>Food: ₹{pt.itemsTotal.toFixed(2)}</Text>
                    {pt.taxShare > 0 && <Text style={s.breakdownText}> • GST: ₹{pt.taxShare.toFixed(2)}</Text>}
                    {pt.serviceChargeShare > 0 && <Text style={s.breakdownText}> • S.C.: ₹{pt.serviceChargeShare.toFixed(2)}</Text>}
                    {pt.additionalChargesShare > 0 && <Text style={s.breakdownText}> • Fees: ₹{pt.additionalChargesShare.toFixed(2)}</Text>}
                  </View>
                </View>
                <Text style={s.personShare}>₹{pt.total.toFixed(2)}</Text>
              </View>
            );
          })}
        </View>

        {/* Actions */}
        <View style={s.actions}>
          <Pressable style={s.changeBtn} onPress={() => router.back()}>
            <Ionicons name="swap-horizontal" size={16} color="#374151" />
            <Text style={s.changeBtnText}>Change Split Method</Text>
          </Pressable>
          <Pressable style={s.doneBtn} onPress={() => setShowSaveModal(true)}>
            <Text style={s.doneBtnText}>Done ✓</Text>
          </Pressable>
        </View>
      </ScrollView>

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
  highlight: { color: "#34D399", fontSize: 20 },
  divider: { height: 1, backgroundColor: "#374151", marginVertical: 4 },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: "#6B7280", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 12 },
  personList: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 28, overflow: "hidden" },
  personRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  personRowBorder: { borderBottomWidth: 1, borderColor: "#F3F4F6" },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  personInfo: { flex: 1 },
  personName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  settleLine: { fontSize: 12, color: "#059669", marginTop: 2, fontWeight: "600" },
  breakdownRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  breakdownText: { fontSize: 11, color: "#9CA3AF" },
  personShare: { fontSize: 16, fontWeight: "700", color: "#111827" },
  actions: { gap: 12 },
  changeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  changeBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  doneBtn: { backgroundColor: "#111827", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 10 },
  modalTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 6 },
  modalSubtitle: { fontSize: 15, color: "#6B7280", marginBottom: 20, lineHeight: 22 },
  inputWrap: { marginBottom: 24 },
  inputLabel: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 16, height: 52, fontSize: 16, color: "#111827", backgroundColor: "#F9FAFB" },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: "#F3F4F6" },
  modalBtnSecondaryText: { color: "#4B5563", fontSize: 15, fontWeight: "600" },
  modalBtnPrimary: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: "#1D4ED8" },
  modalBtnPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
