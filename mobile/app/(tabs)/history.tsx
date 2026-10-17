// ---------------------------------------------------------------------------
// app/(tabs)/history.tsx
//
// Settled bills, read from groupStore via useGroups().
// Every figure on this screen is derived from existing BillGroup settlement
// records — no separate storage, no recalculated splits.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  Pressable, ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import type { BillGroup } from "../../types/group";

export default function HistoryScreen() {
  const router = useRouter();
  const { groups, isLoading } = useGroups();
  const { user } = useAuth();

  // ── Settled bills, newest first ───────────────────────────────────────────
  const settledGroups = useMemo(
    () =>
      groups
        .filter((g) => g.status === "settled")
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    [groups]
  );

  // ── Statistics, derived from settlement records ───────────────────────────
  // "Me" is resolved per group: participants carry an isCurrentUser flag, and
  // the auth uid is the fallback for groups created before that flag existed.
  const stats = useMemo(() => {
    let totalSpent = 0;
    let totalReceived = 0;

    settledGroups.forEach((g: BillGroup) => {
      const myId =
        g.participants.find((p) => p.isCurrentUser)?.id ?? user?.uid;
      if (!myId) return;

      g.settlements.forEach((tx) => {
        if (tx.status !== "paid") return;
        if (tx.fromUserId === myId) totalSpent += tx.amount;
        else if (tx.toUserId === myId) totalReceived += tx.amount;
      });
    });

    return { totalSpent, totalReceived, billsSettled: settledGroups.length };
  }, [settledGroups, user]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

  // ── Loading ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <Text style={s.title}>History</Text>
          <Text style={s.subtitle}>Your settled bills</Text>
        </View>
        <View style={s.loader}>
          <ActivityIndicator size="large" color="#9CA3AF" />
        </View>
      </SafeAreaView>
    );
  }

  const hasHistory = settledGroups.length > 0;

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Text style={s.title}>History</Text>
        <Text style={s.subtitle}>Your settled bills</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Stats are shown only once there is something to summarise */}
        {hasHistory && (
          <>
            <View style={s.statsRow}>
              <View style={s.statCard}>
                <View style={[s.iconWrap, { backgroundColor: "#FEF2F2" }]}>
                  <Ionicons name="arrow-down-outline" size={20} color="#EF4444" />
                </View>
                <Text style={s.statLabel}>Total Spent</Text>
                <Text style={s.statValue}>₹{stats.totalSpent.toFixed(2)}</Text>
              </View>
              <View style={s.statCard}>
                <View style={[s.iconWrap, { backgroundColor: "#ECFDF5" }]}>
                  <Ionicons name="arrow-up-outline" size={20} color="#10B981" />
                </View>
                <Text style={s.statLabel}>Total Received</Text>
                <Text style={s.statValue}>₹{stats.totalReceived.toFixed(2)}</Text>
              </View>
            </View>

            <View style={s.statsBadge}>
              <Text style={s.badgeText}>
                {stats.billsSettled} bill{stats.billsSettled !== 1 ? "s" : ""} settled
              </Text>
            </View>
          </>
        )}

        {/* List */}
        <Text style={s.sectionTitle}>Settled Groups</Text>

        {!hasHistory ? (
          <View style={s.emptyState}>
            <Ionicons name="folder-open-outline" size={32} color="#D1D5DB" />
            <Text style={s.emptyText}>No settled bills yet</Text>
            <Text style={s.emptySubtext}>
              Your completed bills will appear here.
            </Text>
          </View>
        ) : (
          <View style={s.groupList}>
            {settledGroups.map((group) => (
              <Pressable
                key={group.id}
                style={({ pressed }) => [s.groupCard, pressed && s.groupCardPressed]}
                onPress={() => router.push(`/group/${group.id}` as any)}
                accessibilityRole="button"
                accessibilityLabel={`Open ${group.title}`}
              >
                <View style={s.groupHeader}>
                  <Text style={s.groupTitle} numberOfLines={1}>{group.title}</Text>
                  <View style={s.settledBadge}>
                    <Ionicons name="checkmark-circle" size={13} color="#059669" />
                    <Text style={s.settledText}>Settled</Text>
                  </View>
                </View>

                <Text style={s.groupDate}>{formatDate(group.createdAt)}</Text>

                <View style={s.groupFooter}>
                  <View style={s.footerItem}>
                    <Ionicons name="people" size={16} color="#6B7280" />
                    <Text style={s.footerText}>
                      {group.participants.length} participant
                      {group.participants.length !== 1 ? "s" : ""}
                    </Text>
                  </View>
                  <Text style={s.groupAmount}>₹{group.totalAmount.toFixed(2)}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
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

  statsRow: { flexDirection: "row", gap: 16, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: "#ffffff", borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: "#F3F4F6",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  statLabel: { fontSize: 13, color: "#6B7280", fontWeight: "500", marginBottom: 4 },
  statValue: { fontSize: 24, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },

  statsBadge: { alignSelf: "flex-start", backgroundColor: "#F3F4F6", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginBottom: 32 },
  badgeText: { fontSize: 13, fontWeight: "600", color: "#374151" },

  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 16 },

  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 48, paddingHorizontal: 24, backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed" },
  emptyText: { fontSize: 15, color: "#9CA3AF", marginTop: 12, fontWeight: "500" },
  emptySubtext: { fontSize: 14, color: "#D1D5DB", marginTop: 6, textAlign: "center" },

  groupList: { gap: 16 },
  groupCard: {
    backgroundColor: "#ffffff",
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: "#E5E7EB",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 3,
  },
  groupCardPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  groupTitle: { fontSize: 18, fontWeight: "700", color: "#111827", flex: 1, marginRight: 12 },
  settledBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  settledText: { color: "#059669", fontSize: 12, fontWeight: "600" },
  groupDate: { fontSize: 13, color: "#9CA3AF", marginBottom: 20 },

  groupFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 14, color: "#4B5563", fontWeight: "500" },
  groupAmount: { fontSize: 20, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
});
