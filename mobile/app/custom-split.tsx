// ---------------------------------------------------------------------------
// app/custom-split.tsx — Custom amounts split
//
// Everyone starts with an equal share. Typing an amount for a person "locks"
// it; everyone not locked re-balances to share what is left, so the total
// always matches the bill while you type. Done is enabled only when the
// amounts add up to the bill exactly.
//
// The payer can set their own share to ₹0 — this is how "I paid for my
// friends" works.
// ---------------------------------------------------------------------------
import { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";
import { authStore } from "../services/authStore";
import { saveSplit } from "../services/saveSplit";
import {
  calculateSettlement,
  rebalanceCustomAmounts,
  remainingToAssign,
} from "../services/calculateSettlement";
import type { BillItem, Person } from "../types/bill";
import type { BillGroup } from "../types/group";

export default function CustomSplitScreen() {
  const router = useRouter();
  const [participants, setParticipants] = useState<Person[]>([]);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [billTotal, setBillTotal] = useState(0);
  const [restaurantName, setRestaurantName] = useState("");

  /** Amounts the user typed (locked). */
  const [locked, setLocked] = useState<Record<string, number>>({});
  /** Raw text in each input, so partial input like "12." isn't reformatted. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");

  useEffect(() => {
    const store = billStore.get();
    if (!store) { router.replace("/"); return; }
    setParticipants(store.participants);
    setPayerId(store.payerId);
    setBillTotal(store.bill.total ?? 0);
    setRestaurantName(store.bill.restaurant ?? "");
    setGroupTitle(store.bill.restaurant || "Untitled Bill");

    // Editing a saved custom split: start from the agreed amounts, as long as
    // they still add up to the (possibly edited) bill total.
    const saved = store.customAmounts;
    if (saved) {
      const ids = store.participants.map((p) => p.id);
      const prefill: Record<string, number> = {};
      ids.forEach((id) => { if (id in saved) prefill[id] = saved[id]; });
      if (Object.keys(prefill).length === ids.length && remainingToAssign(store.bill.total ?? 0, prefill) === 0) {
        setLocked(prefill);
        setDrafts(Object.fromEntries(Object.entries(prefill).map(([k, v]) => [k, String(v)])));
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  const personIds = useMemo(() => participants.map((p) => p.id), [participants]);
  const amounts = useMemo(
    () => rebalanceCustomAmounts(billTotal, personIds, locked),
    [billTotal, personIds, locked]
  );
  const remaining = remainingToAssign(billTotal, amounts);
  const balanced = Math.abs(remaining) < 0.01;
  const payer = participants.find((p) => p.id === payerId);

  const handleChange = (id: string, text: string) => {
    const clean = text.replace(/[^0-9.]/g, "");
    setDrafts((d) => ({ ...d, [id]: clean }));
    const value = parseFloat(clean);
    setLocked((l) => {
      const next = { ...l };
      if (clean === "" || !Number.isFinite(value)) delete next[id];
      else next[id] = value;
      return next;
    });
  };

  const handleUnlock = (id: string) => {
    setLocked((l) => { const next = { ...l }; delete next[id]; return next; });
    setDrafts((d) => { const next = { ...d }; delete next[id]; return next; });
  };

  const handleResetEqual = () => { setLocked({}); setDrafts({}); };

  const handleCreateGroup = async () => {
    const user = authStore.get().user;
    const store = billStore.get();
    if (!user || !store || !balanced) return;

    const gstAmount = store.bill.gst ?? 0;
    const serviceCharge = store.bill.serviceCharge ?? 0;
    const totalCharges = (store.bill.charges ?? []).reduce((s, c) => s + c.amount, 0);
    const result = calculateSettlement({
      payerId: store.payerId ?? "",
      splitMethod: "custom",
      participants: store.participants,
      items: (store.bill.items || []) as BillItem[],
      gstAmount,
      serviceCharge,
      additionalCharges: totalCharges - gstAmount - serviceCharge,
      customAmounts: amounts,
    });

    const newGroup: BillGroup = {
      id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      title: groupTitle.trim() || "Untitled Bill",
      createdBy: user.uid,
      participants: [...store.participants],
      settlements: result.settlements.map((tx) => ({ ...tx, status: "pending" })),
      totalAmount: store.bill.total ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "active",
      billSnapshot: store.bill,
      contactGroupId: store.contactGroupId ?? undefined,
      splitMethod: "custom",
      customAmounts: amounts,
    };

    const wasEditing = !!store.editingGroupId;
    let savedId: string;
    try {
      savedId = await saveSplit(newGroup);
    } catch (e) {
      setShowSaveModal(false);
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
      return;
    }
    setShowSaveModal(false);
    if (wasEditing) router.dismissTo(`/group/${savedId}` as any);
    else router.replace("/(tabs)/pay-bills" as any);
  };

  const owesLine = (p: Person, amount: number) => {
    if (p.id === payerId) return amount === 0 ? "Paid the bill (covers others)" : "Paid the bill";
    if (amount === 0 || !payer) return "Owes nothing";
    if (payer.isCurrentUser) return `Owes you ₹${amount.toFixed(2)}`;
    if (p.isCurrentUser) return `You owe ${payer.name} ₹${amount.toFixed(2)}`;
    return `Owes ${payer.name} ₹${amount.toFixed(2)}`;
  };

  return (
    <SafeAreaView style={s.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Text style={s.title}>Custom Amounts</Text>
            {restaurantName ? <Text style={s.restaurant}>{restaurantName}</Text> : null}
            <Text style={s.hint}>Type an amount for anyone — the others re-balance automatically.</Text>
          </View>

          {/* Summary */}
          <View style={s.summaryCard}>
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>Bill Total</Text>
              <Text style={s.summaryValue}>₹{billTotal.toFixed(2)}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.summaryRow}>
              <Text style={s.summaryLabel}>{remaining < 0 ? "Over by" : "Left to assign"}</Text>
              <Text style={[s.summaryValue, balanced ? s.ok : s.warn]}>
                ₹{Math.abs(remaining).toFixed(2)}
              </Text>
            </View>
          </View>

          {/* People */}
          <View style={s.personList}>
            {participants.map((p, idx) => {
              const isLocked = p.id in locked;
              const amount = amounts[p.id] ?? 0;
              return (
                <View key={p.id} style={[s.personRow, idx < participants.length - 1 && s.personRowBorder]}>
                  <View style={[s.avatar, { backgroundColor: p.color ?? "#111827" }]}>
                    <Text style={s.avatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={s.personInfo}>
                    <Text style={s.personName} numberOfLines={1}>{p.isCurrentUser ? `${p.name} (You)` : p.name}</Text>
                    <Text style={s.owesLine}>{owesLine(p, amount)}</Text>
                  </View>
                  <View style={[s.amountBox, isLocked && s.amountBoxLocked]}>
                    <Text style={s.rupee}>₹</Text>
                    <TextInput
                      style={s.amountInput}
                      value={isLocked ? (drafts[p.id] ?? String(amount)) : amount.toFixed(2)}
                      onChangeText={(t) => handleChange(p.id, t)}
                      onFocus={() => {
                        if (!isLocked) setDrafts((d) => ({ ...d, [p.id]: amount.toFixed(2) }));
                      }}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      accessibilityLabel={`Amount for ${p.name}`}
                    />
                  </View>
                  {isLocked ? (
                    <Pressable onPress={() => handleUnlock(p.id)} hitSlop={10} accessibilityLabel={`Auto-balance ${p.name}`}>
                      <Ionicons name="lock-closed" size={16} color="#D97706" />
                    </Pressable>
                  ) : (
                    <Ionicons name="sync-outline" size={16} color="#9CA3AF" />
                  )}
                </View>
              );
            })}
          </View>
          <Text style={s.legend}>
            <Ionicons name="lock-closed" size={11} color="#D97706" /> typed by you (tap to auto-balance)   ·
            {"  "}<Ionicons name="sync-outline" size={11} color="#9CA3AF" /> auto-balanced
          </Text>

          {/* Actions */}
          <View style={s.actions}>
            <Pressable style={s.changeBtn} onPress={handleResetEqual}>
              <Ionicons name="refresh" size={16} color="#374151" />
              <Text style={s.changeBtnText}>Reset to Equal</Text>
            </Pressable>
            <Pressable
              style={[s.doneBtn, !balanced && s.doneBtnDisabled]}
              disabled={!balanced}
              onPress={() => setShowSaveModal(true)}
            >
              <Text style={s.doneBtnText}>
                {balanced ? "Done ✓" : remaining > 0 ? `Assign ₹${remaining.toFixed(2)} more` : `Remove ₹${Math.abs(remaining).toFixed(2)}`}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

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
  header: { marginTop: 28, marginBottom: 20 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827", letterSpacing: -0.5 },
  restaurant: { fontSize: 15, fontWeight: "600", color: "#1D4ED8", marginTop: 4 },
  hint: { fontSize: 13, color: "#6B7280", marginTop: 8, lineHeight: 18 },
  summaryCard: { backgroundColor: "#111827", borderRadius: 20, padding: 20, marginBottom: 20 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  summaryLabel: { fontSize: 14, color: "#9CA3AF", fontWeight: "500" },
  summaryValue: { fontSize: 16, color: "#F9FAFB", fontWeight: "700" },
  ok: { color: "#34D399", fontSize: 20 },
  warn: { color: "#FBBF24", fontSize: 20 },
  divider: { height: 1, backgroundColor: "#374151", marginVertical: 4 },
  personList: { backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8, overflow: "hidden" },
  personRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  personRowBorder: { borderBottomWidth: 1, borderColor: "#F3F4F6" },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  personInfo: { flex: 1 },
  personName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  owesLine: { fontSize: 12, color: "#059669", marginTop: 2, fontWeight: "500" },
  amountBox: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 10, paddingHorizontal: 8, backgroundColor: "#F9FAFB", minWidth: 96 },
  amountBoxLocked: { borderColor: "#FCD34D", backgroundColor: "#FFFBEB" },
  rupee: { fontSize: 15, color: "#6B7280", marginRight: 2 },
  amountInput: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827", paddingVertical: 8, textAlign: "right" },
  legend: { fontSize: 11, color: "#9CA3AF", marginBottom: 24, marginLeft: 4 },
  actions: { gap: 12 },
  changeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "#fff" },
  changeBtnText: { fontSize: 15, fontWeight: "600", color: "#374151" },
  doneBtn: { backgroundColor: "#111827", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  doneBtnDisabled: { backgroundColor: "#9CA3AF" },
  doneBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 24, padding: 24, elevation: 10 },
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
