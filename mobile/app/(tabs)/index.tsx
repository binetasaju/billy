// ---------------------------------------------------------------------------
// app/index.tsx
//
// Home screen — a payments-app style overview built from saved bills:
//   balance card (you owe / you're owed) · quick actions · what to pay and
//   receive · people you split with · recent activity.
// Camera and gallery go directly to /preview (crop/auto-crop are available
// there); "Enter Manually" opens an empty bill for review.
// ---------------------------------------------------------------------------

import { useMemo } from "react";
import { Alert, View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import { useGroups } from "../../hooks/useGroups";
import { computeHomeSummary, type PendingRow } from "../../services/homeSummary";
import { billStore } from "../../services/billStore";
import { authStore } from "../../services/authStore";
import type { ParsedBill } from "../../types/bill";

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
      "Split an Amount",
      "Open a group (or create one), then tap “Split an Amount”.",
      [{ text: "Go to Groups", onPress: () => router.push("/(tabs)/groups" as any) }],
      { cancelable: true }
    );
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  const QUICK_ACTIONS: { icon: React.ComponentProps<typeof Ionicons>["name"]; label: string; onPress: () => void }[] = [
    { icon: "camera", label: "Scan Bill", onPress: handleCameraPress },
    { icon: "image", label: "Upload", onPress: handleGalleryPress },
    { icon: "create", label: "Enter\nManually", onPress: handleManualEntry },
    { icon: "calculator", label: "Split an\nAmount", onPress: handleSplitAmount },
  ];

  const renderPending = (row: PendingRow, kind: "pay" | "receive") => (
    <Pressable
      key={`${row.groupId}-${row.personId}`}
      onPress={() => openBill(row.groupId)}
      style={({ pressed }) => [styles.pendingRow, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={[styles.avatar, { backgroundColor: kind === "pay" ? "#FEE2E2" : "#D1FAE5" }]}>
        <Text style={[styles.avatarText, { color: kind === "pay" ? "#B91C1C" : "#047857" }]}>
          {row.personName.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {kind === "pay" ? `You owe ${row.personName}` : `${row.personName} owes you`}
        </Text>
        <Text style={styles.rowSub} numberOfLines={1}>{row.billTitle} · {formatDate(row.createdAt)}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={[styles.rowAmount, { color: kind === "pay" ? "#B91C1C" : "#047857" }]}>
          ₹{row.amount.toFixed(2)}
        </Text>
        <View style={[styles.chip, kind === "pay" ? styles.chipPay : styles.chipRequest]}>
          <Text style={[styles.chipText, kind === "pay" ? styles.chipPayText : styles.chipRequestText]}>
            {kind === "pay" ? "Pay" : "Request"}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{(firstName ?? "B").charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{firstName ? `Hi, ${firstName}` : "Hi there"} 👋</Text>
            <Text style={styles.subtitle}>Split bills, settle up fast</Text>
          </View>
          <Pressable
            onPress={() => router.push("/(tabs)/profile" as any)}
            hitSlop={10}
            style={styles.headerBtn}
            accessibilityLabel="Profile"
          >
            <Ionicons name="person-circle-outline" size={28} color="#111827" />
          </Pressable>
        </View>

        {/* ── Balance card ── */}
        <Pressable
          onPress={() => router.push("/(tabs)/pay-bills" as any)}
          style={({ pressed }) => [styles.balanceCard, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Open Pay Bills"
        >
          <Text style={styles.balanceLabel}>Your balance</Text>
          <Text style={styles.balanceNet}>
            {net > 0 ? `You're owed ₹${net.toFixed(2)}` : net < 0 ? `You owe ₹${Math.abs(net).toFixed(2)}` : "All settled up ✓"}
          </Text>
          <View style={styles.balanceSplit}>
            <View style={styles.balanceCol}>
              <View style={styles.balanceColHead}>
                <Ionicons name="arrow-up-circle" size={16} color="#FCA5A5" />
                <Text style={styles.balanceColLabel}>You owe</Text>
              </View>
              <Text style={styles.balanceColValue}>₹{summary.youOwe.toFixed(2)}</Text>
            </View>
            <View style={styles.balanceDivider} />
            <View style={styles.balanceCol}>
              <View style={styles.balanceColHead}>
                <Ionicons name="arrow-down-circle" size={16} color="#6EE7B7" />
                <Text style={styles.balanceColLabel}>You&apos;re owed</Text>
              </View>
              <Text style={styles.balanceColValue}>₹{summary.owedToYou.toFixed(2)}</Text>
            </View>
          </View>
        </Pressable>

        {/* ── Quick actions ── */}
        <View style={styles.quickRow}>
          {QUICK_ACTIONS.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={a.label.replace("\n", " ")}
            >
              <View style={styles.quickIcon}>
                <Ionicons name={a.icon} size={24} color="#1D4ED8" />
              </View>
              <Text style={styles.quickLabel}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        {isNewUser ? (
          /* ── First run ── */
          <View style={styles.card}>
            <Text style={styles.cardTitle}>How Billy works</Text>
            {[
              ["camera-outline", "Scan or upload a bill — Billy reads the items"],
              ["people-outline", "Pick who shared it and how to split"],
              ["paper-plane-outline", "Pay or request on UPI in one tap"],
            ].map(([icon, text]) => (
              <View key={text} style={styles.howRow}>
                <Ionicons name={icon as any} size={20} color="#1D4ED8" />
                <Text style={styles.howText}>{text}</Text>
              </View>
            ))}
            <Pressable onPress={handleScanBill} style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}>
              <Text style={styles.primaryBtnText}>Split your first bill</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* ── To pay / To receive ── */}
            {(summary.toPay.length > 0 || summary.toReceive.length > 0) && (
              <>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Pending</Text>
                  <Pressable onPress={() => router.push("/(tabs)/pay-bills" as any)} hitSlop={8}>
                    <Text style={styles.seeAll}>See all</Text>
                  </Pressable>
                </View>
                <View style={styles.card}>
                  {summary.toPay.slice(0, 3).map((r) => renderPending(r, "pay"))}
                  {summary.toReceive.slice(0, 3).map((r) => renderPending(r, "receive"))}
                </View>
              </>
            )}

            {/* ── People ── */}
            {summary.people.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>People</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.peopleRow}>
                  {summary.people.map((p) => (
                    <View key={p.id} style={styles.person}>
                      <View style={[styles.personAvatar, { backgroundColor: p.color ?? "#6B7280" }]}>
                        <Text style={styles.personAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                      <Text
                        style={[styles.personNet, p.net > 0 ? styles.positive : p.net < 0 ? styles.negative : null]}
                        numberOfLines={1}
                      >
                        {p.net > 0 ? `owes ₹${p.net.toFixed(0)}` : p.net < 0 ? `you owe ₹${Math.abs(p.net).toFixed(0)}` : "settled"}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              </>
            )}

            {/* ── Recent activity ── */}
            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>Recent activity</Text>
            <View style={styles.card}>
              {summary.recent.map((g, idx) => {
                const pending = g.settlements.filter((t) => t.status !== "paid").length;
                return (
                  <Pressable
                    key={g.id}
                    onPress={() => openBill(g.id)}
                    style={({ pressed }) => [styles.recentRow, idx > 0 && styles.rowBorder, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <View style={styles.recentIcon}>
                      <Ionicons name={g.billSnapshot?.items?.length ? "receipt-outline" : "calculator-outline"} size={18} color="#374151" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{g.title}</Text>
                      <Text style={styles.rowSub}>{formatDate(g.createdAt)} · {g.participants.length} people</Text>
                    </View>
                    <View style={styles.rowRight}>
                      <Text style={styles.rowAmount}>₹{g.totalAmount.toFixed(2)}</Text>
                      <Text style={[styles.statusText, g.status === "settled" ? styles.positive : styles.pending]}>
                        {g.status === "settled" ? "Settled" : `${pending} pending`}
                      </Text>
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

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F3F4F6" },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  pressed: { opacity: 0.75 },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 16, paddingBottom: 18 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#1D4ED8", alignItems: "center", justifyContent: "center" },
  headerAvatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  greeting: { fontSize: 20, fontWeight: "700", color: "#111827" },
  subtitle: { fontSize: 13, color: "#6B7280", marginTop: 1 },
  headerBtn: { padding: 4 },

  // Balance card
  balanceCard: { backgroundColor: "#111827", borderRadius: 22, padding: 20, marginBottom: 20 },
  balanceLabel: { fontSize: 13, color: "#9CA3AF", fontWeight: "500" },
  balanceNet: { fontSize: 26, fontWeight: "800", color: "#F9FAFB", marginTop: 4, letterSpacing: -0.5 },
  balanceSplit: { flexDirection: "row", marginTop: 18, backgroundColor: "#1F2937", borderRadius: 14, paddingVertical: 12 },
  balanceCol: { flex: 1, paddingHorizontal: 14 },
  balanceColHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  balanceColLabel: { fontSize: 12, color: "#D1D5DB", fontWeight: "500" },
  balanceColValue: { fontSize: 17, color: "#fff", fontWeight: "700", marginTop: 4 },
  balanceDivider: { width: 1, backgroundColor: "#374151" },

  // Quick actions
  quickRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#fff", borderRadius: 18, paddingVertical: 16, paddingHorizontal: 8, marginBottom: 20 },
  quickItem: { flex: 1, alignItems: "center", gap: 8 },
  quickIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center" },
  quickLabel: { fontSize: 12, color: "#111827", fontWeight: "600", textAlign: "center", lineHeight: 15 },

  // Sections
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  sectionTitleSpaced: { marginTop: 20, marginBottom: 10 },
  seeAll: { fontSize: 13, fontWeight: "600", color: "#1D4ED8" },
  card: { backgroundColor: "#fff", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 },

  // Pending rows
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontWeight: "700", fontSize: 16 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  rowSub: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  rowRight: { alignItems: "flex-end", gap: 4 },
  rowAmount: { fontSize: 15, fontWeight: "700", color: "#111827" },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  chipPay: { backgroundColor: "#1D4ED8" },
  chipRequest: { backgroundColor: "#ECFDF5", borderWidth: 1, borderColor: "#A7F3D0" },
  chipText: { fontSize: 12, fontWeight: "700" },
  chipPayText: { color: "#fff" },
  chipRequestText: { color: "#047857" },

  // People
  peopleRow: { gap: 14, paddingRight: 8 },
  person: { width: 72, alignItems: "center" },
  personAvatar: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  personAvatarText: { color: "#fff", fontWeight: "700", fontSize: 18 },
  personName: { fontSize: 12, fontWeight: "600", color: "#111827", marginTop: 6, maxWidth: 72 },
  personNet: { fontSize: 11, color: "#6B7280", marginTop: 1, maxWidth: 72 },

  // Recent
  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: "#F3F4F6" },
  recentIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  statusText: { fontSize: 12, fontWeight: "600" },
  positive: { color: "#047857" },
  negative: { color: "#B91C1C" },
  pending: { color: "#B45309" },

  // First run
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginTop: 10, marginBottom: 6 },
  howRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  howText: { flex: 1, fontSize: 14, color: "#374151" },
  primaryBtn: { backgroundColor: "#111827", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8, marginBottom: 12 },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
