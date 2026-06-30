import { View, Text, StyleSheet, SafeAreaView, Pressable, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGroups } from "../../hooks/useGroups";

export default function PayBillsScreen() {
  const router = useRouter();
  const { groups } = useGroups();
  const activeGroups = groups.filter((g) => g.status === "active");
  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Text style={s.title}>Pay Bills</Text>
        <Text style={s.subtitle}>Active groups & settlements</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {activeGroups.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="card-outline" size={40} color="#9CA3AF" />
            </View>
            <Text style={s.emptyTitle}>No active groups yet</Text>
            <Text style={s.emptySubtitle}>
              When you scan a bill and split it, the active group will appear here.
            </Text>

            <Pressable
              style={({ pressed }) => [s.btn, pressed && s.btnPressed, s.btnDisabled]}
              disabled={true}
            >
              <Text style={s.btnText}>Create from Last Bill</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.groupList}>
            {activeGroups.map((group) => (
              <Pressable
                key={group.id}
                style={({ pressed }) => [s.groupCard, pressed && s.groupCardPressed]}
                onPress={() => router.push(`/group/${group.id}` as any)}
              >
                <View style={s.groupHeader}>
                  <Text style={s.groupTitle} numberOfLines={1}>{group.title}</Text>
                  <View style={s.statusBadge}>
                    <Text style={s.statusText}>Active</Text>
                  </View>
                </View>
                
                <Text style={s.groupDate}>
                  {new Date(group.createdAt).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric"
                  })}
                </Text>

                <View style={s.groupFooter}>
                  <View style={s.footerItem}>
                    <Ionicons name="people" size={16} color="#6B7280" />
                    <Text style={s.footerText}>{group.participants.length} participants</Text>
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

  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40, justifyContent: "center" },
  emptyState: { alignItems: "center", justifyContent: "center", marginTop: -60 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#F3F4F6",
    alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 8 },
  emptySubtitle: { fontSize: 15, color: "#6B7280", textAlign: "center", lineHeight: 22, maxWidth: 280, marginBottom: 32 },

  btn: {
    backgroundColor: "#111827",
    paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 14, alignItems: "center", width: "100%", maxWidth: 260,
  },
  btnPressed: { opacity: 0.8 },
  btnDisabled: { backgroundColor: "#D1D5DB" },
  btnText: { color: "#ffffff", fontSize: 16, fontWeight: "700" },

  groupList: { gap: 16, paddingTop: 8 },
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
  statusBadge: { backgroundColor: "#ECFDF5", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: "#059669", fontSize: 12, fontWeight: "600" },
  groupDate: { fontSize: 13, color: "#9CA3AF", marginBottom: 20 },
  
  groupFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 14, color: "#4B5563", fontWeight: "500" },
  groupAmount: { fontSize: 20, fontWeight: "800", color: "#111827", letterSpacing: -0.5 },
});
