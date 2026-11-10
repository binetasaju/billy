// ---------------------------------------------------------------------------
// app/contact-group/[id].tsx
//
// Detail for a reusable contact group: members, rename, add/remove, and the
// bills that were started from this group.
//
// Note the route naming: /contact-group/:id is the REUSABLE group (people),
// /group/:id is the BillGroup (one bill's frozen settlement record).
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, Modal, TextInput, Alert,
} from "react-native";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useContactGroups } from "../../hooks/useContactGroups";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import { contactGroupStore, MEMBER_COLORS } from "../../services/contactGroupStore";
import { billStore } from "../../services/billStore";
import { computeGroupBalances, describeBalance, simplifyDebts } from "../../services/groupBalances";
import ContactPickerModal, { ContactData } from "../../components/ContactPickerModal";
import type { GroupMember } from "../../types/group";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";

export default function ContactGroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { groups } = useContactGroups();
  const { groups: billGroups } = useGroups();
  const { user } = useAuth();

  const group = useMemo(() => groups.find((g) => g.id === id), [groups, id]);

  const [pickerVisible, setPickerVisible] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [draftName, setDraftName] = useState("");

  // Balances: a pure aggregation over the linked bills' existing settlements.
  // Nothing is stored — this recomputes from persisted BillGroups every render,
  // so it is automatically correct after a restart.
  const balances = useMemo(
    () => (group ? computeGroupBalances(group, billGroups, user?.uid) : null),
    [group, billGroups, user]
  );

  // Bills started from this group (backward reference only)
  const linkedBills = useMemo(
    () =>
      billGroups
        .filter((bg) => bg.contactGroupId === id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [billGroups, id]
  );

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric",
    });

  const handleAddContacts = async (contacts: ContactData[]) => {
    if (!group) return;
    const members: GroupMember[] = contacts.map((c, i) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      color: MEMBER_COLORS[(group.members.length + i) % MEMBER_COLORS.length],
    }));
    await contactGroupStore.addMembers(group.id, members);
    setPickerVisible(false);
  };

  const handleRemove = (memberId: string, name: string) => {
    if (!group) return;
    Alert.alert("Remove member", `Remove ${name} from ${group.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => contactGroupStore.removeMember(group.id, memberId),
      },
    ]);
  };

  const handleRename = async () => {
    if (!group) return;
    const name = draftName.trim();
    if (!name) {
      Alert.alert("Group name required", "Please enter a name for this group.");
      return;
    }
    await contactGroupStore.renameGroup(group.id, name);
    setRenameVisible(false);
  };

  const handleSplitAmount = () => {
    if (!group || !user) return;
    const others = group.members.filter((m) => !m.isCurrentUser && m.id !== user.uid);
    if (others.length === 0) {
      Alert.alert("Add people first", "Add at least one person to this group to split an amount.");
      return;
    }
    billStore.startAmountSplit(group, user);
    router.push("/custom-split" as any);
  };

  const handleDeleteGroup = () => {
    if (!group) return;
    Alert.alert(
      "Delete group",
      `Delete ${group.name}? Bills already created from it are not affected.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await contactGroupStore.deleteGroup(group.id);
            router.back();
          },
        },
      ]
    );
  };

  if (!group) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color={C.ink} />
          </Pressable>
        </View>
        <View style={s.emptyState}>
          <Text style={s.errorText}>Group not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.ink} />
        </Pressable>
        <Pressable
          style={s.renameBtn}
          onPress={() => { setDraftName(group.name); setRenameVisible(true); }}
          accessibilityRole="button"
          accessibilityLabel="Rename group"
        >
          <Ionicons name="create-outline" size={15} color={C.text} />
          <Text style={s.renameBtnText}>Rename</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>{group.name}</Text>
        <Text style={s.subtitle}>
          {group.members.length} member{group.members.length !== 1 ? "s" : ""}
        </Text>

        {/* ── Members ── */}
        <Text style={s.sectionTitle}>Members</Text>
        <View style={s.listCard}>
          {group.members.map((m, idx) => {
            const isMe = m.isCurrentUser === true;
            // A person's UPI ID lives on their own profile; the only one this
            // device knows is the signed-in user's own.
            const ownUpi = isMe ? user?.upiId : undefined;
            return (
              <View
                key={m.id}
                style={[s.memberRow, idx < group.members.length - 1 && s.rowBorder]}
              >
                <View style={[s.avatar, { backgroundColor: m.color ?? C.textMuted }]}>
                  <Text style={s.avatarText}>{m.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={s.memberInfo}>
                  <Text style={s.memberName}>{isMe ? "You" : m.name}</Text>
                  {m.phone ? <Text style={s.memberPhone}>{m.phone}</Text> : null}
                  {ownUpi ? <Text style={s.memberUpi}>{ownUpi}</Text> : null}
                </View>
                {isMe ? (
                  <View style={s.youBadge}><Text style={s.youBadgeText}>You</Text></View>
                ) : (
                  <Pressable
                    onPress={() => handleRemove(m.id, m.name)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${m.name}`}
                  >
                    <Ionicons name="close-circle-outline" size={20} color={C.danger} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <Pressable style={s.addBtn} onPress={() => setPickerVisible(true)}>
          <Ionicons name="person-add" size={18} color={C.ink} />
          <Text style={s.addBtnText}>Add From Contacts</Text>
        </Pressable>

        {/* ── Balances ── */}
        <Text style={s.sectionTitle}>Balances</Text>
        {!balances || balances.linkedBillCount === 0 ? (
          <View style={s.emptyBills}>
            <Text style={s.emptyBillsText}>
              No bills yet — balances appear once you split one with this group.
            </Text>
          </View>
        ) : (
          <View style={s.listCard}>
            {balances.members.map((b, idx) => {
              const owesYou = b.netWithViewer > 0;
              const youOwe = b.netWithViewer < 0;
              const member = group.members.find((m) => m.id === b.personId);
              return (
                <View
                  key={b.personId}
                  style={[s.memberRow, idx < balances.members.length - 1 && s.rowBorder]}
                >
                  <View style={[s.avatar, { backgroundColor: member?.color ?? C.textSubtle }]}>
                    <Text style={s.avatarText}>{b.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={s.memberInfo}>
                    <Text style={s.memberName}>{b.isViewer ? "You" : b.name}</Text>
                    {!b.isCurrentMember && (
                      <Text style={s.formerMember}>No longer in this group</Text>
                    )}
                  </View>
                  <Text
                    style={[
                      s.balanceText,
                      owesYou && s.balancePositive,
                      youOwe && s.balanceNegative,
                    ]}
                  >
                    {describeBalance(b)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* ── Fewest payments to settle everything ── */}
        {balances && balances.linkedBillCount > 0 && (() => {
          const suggestions = simplifyDebts(balances.members);
          if (suggestions.length === 0) return null;
          const nameOf = (id: string) => {
            const m = balances.members.find((b) => b.personId === id);
            return m?.isViewer ? "You" : m?.name ?? "Someone";
          };
          return (
            <View style={[s.listCard, s.suggestCard]}>
              <Text style={s.suggestTitle}>Settle up in {suggestions.length} payment{suggestions.length !== 1 ? "s" : ""}</Text>
              {suggestions.map((p) => (
                <View key={`${p.fromId}-${p.toId}`} style={s.suggestRow}>
                  <Text style={s.suggestText}>
                    <Text style={s.suggestName}>{nameOf(p.fromId)}</Text>
                    {nameOf(p.fromId) === "You" ? " pay " : " pays "}
                    <Text style={s.suggestName}>{nameOf(p.toId)}</Text>
                  </Text>
                  <Text style={s.suggestAmount}>₹{p.amount.toFixed(2)}</Text>
                </View>
              ))}
              <Text style={s.suggestNote}>Combines all open bills in this group into the fewest payments.</Text>
            </View>
          );
        })()}

        {/* ── Split an amount (no receipt) ── */}
        <Pressable
          style={s.splitAmountBtn}
          onPress={handleSplitAmount}
          accessibilityRole="button"
        >
          <Ionicons name="calculator-outline" size={20} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={s.splitAmountTitle}>Split an Amount</Text>
            <Text style={s.splitAmountSub}>No bill? Enter a total and set each person&apos;s share</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={C.textSubtle} />
        </Pressable>

        {/* ── Bills from this group ── */}
        <Text style={s.sectionTitle}>Bills</Text>
        {linkedBills.length === 0 ? (
          <View style={s.emptyBills}>
            <Text style={s.emptyBillsText}>No bills from this group yet.</Text>
          </View>
        ) : (
          <View style={s.listCard}>
            {linkedBills.map((bg, idx) => (
              <Pressable
                key={bg.id}
                style={({ pressed }) => [
                  s.billRow,
                  idx < linkedBills.length - 1 && s.rowBorder,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => router.push(`/group/${bg.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`Open bill ${bg.title}`}
              >
                <View style={s.memberInfo}>
                  <Text style={s.memberName} numberOfLines={1}>{bg.title}</Text>
                  <Text style={s.memberPhone}>{formatDate(bg.createdAt)}</Text>
                </View>
                <View style={s.billRight}>
                  <Text style={s.billAmount}>₹{bg.totalAmount.toFixed(2)}</Text>
                  <Text style={bg.status === "settled" ? s.billSettled : s.billActive}>
                    {bg.status === "settled" ? "Settled" : "Active"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable style={s.deleteBtn} onPress={handleDeleteGroup}>
          <Ionicons name="trash-outline" size={16} color={C.danger} />
          <Text style={s.deleteBtnText}>Delete Group</Text>
        </Pressable>
      </ScrollView>

      {/* ── Add members ── */}
      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onAddContacts={handleAddContacts}
        existingParticipantIds={group.members.map((m) => m.id)}
        existingPhones={group.members.map((m) => m.phone || "").filter(Boolean)}
      />

      {/* ── Rename ── */}
      <Modal visible={renameVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Rename Group</Text>
            <TextInput
              style={s.modalInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="e.g. Flatmates"
              placeholderTextColor={C.textSubtle}
              autoFocus
              selectTextOnFocus
              returnKeyType="done"
              onSubmitEditing={handleRename}
            />
            <View style={s.modalActions}>
              <Pressable style={s.modalCancelBtn} onPress={() => setRenameVisible(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={handleRename}>
                <Text style={s.modalSaveText}>Save</Text>
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
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceAlt,
    alignItems: "center", justifyContent: "center",
  },
  renameBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: C.surfaceAlt, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
  },
  renameBtnText: { color: C.text, fontSize: 13, fontWeight: "600" },

  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  title: { ...T.largeTitle, color: C.ink, marginTop: 16, marginBottom: 4 },
  subtitle: { fontSize: 15, color: C.textMuted, marginBottom: 28 },

  sectionTitle: { fontSize: 18, fontWeight: "700", color: C.ink, marginBottom: 12, marginTop: 8 },
  listCard: {
    backgroundColor: C.glass, borderRadius: 16, borderWidth: 1, borderColor: C.glassBorder, overflow: "hidden",
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.surfaceAlt },

  memberRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  memberInfo: { flex: 1, paddingRight: 10 },
  memberName: { fontSize: 16, fontWeight: "600", color: C.ink },
  memberPhone: { fontSize: 13, color: C.textMuted, marginTop: 2 },
  memberUpi: { fontSize: 12, color: C.primaryMuted, fontWeight: "500", marginTop: 2 },
  youBadge: { backgroundColor: C.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  youBadgeText: { color: C.primaryMuted, fontSize: 12, fontWeight: "700" },

  balanceText: { fontSize: 13, fontWeight: "600", color: C.textMuted, maxWidth: "52%", textAlign: "right" },
  balancePositive: { color: C.successDark },
  balanceNegative: { color: C.danger },
  formerMember: { fontSize: 11, color: C.textSubtle, marginTop: 2, fontStyle: "italic" },

  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.glassBorder,
    paddingVertical: 14, borderRadius: 12, marginTop: 12,
  },
  addBtnText: { fontSize: 15, fontWeight: "600", color: C.ink },
  splitAmountBtn: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.primary, borderRadius: 16, padding: 16, marginBottom: 24 },
  splitAmountTitle: { fontSize: 16, fontWeight: "700", color: "#fff" },
  splitAmountSub: { fontSize: 12, color: C.textSubtle, marginTop: 2 },
  suggestCard: { padding: 16, gap: 8 },
  suggestTitle: { fontSize: 15, fontWeight: "700", color: C.ink, marginBottom: 4 },
  suggestRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  suggestText: { fontSize: 14, color: C.text, flex: 1 },
  suggestName: { fontWeight: "600", color: C.ink },
  suggestAmount: { fontSize: 15, fontWeight: "700", color: C.ink },
  suggestNote: { fontSize: 12, color: C.textSubtle, marginTop: 4 },

  emptyBills: {
    backgroundColor: C.glass, borderRadius: 16, borderWidth: 1, borderColor: C.glassBorder,
    borderStyle: "dashed", paddingVertical: 28, alignItems: "center",
  },
  emptyBillsText: { fontSize: 14, color: C.textSubtle },

  billRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  billRight: { alignItems: "flex-end" },
  billAmount: { fontSize: 15, fontWeight: "700", color: C.ink },
  billSettled: { fontSize: 12, fontWeight: "600", color: C.successDark, marginTop: 2 },
  billActive: { fontSize: 12, fontWeight: "600", color: C.warning, marginTop: 2 },

  deleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    paddingVertical: 14, borderRadius: 12, marginTop: 28,
    borderWidth: 1, borderColor: "#FECACA", backgroundColor: C.dangerSoft,
  },
  deleteBtnText: { color: C.danger, fontSize: 15, fontWeight: "600" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 15, color: C.textSubtle },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.ink, marginBottom: 18 },
  modalInput: {
    borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: C.ink, marginBottom: 20,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: C.textMuted },
  modalSaveBtn: { backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalSaveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
