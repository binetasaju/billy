import { View, Text, StyleSheet, SafeAreaView, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export default function HistoryScreen() {
  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Text style={s.title}>History</Text>
        <Text style={s.subtitle}>Your settled bills</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Stats Row */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <View style={[s.iconWrap, { backgroundColor: "#FEF2F2" }]}>
              <Ionicons name="arrow-down-outline" size={20} color="#EF4444" />
            </View>
            <Text style={s.statLabel}>Total Spent</Text>
            <Text style={s.statValue}>₹0.00</Text>
          </View>
          <View style={s.statCard}>
            <View style={[s.iconWrap, { backgroundColor: "#ECFDF5" }]}>
              <Ionicons name="arrow-up-outline" size={20} color="#10B981" />
            </View>
            <Text style={s.statLabel}>Total Received</Text>
            <Text style={s.statValue}>₹0.00</Text>
          </View>
        </View>

        <View style={s.statsBadge}>
          <Text style={s.badgeText}>0 bills settled</Text>
        </View>

        {/* List */}
        <Text style={s.sectionTitle}>Settled Groups</Text>
        <View style={s.emptyState}>
          <Ionicons name="folder-open-outline" size={32} color="#D1D5DB" />
          <Text style={s.emptyText}>No settled history yet</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  title: { fontSize: 28, fontWeight: "800", color: "#111827", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#6B7280" },

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
  
  emptyState: { alignItems: "center", justifyContent: "center", paddingVertical: 48, backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB", borderStyle: "dashed" },
  emptyText: { fontSize: 15, color: "#9CA3AF", marginTop: 12, fontWeight: "500" },
});
