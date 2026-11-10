// ---------------------------------------------------------------------------
// app/index.tsx
//
// Home screen — minimal: one balance card, one main action, and short
// Pending / Recent lists built from saved bills.
// Camera and gallery go directly to /preview (crop/auto-crop are available
// there); "Enter Manually" opens an empty bill for review.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { Alert, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { useGroups } from "../../hooks/useGroups";
import { computeHomeSummary } from "../../services/homeSummary";
import { billStore } from "../../services/billStore";
import { authStore } from "../../services/authStore";
import type { ParsedBill } from "../../types/bill";
import { C } from "@/constants/colors";
import { TAB_BAR_CLEARANCE } from "@/constants/layout";
import { T } from "@/constants/typography";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { groups } = useGroups();
  const summary = useMemo(() => computeHomeSummary(groups, user?.uid), [groups, user?.uid]);
  const firstName = user?.name?.split(" ")[0];
  const net = Math.round((summary.owedToYou - summary.youOwe) * 100) / 100;
  const isNewUser = groups.length === 0;

  const handleScanBill = () => {
    Alert.alert(
      "Add Bill",
      "Choose how you want to add the bill",
      [
        { text: "Take Photo",          onPress: handleCameraPress },
        { text: "Choose From Gallery", onPress: handleGalleryPress },
        { text: "Enter Manually",      onPress: handleManualEntry },
      ],
      // Android shows at most 3 buttons — tap outside to cancel.
      { cancelable: true }
    );
  };

  // ── Manual entry (no photo, no AI) ───────────────────────────────────────
  const handleManualEntry = () => {
    const emptyBill: ParsedBill = {
      isBill: true,
      restaurant: "Manual Bill",
      billNumber: "",
      date: new Date().toISOString().slice(0, 10),
      items: [],
      subtotal: 0,
      charges: [],
      total: 0,
      printedTotal: null,
    };
    billStore.set(emptyBill, "", null, authStore.get().user);
    router.push("/review-items");
  };

  // ── Camera ─────────────────────────────────────────────────────────────────
  const handleCameraPress = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false, // editing available on preview screen
      quality: 0.85,
    });

    if (!result.canceled) {
      router.push({ pathname: "/preview", params: { uri: result.assets[0].uri } });
    }
  };

  // ── Gallery ────────────────────────────────────────────────────────────────
  const handleGalleryPress = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false, // editing available on preview screen
      quality: 0.85,
    });

    if (!result.canceled) {
      router.push({ pathname: "/preview", params: { uri: result.assets[0].uri } });
    }
  };

  const openBill = (groupId: string) => router.push(`/group/${groupId}` as any);

  const handleSplitAmount = () => {
    Alert.alert(
      "Split an amount",
      "Open a group (or create one), then tap “Split an Amount”.",
      [{ text: "Go to Groups", onPress: () => router.push("/(tabs)/groups" as any) }],
      { cancelable: true }
    );
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const money = (n: number) => `₹${n.toFixed(2)}`;

  const pending = [
    ...summary.toPay.map((r) => ({ ...r, kind: "pay" as const })),
    ...summary.toReceive.map((r) => ({ ...r, kind: "receive" as const })),
  ]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  const recent = summary.recent.slice(0, 3);

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Hello{firstName ? "," : ""}</Text>
            <Text style={styles.name}>{firstName ?? "there"}</Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/profile" as any)}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            accessibilityLabel="Profile"
          >
            <Text style={styles.avatarText}>{(firstName ?? "B").charAt(0).toUpperCase()}</Text>
          </Pressable>
        </View>

        {/* Balance + main action — one black card with curved corners */}
        <View style={styles.heroCard}>
        <Pressable
          onPress={() => router.push("/(tabs)/pay-bills" as any)}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
        >
          <Text style={styles.caption}>Total balance</Text>
          <Text style={[styles.balance, net > 0 && styles.positiveOnDark, net < 0 && styles.negativeOnDark]}>
            {net > 0 ? "+" : net < 0 ? "−" : ""}{money(Math.abs(net))}
          </Text>
          <Text style={styles.balanceSub}>
            {net === 0 && summary.youOwe === 0
              ? "You're all settled up"
              : `Owed to you ${money(summary.owedToYou)}  ·  You owe ${money(summary.youOwe)}`}
          </Text>
        </Pressable>

        {/* Main action */}
        <Pressable
          onPress={handleScanBill}
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Split a bill</Text>
        </Pressable>
        <Pressable onPress={handleSplitAmount} hitSlop={8} style={styles.linkBtn}>
          <Text style={styles.linkText}>or split an amount without a bill</Text>
        </Pressable>
        </View>

        {/* Pending */}
        {pending.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Pending</Text>
              <Pressable onPress={() => router.push("/(tabs)/pay-bills" as any)} hitSlop={8}>
                <Text style={styles.seeAll}>See all</Text>
              </Pressable>
            </View>
            <View style={styles.list}>
              {pending.map((r, i) => (
                <Pressable
                  key={`${r.kind}-${r.groupId}-${r.personId}`}
                  onPress={() => openBill(r.groupId)}
                  style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.pressed]}
                >
                  <View style={styles.rowMain}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{r.personName}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {r.kind === "pay" ? "You owe" : "Owes you"} · {r.billTitle}
                    </Text>
                  </View>
                  <Text style={[styles.rowAmount, r.kind === "pay" ? styles.negative : styles.positive]}>
                    {money(r.amount)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        {/* Recent */}
        {recent.length > 0 ? (
          <>
            <Text style={[styles.sectionTitle, styles.sectionTitleAlone]}>Recent</Text>
            <View style={styles.list}>
              {recent.map((g, i) => {
                const open = g.settlements.filter((t) => t.status !== "paid").length;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => openBill(g.id)}
                    style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.pressed]}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{g.title}</Text>
                      <Text style={styles.rowSub}>
                        {formatDate(g.createdAt)} · {g.status === "settled" ? "Settled" : `${open} pending`}
                      </Text>
                    </View>
                    <Text style={styles.rowAmount}>{money(g.totalAmount)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          isNewUser && (
            <Text style={styles.emptyText}>
              Scan a receipt or enter it manually — your bills will show up here.
            </Text>
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: TAB_BAR_CLEARANCE },
  pressed: { opacity: 0.7 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  hello: { ...T.subhead, color: C.textMuted },
  name: { ...T.title1, color: C.ink },
  avatar: {
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.glassBorder,
  },
  avatarText: { ...T.headline, color: C.primary },

  heroCard: {
    backgroundColor: C.primaryDark, borderRadius: 28,
    paddingTop: 26, paddingHorizontal: 22, paddingBottom: 8, marginBottom: 8,
  },
  caption: { ...T.footnote, color: C.onDarkMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  balance: { fontSize: 40, fontWeight: "700", color: C.onDark, letterSpacing: -0.5, marginTop: 6 },
  balanceSub: { ...T.footnote, color: C.onDarkMuted, marginTop: 8, marginBottom: 22 },
  positive: { color: C.successDark },
  negative: { color: C.danger },
  // Brighter variants that stay readable on the black card
  positiveOnDark: { color: "#10B981" },
  negativeOnDark: { color: "#FB7185" },

  primaryBtn: { backgroundColor: C.primary, borderRadius: 16, paddingVertical: 17, alignItems: "center" },
  primaryBtnText: { ...T.headline, color: C.white },
  linkBtn: { alignItems: "center", paddingVertical: 14 },
  linkText: { ...T.subhead, color: "#34D399" },

  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 20, marginBottom: 10 },
  sectionTitle: { ...T.headline, color: C.ink },
  sectionTitleAlone: { marginTop: 20, marginBottom: 10 },
  seeAll: { ...T.subhead, color: C.primary },

  list: { backgroundColor: C.glass, borderRadius: 20, borderWidth: 1, borderColor: C.glassBorder, paddingHorizontal: 18 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 15, gap: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  rowMain: { flex: 1 },
  rowTitle: { ...T.callout, fontWeight: "600", color: C.ink },
  rowSub: { ...T.footnote, color: C.textMuted, marginTop: 2 },
  rowAmount: { ...T.callout, fontWeight: "600", color: C.ink },

  emptyText: { ...T.subhead, color: C.textMuted, textAlign: "center", marginTop: 24, paddingHorizontal: 24 },
});
