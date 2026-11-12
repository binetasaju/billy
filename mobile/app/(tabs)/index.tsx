// ---------------------------------------------------------------------------
// app/index.tsx
//
// Home screen — minimal: one balance card, one main action, and short
// Pending / Recent lists built from saved bills.
// Camera and gallery go directly to /preview (crop/auto-crop are available
// there); "Enter Manually" opens an empty bill for review.
// ---------------------------------------------------------------------------

import { useMemo, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import { useGroups } from "../../hooks/useGroups";
import { computeHomeSummary } from "../../services/homeSummary";
import { billStore } from "../../services/billStore";
import { authStore } from "../../services/authStore";
import type { ParsedBill } from "../../types/bill";
import { C } from "@/constants/colors";
import { TAB_BAR_CLEARANCE } from "@/constants/layout";
import { T } from "@/constants/typography";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { rupeesExact } from "../../utils/formatRupees";
import { scanReceipt } from "../../services/documentScanner";
import { pickBillDocument } from "../../services/documentImport";

/** "Good morning" / "Good afternoon" / "Good evening" by the phone's clock. */
function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { groups } = useGroups();
  const summary = useMemo(() => computeHomeSummary(groups, user?.uid), [groups, user?.uid]);
  const firstName = user?.name?.split(" ")[0];
  // Balance card: everything still unpaid, all time — what you'll get and
  // what you'll give, side by side.
  const toGet = summary.owedToYou;
  const toGive = summary.youOwe;

  // "Add Bill" sheet. A custom sheet (not Alert.alert) so the options always
  // appear in this order — Android re-orders Alert buttons — and so there is
  // a real Cancel button.
  const [addBillOpen, setAddBillOpen] = useState(false);
  const handleScanBill = () => setAddBillOpen(true);
  const chooseAddBill = (action: () => void) => () => {
    setAddBillOpen(false);
    // Let the sheet close before opening the camera / gallery.
    setTimeout(action, 250);
  };
  const addBillOptions = [
    { label: "Take Photo",          onPress: () => handleCameraPress() },
    { label: "Choose From Gallery", onPress: () => handleGalleryPress() },
    { label: "Upload Bill File",    onPress: () => handleUploadPress() },
    { label: "Enter Manually",      onPress: () => handleManualEntry() },
  ];

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
  // Android: ML Kit Document Scanner (finds the edges, straightens and cleans
  // the receipt). Falls back to the plain camera when it isn't available.
  const handleCameraPress = async () => {
    const scan = await scanReceipt();
    if (scan.status === "success") {
      router.push({ pathname: "/preview", params: { uri: scan.uri } });
      return;
    }
    if (scan.status === "cancel") return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      appAlert.alert("Permission Required", "Please allow camera access.");
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
      appAlert.alert("Permission Required", "Please allow gallery access.");
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

  // ── Upload a bill file (PDF, image, email, text, Word/Excel…) ─────────────────────────────────
  const handleUploadPress = async () => {
    try {
      const picked = await pickBillDocument();
      if (!picked) return;
      if (picked.kind === "image") {
        router.push({ pathname: "/preview", params: { uri: picked.uri } });
      } else {
        router.push({
          pathname: "/import-document" as any,
          params: {
            uri: picked.uri,
            name: picked.name,
            mimeType: picked.mimeType ?? "",
            size: picked.size != null ? String(picked.size) : "",
          },
        });
      }
    } catch (e) {
      appAlert.alert("Couldn't open that file", e instanceof Error ? e.message : "Please try another file.");
    }
  };

  const openBill = (groupId: string) => router.push(`/group/${groupId}` as any);

  const handleSplitAmount = () => {
    appAlert.alert(
      "Split an amount",
      "Open a group (or create one), then tap “Split an Amount”.",
      [{ text: "Go to Groups", onPress: () => router.push("/(tabs)/groups" as any) }],
      { cancelable: true }
    );
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const money = (n: number) => `₹${n.toFixed(2)}`;
  // Balance card: whole rupees with Indian grouping (₹9,009 / ₹1,25,000),
  // both amounts in one shared size so they always line up and never cut off.
  // Exact (paise shown when present) so it adds up with the Pay tab.
  const getText = rupeesExact(toGet);
  const giveText = rupeesExact(toGive);
  const longest = Math.max(getText.length, giveText.length);
  const countText = (n: number) => (n === 0 ? "Nothing pending" : `${n} payment${n === 1 ? "" : "s"} pending`);
  const amountSize = longest <= 7 ? 24 : longest <= 9 ? 21 : longest <= 11 ? 18 : 16;

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
          {/* One line: "Good evening, Bineta" */}
          <Text style={styles.greeting} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            <Text style={styles.hello}>{greeting()}{firstName ? ", " : ""}</Text>
            {firstName ? <Text style={styles.name}>{firstName}</Text> : null}
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/profile" as any)}
            style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
            accessibilityLabel="Profile"
          >
            <UserAvatar photoUrl={user?.photoUrl} name={firstName ?? "B"} size={44} textStyle={styles.avatarText} />
          </Pressable>
        </View>

        {/* Balance + main action — one black card with curved corners */}
        <View style={styles.heroCard}>
        <Pressable
          onPress={() => router.push("/(tabs)/pay-bills" as any)}
          style={({ pressed }) => pressed && styles.pressed}
          accessibilityRole="button"
        >
          {/* You'll get | You'll give — all unpaid bills */}
          <View style={styles.balanceRow}>
            <View style={styles.balanceCol}>
              <Text style={styles.caption} numberOfLines={1}>You&apos;ll get</Text>
              <Text
                style={[styles.balance, { fontSize: amountSize, lineHeight: amountSize + 6 }, toGet > 0 && styles.positiveOnDark]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {getText}
              </Text>
              <Text style={styles.balanceColSub} numberOfLines={1}>{countText(summary.toReceive.length)}</Text>
            </View>

            <View style={styles.balanceDivider} />

            <View style={styles.balanceCol}>
              <Text style={styles.caption} numberOfLines={1}>You&apos;ll give</Text>
              <Text
                style={[styles.balance, { fontSize: amountSize, lineHeight: amountSize + 6 }, toGive > 0 && styles.negativeOnDark]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.6}
              >
                {giveText}
              </Text>
              <Text style={styles.balanceColSub} numberOfLines={1}>{countText(summary.toPay.length)}</Text>
            </View>
          </View>
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

        {/* Pending — title always shown; an empty card when there's nothing */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Pending</Text>
          {pending.length > 0 && (
            <Pressable onPress={() => router.push("/(tabs)/pay-bills" as any)} hitSlop={8}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          )}
        </View>
        {pending.length === 0 ? (
          <View style={[styles.list, styles.emptyCard]}>
            <Ionicons name="checkmark-done-circle-outline" size={22} color={C.textSubtle} />
            <Text style={styles.emptyCardText}>Nothing pending — you&apos;re all settled up.</Text>
          </View>
        ) : (
          <>
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

        {/* Recent — title always shown; an empty card when there are no bills */}
        <Text style={[styles.sectionTitle, styles.sectionTitleAlone]}>Recent</Text>
        {recent.length > 0 ? (
          <>
            <View style={styles.list}>
              {recent.map((g, i) => {
                const open = g.settlements.filter((t) => t.status === "pending").length;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => openBill(g.id)}
                    style={({ pressed }) => [styles.row, i > 0 && styles.rowDivider, pressed && styles.pressed]}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{g.title}</Text>
                      <Text style={styles.rowSub}>
                        {formatDate(g.createdAt)} ·{" "}
                        <Text style={g.status === "active" ? styles.statusActive : styles.statusSettled}>
                          {g.status === "settled" ? "Settled" : g.status === "closed" ? "Closed" : `${open} pending`}
                        </Text>
                      </Text>
                    </View>
                    <Text style={styles.rowAmount}>{money(g.totalAmount)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : (
          <View style={[styles.list, styles.emptyCard]}>
            <Ionicons name="receipt-outline" size={22} color={C.textSubtle} />
            <Text style={styles.emptyCardText}>
              No bills yet. Tap “Split a bill” to scan a receipt or enter one manually.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Add Bill sheet */}
      <Modal
        visible={addBillOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAddBillOpen(false)}
      >
        <Pressable style={styles.sheetBackdrop} onPress={() => setAddBillOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Add Bill</Text>
            <Text style={styles.sheetSub}>Choose how you want to add the bill</Text>
            {addBillOptions.map((o) => (
              <Pressable
                key={o.label}
                onPress={chooseAddBill(o.onPress)}
                style={({ pressed }) => [styles.sheetOption, pressed && styles.pressed]}
                accessibilityRole="button"
              >
                <Text style={styles.sheetOptionText}>{o.label}</Text>
              </Pressable>
            ))}
            <Pressable
              onPress={() => setAddBillOpen(false)}
              style={({ pressed }) => [styles.sheetCancel, pressed && styles.pressed]}
              accessibilityRole="button"
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: TAB_BAR_CLEARANCE },
  pressed: { opacity: 0.7 },

  // Add Bill sheet
  sheetBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 36,
  },
  sheetTitle: { ...T.title3, color: C.ink },
  sheetSub: { ...T.subhead, color: C.textMuted, marginTop: 4, marginBottom: 12 },
  sheetOption: {
    paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.separator,
  },
  sheetOptionText: { ...T.body, color: C.ink, fontWeight: "600" },
  sheetCancel: {
    marginTop: 16, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: C.surfaceAlt,
  },
  sheetCancelText: { ...T.body, color: C.textMuted, fontWeight: "600" },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 26 },
  greeting: { flex: 1, fontSize: 24, lineHeight: 30, letterSpacing: -0.6 },
  hello: { fontWeight: "500", color: C.textMuted },
  name: { fontWeight: "800", color: C.ink },
  // Photo inside a thin logo-green ring
  avatar: {
    width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center",
    backgroundColor: C.primarySoft, borderWidth: 2, borderColor: C.brand, overflow: "hidden",
  },
  avatarText: { fontSize: 17, fontWeight: "700", color: C.brand },

  heroCard: {
    backgroundColor: C.primaryDark, borderRadius: 28,
    paddingTop: 22, paddingHorizontal: 18, paddingBottom: 8, marginBottom: 8,
  },
  caption: { ...T.footnote, color: C.onDarkMuted, textTransform: "uppercase", letterSpacing: 0.6, textAlign: "center" },
  // Two equal, centred columns: this month | earlier months
  balance: {
    fontSize: 22, lineHeight: 28, fontWeight: "700", color: C.onDark, letterSpacing: -0.5,
    marginTop: 6, textAlign: "center", fontVariant: ["tabular-nums"],
  },
  balanceRow: { flexDirection: "row", alignItems: "center", marginBottom: 22 },
  balanceCol: { flex: 1, alignItems: "center" },
  balanceDivider: { width: 1, height: 56, backgroundColor: C.onDarkLine, marginHorizontal: 12 },
  balanceColSub: { fontSize: 11, lineHeight: 14, color: C.onDarkMuted, marginTop: 6, textAlign: "center" },
  positive: { color: C.successDark },
  negative: { color: C.ink },
  // Brighter variants that stay readable on the black card
  // Status colours — amber = still owed, green = settled
  statusActive: { color: C.statusActiveText, fontWeight: "600" },
  statusSettled: { color: C.statusSettledText, fontWeight: "600" },
  positiveOnDark: { color: "#10B981" },
  negativeOnDark: { color: C.onDark },

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

  emptyCard: { alignItems: "center", gap: 8, paddingVertical: 22 },
  emptyCardText: { ...T.subhead, color: C.textMuted, textAlign: "center", lineHeight: 19 },
});
