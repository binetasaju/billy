// ---------------------------------------------------------------------------
// app/(tabs)/groups.tsx
//
// Reusable contact groups. Read from contactGroupStore; all mutations go
// through that store. "Last activity" is derived from the bills already linked
// to a group — no new date field.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  Pressable, ActivityIndicator, Modal, TextInput, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useContactGroups } from "../../hooks/useContactGroups";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import { contactGroupStore, MEMBER_COLORS } from "../../services/contactGroupStore";
import type { GroupMember } from "../../types/group";

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

  const billCount = useMemo(() => {
    const map: Record<string, number> = {};
    billGroups.forEach((bg) => {
      if (!bg.contactGroupId) return;
      map[bg.contactGroupId] = (map[bg.contactGroupId] ?? 0) + 1;
    });
    return map;
  }, [billGroups]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric",
    });

  const handleCreate = async () => {
    const name = draftName.trim();
    if (!name) {
      Alert.alert("Group name required", "Please enter a name for this group.");
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
    const group = await contactGroupStore.createGroup(name, [me]);
    setDraftName("");
    setCreateVisible(false);
    router.push(`/contact-group/${group.id}` as any);
  };

  if (isLoading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <Text style={s.title}>Groups</Text>
          <Text style={s.subtitle}>People you split with often</Text>
        </View>
        <View style={s.loader}>
          <ActivityIndicator size="large" color="#9CA3AF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Text style={s.title}>Groups</Text>
        <Text style={s.subtitle}>People you split with often</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {sorted.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="people-outline" size={32} color="#D1D5DB" />
            <Text style={s.emptyText}>No groups yet</Text>
            <Text style={s.emptySubtext}>
              Save a group of people to reuse them on future bills.
            </Text>
          </View>
        ) : (
          <View style={s.groupList}>
            {sorted.map((group) => {
              const activity = lastActivity[group.id];
              const bills = billCount[group.id] ?? 0;
              return (
                <Pressable
                  key={group.id}
                  style={({ pressed }) => [s.groupCard, pressed && s.groupCardPressed]}
                  onPress={() => router.push(`/contact-group/${group.id}` as any)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${group.name}`}
                >
                  <View style={s.groupHeader}>
                    <Text style={s.groupTitle} numberOfLines={1}>{group.name}</Text>
                    <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
                  </View>

                  <Text style={s.groupMeta}>
                    {group.members.length} member{group.members.length !== 1 ? "s" : ""}
                    {bills > 0 ? `  ·  ${bills} bill${bills !== 1 ? "s" : ""}` : ""}
                  </Text>

                  <Text style={s.groupActivity}>
                    {activity
                      ? `Last bill ${formatDate(activity)}`
                      : `Created ${formatDate(group.createdAt)}`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85 }]}
          onPress={() => setCreateVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Create a group"
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={s.createBtnText}>Create Group</Text>
        </Pressable>
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
              placeholderTextColor="#9CA3AF"
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
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: "800", color: "#111827", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#6B7280" },

  loader: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },

  emptyState: {
    alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24,
    backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed",
  },
  emptyText: { fontSize: 15, color: "#9CA3AF", marginTop: 12, fontWeight: "500" },
  emptySubtext: { fontSize: 14, color: "#D1D5DB", marginTop: 6, textAlign: "center" },

  groupList: { gap: 16 },
  groupCard: {
    backgroundColor: "#ffffff", borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
  },
  groupCardPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  groupTitle: { fontSize: 18, fontWeight: "700", color: "#111827", flex: 1, marginRight: 12 },
  groupMeta: { fontSize: 14, color: "#4B5563", fontWeight: "500" },
  groupActivity: { fontSize: 13, color: "#9CA3AF", marginTop: 6 },

  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#111827", paddingVertical: 16, borderRadius: 14, marginTop: 24,
  },
  createBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 20 },
  modalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: "#6B7280", marginBottom: 18, lineHeight: 20 },
  modalInput: {
    borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: "#111827", marginBottom: 20,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 12 },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: "#6B7280" },
  modalSaveBtn: { backgroundColor: "#111827", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 },
  modalSaveText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
