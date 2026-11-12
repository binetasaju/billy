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
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, TextInput, KeyboardAvoidingView } from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
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
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";

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
  /** The box being typed in: it shows exactly what was typed, even when empty. */
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");

  // "Split an Amount" (from a saved group): title + total are typed here.
  const [amountOnly, setAmountOnly] = useState(false);
  const [titleText, setTitleText] = useState("");
  const [totalText, setTotalText] = useState("");

  useEffect(() => {
    const store = billStore.get();
    if (!store) { router.replace("/"); return; }
    setParticipants(store.participants);
    setPayerId(store.payerId);
    setBillTotal(store.bill.total ?? 0);
    setRestaurantName(store.bill.restaurant ?? "");
    setGroupTitle(store.bill.restaurant || "Untitled Bill");
    if (store.amountOnly) {
      setAmountOnly(true);
      setTitleText(store.bill.restaurant ?? "");
      setTotalText(store.bill.total ? String(store.bill.total) : "");
    }

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

  const handleAmountOnlyChange = (title: string, totalStr: string) => {
    const clean = totalStr.replace(/[^0-9.]/g, "");
    setTitleText(title);
    setTotalText(clean);
    const total = parseFloat(clean);
    const value = Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : 0;
    billStore.setAmountOnlyTotal(title, value);
    setBillTotal(value);
    setGroupTitle(title.trim() || "Split");
  };

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
      appAlert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
      return;
    }
    setShowSaveModal(false);
    if (wasEditing) router.dismissTo(`/group/${savedId}` as any);
    // Open the new bill (its invite card offers WhatsApp / Share link).
    else router.replace(`/group/${savedId}` as any);
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
            <Text style={s.title}>{amountOnly ? "Split an Amount" : "Custom Amounts"}</Text>
            {!amountOnly && restaurantName ? <Text style={s.restaurant}>{restaurantName}</Text> : null}
            <Text style={s.hint}>Type an amount for anyone — the others re-balance automatically.</Text>
          </View>

          {amountOnly && (
            <View style={s.amountOnlyCard}>
              <Text style={s.inputLabel}>What for?</Text>
              <TextInput
                style={s.input}
                value={titleText}
                onChangeText={(t) => handleAmountOnlyChange(t, totalText)}
                placeholder="e.g. Cab to airport, Goa trip"
                placeholderTextColor={C.textSubtle}
                maxLength={60}
              />
              <Text style={[s.inputLabel, { marginTop: 14 }]}>Total amount you paid</Text>
              <View style={[s.amountBox, s.totalBox]}>
                <Text style={s.rupee}>₹</Text>
                <TextInput
                  style={[s.amountInput, s.totalInput]}
                  value={totalText}
                  onChangeText={(t) => handleAmountOnlyChange(titleText, t)}
                  placeholder="0.00"
                  placeholderTextColor={C.textSubtle}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Total amount"
                />
              </View>
            </View>
          )}

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
                  <View style={[s.avatar, { backgroundColor: p.color ?? C.ink }]}>
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
                      value={
                        focusedId === p.id
                          ? (drafts[p.id] ?? "")
                          : isLocked
                            ? (drafts[p.id] ?? String(amount))
                            : amount.toFixed(2)
                      }
                      // Tapping starts with an empty box (current amount as a
                      // hint) so a new number can be typed straight away.
                      placeholder={amount.toFixed(2)}
                      placeholderTextColor={C.textSubtle}
                      onChangeText={(t) => handleChange(p.id, t)}
                      onFocus={() => {
                        setFocusedId(p.id);
                        setDrafts((d) => ({ ...d, [p.id]: "" }));
                        setLocked((l) => { const next = { ...l }; delete next[p.id]; return next; });
                      }}
                      onBlur={() => {
                        setFocusedId((cur) => (cur === p.id ? null : cur));
                        // Left empty → back to the auto-balanced amount.
                        setDrafts((d) => {
                          if (d[p.id]) return d;
                          const next = { ...d }; delete next[p.id]; return next;
                        });
                      }}
                      keyboardType="decimal-pad"
                      accessibilityLabel={`Amount for ${p.name}`}
                    />
                  </View>
                  {isLocked ? (
                    <Pressable onPress={() => handleUnlock(p.id)} hitSlop={10} accessibilityLabel={`Auto-balance ${p.name}`}>
                      <Ionicons name="lock-closed" size={16} color={C.warning} />
                    </Pressable>
                  ) : (
                    <Ionicons name="sync-outline" size={16} color={C.textSubtle} />
                  )}
                </View>
              );
            })}
          </View>
          <Text style={s.legend}>
            <Ionicons name="lock-closed" size={11} color={C.warning} /> typed by you (tap to auto-balance)   ·
            {"  "}<Ionicons name="sync-outline" size={11} color={C.textSubtle} /> auto-balanced
          </Text>

          {/* Actions */}
          <View style={s.actions}>
            <Pressable style={s.changeBtn} onPress={handleResetEqual}>
              <Ionicons name="refresh" size={16} color={C.text} />
              <Text style={s.changeBtnText}>Reset to Equal</Text>
            </Pressable>
            <Pressable
              style={[s.doneBtn, (!balanced || billTotal <= 0) && s.doneBtnDisabled]}
              disabled={!balanced || billTotal <= 0}
              onPress={() => setShowSaveModal(true)}
            >
              <Text style={s.doneBtnText}>
                {billTotal <= 0 ? "Enter the total amount" : balanced ? "Done ✓" : remaining > 0 ? `Assign ₹${remaining.toFixed(2)} more` : `Remove ₹${Math.abs(remaining).toFixed(2)}`}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Create Bill Modal ── */}
      <Modal visible={showSaveModal} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Create Bill</Text>
            <Text style={s.modalSubtitle}>Give this bill a name to track its payments.</Text>
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>Bill Name</Text>
              <TextInput
                style={s.input}
                value={groupTitle}
                onChangeText={setGroupTitle}
                placeholder="e.g. Friday Dinner"
                placeholderTextColor={C.textSubtle}
                autoFocus
              />
            </View>
            <View style={s.modalActions}>
              <Pressable style={s.modalBtnSecondary} onPress={() => setShowSaveModal(false)}>
                <Text style={s.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalBtnPrimary} onPress={handleCreateGroup}>
                <Text style={s.modalBtnPrimaryText}>Create Bill</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: { ...T.largeTitle, color: C.ink },
  restaurant: { fontSize: 13, fontWeight: "600", color: C.primary, marginTop: 4 },
  hint: { fontSize: 12, color: C.textMuted, marginTop: 8, lineHeight: 15 },
  summaryCard: { backgroundColor: C.primaryDark, borderRadius: 20, padding: 20, marginBottom: 20 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  summaryLabel: { fontSize: 12, color: C.onDarkMuted, fontWeight: "500" },
  summaryValue: { fontSize: 14, color: C.onDark, fontWeight: "700" },
  ok: { color: "#34D399", fontSize: 16 },
  warn: { color: "#FBBF24", fontSize: 16 },
  divider: { height: 1, backgroundColor: C.onDarkLine, marginVertical: 4 },
  personList: { backgroundColor: C.glass, borderRadius: 16, borderWidth: 1, borderColor: C.glassBorder, marginBottom: 8, overflow: "hidden" },
  personRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  personRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.surfaceAlt },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  personInfo: { flex: 1 },
  personName: { fontSize: 13, fontWeight: "600", color: C.ink },
  owesLine: { fontSize: 11, color: C.successDark, marginTop: 2, fontWeight: "500" },
  amountBox: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingHorizontal: 8, backgroundColor: C.bg, minWidth: 96 },
  amountBoxLocked: { borderColor: "#FCD34D", backgroundColor: C.warningSoft },
  rupee: { fontSize: 13, color: C.textMuted, marginRight: 2 },
  amountInput: { flex: 1, fontSize: 13, fontWeight: "600", color: C.ink, paddingVertical: 8, textAlign: "right" },
  amountOnlyCard: { backgroundColor: C.glass, borderRadius: 16, borderWidth: 1, borderColor: C.glassBorder, padding: 16, marginBottom: 20 },
  totalBox: { minWidth: 0, backgroundColor: "#fff" },
  totalInput: { fontSize: 17, textAlign: "left", paddingVertical: 10 },
  legend: { fontSize: 11, color: C.textSubtle, marginBottom: 24, marginLeft: 4 },
  actions: { gap: 12 },
  changeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.glassBorder, backgroundColor: C.glassStrong },
  changeBtnText: { fontSize: 13, fontWeight: "600", color: C.text },
  doneBtn: { backgroundColor: C.primary, paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  doneBtnDisabled: { backgroundColor: C.textSubtle },
  doneBtnText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 24, padding: 24, elevation: 6 },
  modalTitle: { fontSize: 17, fontWeight: "700", color: C.ink, marginBottom: 6 },
  modalSubtitle: { fontSize: 13, color: C.textMuted, marginBottom: 20, lineHeight: 18 },
  inputWrap: { marginBottom: 24 },
  inputLabel: { fontSize: 12, fontWeight: "600", color: C.text, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, height: 52, fontSize: 14, color: C.ink, backgroundColor: C.bg },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: C.surfaceAlt },
  modalBtnSecondaryText: { color: C.text, fontSize: 13, fontWeight: "600" },
  modalBtnPrimary: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", backgroundColor: C.primary },
  modalBtnPrimaryText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
