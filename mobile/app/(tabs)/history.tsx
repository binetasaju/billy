// ---------------------------------------------------------------------------
// app/(tabs)/history.tsx
//
// Month-by-month history: pick a month (‹ This month ›), see what you spent
// and received that month, and the bills settled in it. Every figure is
// derived from saved bills (services/monthlyStats.ts) — nothing is stored.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import { browsableMonths, historyAt, monthKey, monthLabel, summarizeMonth } from "../../services/monthlyStats";
import { C } from "@/constants/colors";
import { TAB_BAR_CLEARANCE } from "@/constants/layout";
import { T } from "@/constants/typography";

const money = (n: number) => `₹${n.toFixed(2)}`;

export default function HistoryScreen() {
  const router = useRouter();
  const { groups, isLoading } = useGroups();
  const { user } = useAuth();

  const months = useMemo(() => browsableMonths(groups), [groups]);
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const idx = Math.max(0, months.indexOf(month));
  const canGoNewer = idx > 0;
  const canGoOlder = idx < months.length - 1;

  const summary = useMemo(() => summarizeMonth(groups, user?.uid, month), [groups, user?.uid, month]);
  const net = Math.round((summary.received - summary.spent) * 100) / 100;
  const label = monthLabel(month);
  const inLabel = label === "This month" || label === "Last month" ? label.toLowerCase() : `in ${label}`;

  const formatDay = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <SafeAreaView style={s.safeArea} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>History</Text>

        {/* Month switcher */}
        <View style={s.monthBar}>
          <Pressable
            onPress={() => canGoOlder && setMonth(months[idx + 1])}
            disabled={!canGoOlder}
            hitSlop={10}
            style={[s.arrow, !canGoOlder && s.arrowDisabled]}
            accessibilityLabel="Previous month"
          >
            <Ionicons name="chevron-back" size={20} color={C.ink} />
          </Pressable>
          <Text style={s.monthLabel}>{label}</Text>
          <Pressable
            onPress={() => canGoNewer && setMonth(months[idx - 1])}
            disabled={!canGoNewer}
            hitSlop={10}
            style={[s.arrow, !canGoNewer && s.arrowDisabled]}
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={20} color={C.ink} />
          </Pressable>
        </View>

        {isLoading ? (
          <ActivityIndicator size="large" color={C.textSubtle} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Month totals */}
            <View style={s.statsCard}>
              <View style={s.statsRow}>
                <View style={s.statCol}>
                  <Text style={s.statLabel}>Spent</Text>
                  <Text style={[s.statValue, s.spent]}>{money(summary.spent)}</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statCol}>
                  <Text style={s.statLabel}>Received</Text>
                  <Text style={[s.statValue, s.received]}>{money(summary.received)}</Text>
                </View>
              </View>
              <Text style={s.statFoot}>
                {summary.paymentCount === 0
                  ? `No payments ${inLabel}`
                  : `Net ${net > 0 ? "+" : net < 0 ? "−" : ""}${money(Math.abs(net))}  ·  ${summary.paymentCount} payment${summary.paymentCount !== 1 ? "s" : ""}`}
              </Text>
            </View>

            {/* Bills done for you this month: settled, closed, or your part paid */}
            <Text style={s.sectionTitle}>Done {inLabel}</Text>
            {summary.settledBills.length === 0 ? (
              <Text style={s.emptyText}>No bills were done {inLabel}.</Text>
            ) : (
              <View style={s.list}>
                {summary.settledBills.map((g, i) => (
                  <Pressable
                    key={g.id}
                    onPress={() => router.push(`/group/${g.id}` as any)}
                    style={({ pressed }) => [s.row, i > 0 && s.rowDivider, pressed && s.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${g.title}`}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowTitle} numberOfLines={1}>{g.title}</Text>
                      <Text style={s.rowSub}>
                        {g.status === "closed"
                          ? "Closed"
                          : g.status === "settled"
                          ? "Settled"
                          : "Your part paid"}{" "}
                        {formatDay(historyAt(g, user?.uid) ?? g.updatedAt ?? g.createdAt)} · {g.participants.length} people
                      </Text>
                    </View>
                    <Text style={s.rowAmount}>{money(g.totalAmount)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: TAB_BAR_CLEARANCE },
  pressed: { opacity: 0.7 },
  title: { ...T.largeTitle, color: C.ink, marginBottom: 16 },

  monthBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder,
    borderRadius: 999, paddingVertical: 6, paddingHorizontal: 8, marginBottom: 16,
  },
  arrow: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: C.glassStrong },
  arrowDisabled: { opacity: 0.3 },
  monthLabel: { ...T.headline, color: C.ink },

  statsCard: { backgroundColor: C.primaryDark, borderRadius: 28, paddingVertical: 22, paddingHorizontal: 22, marginBottom: 24 },
  statsRow: { flexDirection: "row", alignItems: "center" },
  statCol: { flex: 1 },
  statDivider: { width: 1, alignSelf: "stretch", backgroundColor: C.onDarkLine, marginHorizontal: 18 },
  statLabel: { ...T.footnote, color: C.onDarkMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  statValue: { fontSize: 20, fontWeight: "700", letterSpacing: -0.3, marginTop: 6 },
  spent: { color: C.onDark },
  received: { color: "#10B981" },
  statFoot: { ...T.footnote, color: C.onDarkMuted, marginTop: 16 },

  sectionTitle: { ...T.headline, color: C.ink, marginBottom: 10 },
  emptyText: { ...T.subhead, color: C.textMuted, marginTop: 4 },
  list: { backgroundColor: C.glass, borderRadius: 20, borderWidth: 1, borderColor: C.glassBorder, paddingHorizontal: 18 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 15, gap: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  rowTitle: { ...T.callout, fontWeight: "600", color: C.ink },
  rowSub: { ...T.footnote, color: C.textMuted, marginTop: 2 },
  rowAmount: { ...T.callout, fontWeight: "600", color: C.ink },
});
