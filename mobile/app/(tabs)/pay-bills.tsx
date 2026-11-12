import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import { C } from "@/constants/colors";
import { TAB_BAR_CLEARANCE } from "@/constants/layout";
import { T } from "@/constants/typography";
import { rupeesExact } from "../../utils/formatRupees";

export default function PayBillsScreen() {
  const router = useRouter();
  const { groups } = useGroups();
  const { user } = useAuth();
  const me = user?.uid;
  // Only bills where YOU still owe or are owed money. A bill whose open
  // payments are between other people belongs on their screens, not yours.
  const myOpen = (g: (typeof groups)[number]) =>
    g.settlements.filter((t) => t.status === "pending" && (t.fromUserId === me || t.toUserId === me));
  const bills = groups
    .filter((g) => g.status === "active" && myOpen(g).length > 0)
    .map((g) => {
      const open = myOpen(g);
      const give = open.filter((t) => t.fromUserId === me).reduce((sum, t) => sum + t.amount, 0);
      const get = open.filter((t) => t.toUserId === me).reduce((sum, t) => sum + t.amount, 0);
      const paid = g.settlements.filter((t) => t.status === "paid").length;
      return { g, give, get, paid, count: g.settlements.length };
    });

  return (
    <SafeAreaView style={s.safeArea} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <Text style={s.title}>Pay</Text>
        <Text style={s.subtitle}>Bills you still owe on or are owed for</Text>
      </View>

      <ScrollView contentContainerStyle={[s.scroll, bills.length === 0 && s.scrollEmpty]} showsVerticalScrollIndicator={false}>
        {bills.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="checkmark-done" size={34} color={C.primary} />
            </View>
            <Text style={s.emptyTitle}>All settled up</Text>
            <Text style={s.emptySubtitle}>Bills where you owe money or are owed money will show up here.</Text>
          </View>
        ) : (
          <>
            <Text style={s.sectionTitle}>
              {bills.length} open bill{bills.length === 1 ? "" : "s"}
            </Text>

            <View style={s.list}>
              {bills.map(({ g, give, get, paid, count }) => {
                const pct = count ? Math.round((paid / count) * 100) : 0;
                const date = new Date(g.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short" });
                return (
                  <Pressable
                    key={g.id}
                    style={({ pressed }) => [s.card, pressed && s.cardPressed]}
                    onPress={() => router.push(`/group/${g.id}` as any)}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.title}. ${give > 0 ? `You'll give ${rupeesExact(give)}` : ""} ${get > 0 ? `You'll get ${rupeesExact(get)}` : ""}`}
                  >
                    <View style={s.cardTop}>
                      <Text style={s.cardTitle} numberOfLines={1}>{g.title}</Text>
                      <View style={s.amounts}>
                        {give > 0 && <Text style={[s.amount, { color: C.danger }]}>{rupeesExact(give)}</Text>}
                        {get > 0 && <Text style={[s.amount, { color: C.success }]}>{rupeesExact(get)}</Text>}
                      </View>
                    </View>

                    <View style={s.cardMeta}>
                      <Text style={s.metaText} numberOfLines={1}>
                        {date} · Total {rupeesExact(g.totalAmount)} · {g.participants.length} people
                      </Text>
                      <Text style={s.metaRole}>
                        {give > 0 && get > 0 ? "Give · Get" : give > 0 ? "You'll give" : "You'll get"}
                      </Text>
                    </View>

                    <View style={s.progressRow}>
                      <View style={s.track}>
                        <View style={[s.fill, { width: `${pct}%` }]} />
                      </View>
                      <Text style={s.progressText}>{paid} of {count} paid</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  title: { ...T.largeTitle, color: C.ink, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.textMuted },

  scroll: { paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE },
  scrollEmpty: { flexGrow: 1, justifyContent: "center" },

  emptyState: { alignItems: "center", marginTop: -60 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: C.primarySoft,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 18, maxWidth: 260 },

  sectionTitle: { fontSize: 13, fontWeight: "700", color: C.textMuted, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  list: { gap: 12 },
  card: {
    backgroundColor: C.glass, borderRadius: 18, borderWidth: 1, borderColor: C.glassBorder,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: C.ink },
  amounts: { alignItems: "flex-end" },
  amount: { fontSize: 16, fontWeight: "800", letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  cardMeta: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  metaText: { flex: 1, fontSize: 12, color: C.textMuted },
  metaRole: { fontSize: 11, color: C.textMuted, fontWeight: "600" },

  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.surfaceAlt, overflow: "hidden" },
  fill: { height: 4, borderRadius: 2, backgroundColor: C.success },
  progressText: { fontSize: 11, color: C.textMuted, fontWeight: "600", fontVariant: ["tabular-nums"] },
});
