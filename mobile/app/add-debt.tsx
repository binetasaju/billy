// ---------------------------------------------------------------------------
// app/add-debt.tsx — "Owe someone": record money YOU owe (no receipt)
//
// Opened from Home (pick anyone from contacts) or from a saved group with
// ?contactGroupId=… (pick one of its members, and the debt counts towards
// that group's balances). Saved via services/debt.ts as a normal BillGroup.
// ---------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authStore } from "../services/authStore";
import { groupStore } from "../services/groupStore";
import { buildDebtRecord } from "../services/debt";
import { useContactGroups } from "../hooks/useContactGroups";
import ContactPickerModal, { type ContactData } from "../components/ContactPickerModal";

type Other = { id: string; name: string; phone?: string; color?: string };

export default function AddDebtScreen() {
  const router = useRouter();
  const { contactGroupId } = useLocalSearchParams<{ contactGroupId?: string }>();
  const { groups } = useContactGroups();
  const group = useMemo(() => groups.find((g) => g.id === contactGroupId), [groups, contactGroupId]);
  const user = authStore.get().user;

  const [other, setOther] = useState<Other | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pickerVisible, setPickerVisible] = useState(false);

  const members = useMemo(
    () => (group?.members ?? []).filter((m) => !m.isCurrentUser && m.id !== user?.uid),
    [group, user]
  );

  const handlePickContact = (contacts: ContactData[]) => {
    const c = contacts[0];
    if (c) setOther({ id: c.id, name: c.name, phone: c.phone });
    setPickerVisible(false);
  };

  const handleSave = async () => {
    if (!user) return;
    const value = parseFloat(amount.replace(/,/g, ""));
    if (!other) { Alert.alert("Who?", "Choose the person."); return; }
    if (!Number.isFinite(value) || value <= 0) { Alert.alert("Amount", "Enter an amount greater than ₹0."); return; }
    try {
      const record = buildDebtRecord({
        me: { id: user.uid, name: user.name, upiId: user.upiId },
        other,
        amount: value,
        note,
        contactGroupId: group?.id,
      });
      await groupStore.createGroup(record);
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : "Please try again.");
    }
  };

  const otherLabel = other?.name ?? "them";

  return (
    <SafeAreaView style={s.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="arrow-back" size={22} color="#111827" />
            </Pressable>
            <Text style={s.title}>Money I Owe</Text>
            {group ? <Text style={s.subtitle}>In {group.name}</Text> : null}
          </View>

          {/* Person */}
          <Text style={s.label}>Person</Text>
          {group ? (
            <View style={s.chips}>
              {members.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => setOther({ id: m.id, name: m.name, phone: m.phone, color: m.color })}
                  style={[s.chip, other?.id === m.id && s.chipActive]}
                >
                  <Text style={[s.chipText, other?.id === m.id && s.chipTextActive]}>{m.name}</Text>
                </Pressable>
              ))}
              {members.length === 0 && <Text style={s.muted}>Add members to this group first.</Text>}
            </View>
          ) : (
            <Pressable style={s.pickBtn} onPress={() => setPickerVisible(true)}>
              <Ionicons name="person-add-outline" size={18} color="#111827" />
              <Text style={s.pickBtnText}>{other ? other.name : "Choose from contacts"}</Text>
            </Pressable>
          )}

          {/* Amount */}
          <Text style={s.label}>Amount</Text>
          <View style={s.amountBox}>
            <Text style={s.rupee}>₹</Text>
            <TextInput
              style={s.amountInput}
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9.,]/g, ""))}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>

          {/* Note */}
          <Text style={s.label}>What for? (optional)</Text>
          <TextInput
            style={s.input}
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Cab fare, movie tickets"
            maxLength={60}
          />

          <Text style={s.summary}>
            {`You will owe ${otherLabel} ₹${amount || "0"}.`}
          </Text>

          <Pressable style={s.saveBtn} onPress={handleSave}>
            <Text style={s.saveBtnText}>Save</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onAddContacts={handlePickContact}
        existingParticipantIds={[]}
        existingPhones={[]}
        singleSelection
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { marginTop: 16, marginBottom: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827", letterSpacing: -0.5 },
  subtitle: { fontSize: 15, fontWeight: "600", color: "#1D4ED8", marginTop: -6 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18, borderWidth: 1, borderColor: "#D1D5DB", backgroundColor: "#fff" },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontSize: 14, color: "#374151", fontWeight: "500" },
  chipTextActive: { color: "#fff" },
  muted: { fontSize: 13, color: "#9CA3AF" },
  pickBtn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, padding: 14, backgroundColor: "#fff", marginBottom: 20 },
  pickBtnText: { fontSize: 15, color: "#111827", fontWeight: "500" },
  amountBox: { flexDirection: "row", alignItems: "center", borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, backgroundColor: "#fff", marginBottom: 20 },
  rupee: { fontSize: 22, color: "#6B7280", marginRight: 6 },
  amountInput: { flex: 1, fontSize: 22, fontWeight: "700", color: "#111827", paddingVertical: 12 },
  input: { borderWidth: 1.5, borderColor: "#E5E7EB", borderRadius: 12, paddingHorizontal: 14, height: 50, fontSize: 15, color: "#111827", backgroundColor: "#fff", marginBottom: 20 },
  summary: { fontSize: 14, color: "#6B7280", marginBottom: 20 },
  saveBtn: { backgroundColor: "#111827", paddingVertical: 16, borderRadius: 12, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
