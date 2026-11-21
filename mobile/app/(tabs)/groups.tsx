// ---------------------------------------------------------------------------
// app/(tabs)/groups.tsx
//
// Reusable contact groups. Read from contactGroupStore; all mutations go
// through that store. "Last activity" is derived from the bills already linked
// to a group — no new date field.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
} from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useContactGroups } from "../../hooks/useContactGroups";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import { contactGroupStore, MEMBER_COLORS } from "../../services/contactGroupStore";
import type { GroupMember } from "../../types/group";
import { C } from "@/constants/colors";
import { TAB_BAR_CLEARANCE } from "@/constants/layout";
import { T } from "@/constants/typography";
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { accountsFromBills } from "../../services/profilePhotos";

export default function GroupsScreen() {
  const router = useRouter();
  const { groups, isLoading } = useContactGroups();
  const { groups: billGroups } = useGroups();
  const { user } = useAuth();

  const [createVisible, setCreateVisible] = useState(false);
  const [draftName, setDraftName] = useState("");

  // Newest / most recently updated first
  const sorted = useMemo(
    () =>
      [...groups].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      ),
    [groups]
  );

  // Last activity = most recent bill created from this group, if any
  const lastActivity = useMemo(() => {
    const map: Record<string, string> = {};
    billGroups.forEach((bg) => {
      if (!bg.contactGroupId) return;
      const prev = map[bg.contactGroupId];
      if (!prev || new Date(bg.createdAt) > new Date(prev)) {
        map[bg.contactGroupId] = bg.createdAt;
      }
    });
    return map;
  }, [billGroups]);

  // Billy accounts of members (for their profile photos)
  const accounts = useMemo(() => accountsFromBills(billGroups), [billGroups]);

  const billCount = useMemo(() => {
    const map: Record<string, number> = {};
    billGroups.forEach((bg) => {
      if (!bg.contactGroupId) return;
      map[bg.contactGroupId] = (map[bg.contactGroupId] ?? 0) + 1;
    });
    return map;
  }, [billGroups]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) {
      appAlert.alert("Group name required", "Please enter a name for this group.");
      return;
    }
    // Start the group with the current user already in it.
    const me: GroupMember = {
      id: user?.uid ?? "me",
      name: user?.name ?? "Me",
      phone: user?.phoneNumber,
      color: MEMBER_COLORS[0],
      isCurrentUser: true,
    };
    const group = await contactGroupStore.createGroup(name, [me], user?.uid);
    setDraftName("");
    setCreateVisible(false);
    router.push(`/contact-group/${group.id}` as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={s.safeArea} edges={["top", "left", "right"]}>
        <View style={s.header}>
          <Text style={s.title}>Groups</Text>
          <Text style={s.subtitle}>People you split with often</Text>
        </View>
        <View style={s.loader}>
          <ActivityIndicator size="large" color={C.textSubtle} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea} edges={["top", "left", "right"]}>
      <View style={[s.header, s.headerRow]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Groups</Text>
          <Text style={s.subtitle}>People you split with often</Text>
        </View>
        {sorted.length > 0 && (
          <Pressable
            style={({ pressed }) => [s.newBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setCreateVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Create a group"
          >
            <Ionicons name="add" size={18} color={C.white} />
            <Text style={s.newBtnText}>New</Text>
          </Pressable>
        )}
      </View>

      <ScrollView
        contentContainerStyle={[s.scroll, sorted.length === 0 && s.scrollEmpty]}
        showsVerticalScrollIndicator={false}
      >
        {sorted.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="people-outline" size={32} color={C.primary} />
            </View>
            <Text style={s.emptyText}>No groups yet</Text>
            <Text style={s.emptySubtext}>
              Save the people you split with — flatmates, friends, the office lunch crew — and reuse them on every bill.
            </Text>
            <Pressable
              style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85 }]}
              onPress={() => setCreateVisible(true)}
              accessibilityRole="button"
              accessibilityLabel="Create a group"
            >
              <Ionicons name="add" size={18} color={C.white} />
              <Text style={s.createBtnText}>Create a group</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.groupList}>
            {sorted.map((group) => {
              const activity = lastActivity[group.id];
              const bills = billCount[group.id] ?? 0;
              const shown = group.members.slice(0, 4);
              const extra = group.members.length - shown.length;
              return (
                <Pressable
                  key={group.id}
                  style={({ pressed }) => [s.groupCard, pressed && s.groupCardPressed]}
                  onPress={() => router.push(`/contact-group/${group.id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${group.name}, ${group.members.length} members`}
                >
                  {/* Overlapping member initials */}
                  <View style={s.avatars}>
                    {shown.map((m, i) => (
                      <MemberAvatar
                        key={m.id}
                        name={m.name || "?"}
                        color={m.color}
                        authUid={m.authUid ?? accounts[m.id]}
                        isMe={m.isCurrentUser || m.id === user?.uid}
                        size={32}
                        ring={2}
                        style={{ marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }}
                      />
                    ))}
                    {extra > 0 && (
                      <View style={[s.avatar, s.avatarMore, { marginLeft: -10 }]}>
                        <Text style={s.avatarMoreText}>+{extra}</Text>
                      </View>
                    )}
                  </View>

                  <View style={s.groupBody}>
                    <Text style={s.groupTitle} numberOfLines={1}>{group.name}</Text>
                    <Text style={s.groupMeta} numberOfLines={1}>
                      {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                      {bills > 0 ? ` · ${bills} bill${bills !== 1 ? "s" : ""}` : ""}
                      {" · "}
                      {activity ? `last ${formatDate(activity)}` : `created ${formatDate(group.createdAt)}`}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={C.textSubtle} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Create group modal ── */}
      <Modal visible={createVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>New Group</Text>
            <Text style={s.modalSubtitle}>You can add people on the next screen.</Text>
            <TextInput
              style={s.modalInput}
              value={draftName}
              onChangeText={setDraftName}
              placeholder="e.g. Flatmates"
              placeholderTextColor={C.textSubtle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <View style={s.modalActions}>
              <Pressable
                style={s.modalCancelBtn}
                onPress={() => { setCreateVisible(false); setDraftName(""); }}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={s.modalSaveBtn} onPress={handleCreate}>
                <Text style={s.modalSaveText}>Create</Text>
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
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { ...T.largeTitle, color: C.ink, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.textMuted },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: C.primary, paddingHorizontal: 14, height: 36, borderRadius: 18,
  },
  newBtnText: { color: C.white, fontSize: 13, fontWeight: "700" },

  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE },
  scrollEmpty: { flexGrow: 1, justifyContent: "center" },

  emptyState: { alignItems: "center", marginTop: -60, paddingHorizontal: 12 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: C.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  emptyText: { fontSize: 16, color: C.ink, fontWeight: "700", marginBottom: 6 },
  emptySubtext: { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 18, maxWidth: 280 },

  groupList: { gap: 12 },
  groupCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: C.glass, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: C.glassBorder,
  },
  groupCardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  avatars: { flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.white,
  },
  avatarMore: { backgroundColor: C.surfaceAlt },
  avatarMoreText: { color: C.text, fontSize: 11, fontWeight: "700" },
  groupBody: { flex: 1 },
  groupTitle: { fontSize: 15, fontWeight: "700", color: C.ink },
  groupMeta: { fontSize: 12, color: C.textMuted, marginTop: 3 },

  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14, marginTop: 24,
  },
  createBtnText: { color: C.white, fontSize: 14, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: C.ink, marginBottom: 6 },
  modalSubtitle: { fontSize: 12, color: C.textMuted, marginBottom: 18, lineHeight: 17 },
  modalInput: {
    borderWidth: 1, borderColor: C.borderStrong, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: C.ink, marginBottom: 20,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modalCancelText: { fontSize: 13, fontWeight: "600", color: C.textMuted },
  modalSaveBtn: { backgroundColor: C.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalSaveText: { fontSize: 13, fontWeight: "700", color: "#fff" },
});
