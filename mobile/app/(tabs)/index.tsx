// ---------------------------------------------------------------------------
// app/index.tsx
//
// Home screen. Camera and gallery go directly to /preview (crop/auto-crop
// are available there); "Enter Manually" opens an empty bill for review.
// ---------------------------------------------------------------------------

import { Alert, View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../hooks/useAuth";
import { billStore } from "../../services/billStore";
import { authStore } from "../../services/authStore";
import type { ParsedBill } from "../../types/bill";

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useAuth();

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

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Text style={styles.greeting}>
          {user?.name ? `Hey, ${user.name.split(" ")[0]}` : "Hey there"} 👋
        </Text>
        <Text style={styles.subtitle}>Ready to split a bill?</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          onPress={handleScanBill}
          style={({ pressed }) => [styles.actionCard, styles.actionCardPrimary, pressed && styles.pressed]}
        >
          <View style={styles.iconWrapPrimary}>
            <Ionicons name="receipt" size={24} color="#ffffff" />
          </View>
          <Text style={styles.actionTitlePrimary}>Scan Bill</Text>
          <Text style={styles.actionSubtitlePrimary}>Split a new receipt</Text>
        </Pressable>

        <Pressable
          onPress={() => Alert.alert("Coming Soon", "Joining via QR code or link will be available soon.")}
          style={({ pressed }) => [styles.actionCard, styles.actionCardSecondary, pressed && styles.pressed]}
        >
          <View style={styles.iconWrapSecondary}>
            <Ionicons name="qr-code" size={24} color="#1D4ED8" />
          </View>
          <Text style={styles.actionTitleSecondary}>Join Group</Text>
          <Text style={styles.actionSubtitleSecondary}>Scan to join</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => router.push("/add-debt" as any)}
        style={({ pressed }) => [styles.oweRow, pressed && styles.pressed]}
        accessibilityRole="button"
      >
        <Ionicons name="swap-horizontal" size={20} color="#111827" />
        <View style={{ flex: 1 }}>
          <Text style={styles.oweTitle}>Owe someone?</Text>
          <Text style={styles.oweSubtitle}>Record money owed without a bill</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
      </Pressable>

      <View style={styles.recentSection}>
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={32} color="#D1D5DB" />
          <Text style={styles.emptyText}>No recent activity yet</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  oweRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 20, marginTop: 16, padding: 16,
    backgroundColor: "#fff", borderRadius: 16, borderWidth: 1, borderColor: "#E5E7EB",
  },
  oweTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  oweSubtitle: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
  },
  greeting: { fontSize: 28, fontWeight: "800", color: "#111827", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#6B7280" },
  
  actionRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 16,
    marginBottom: 32,
  },
  actionCard: {
    flex: 1,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 4,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  
  actionCardPrimary: { backgroundColor: "#111827" },
  iconWrapPrimary: { width: 48, height: 48, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  actionTitlePrimary: { fontSize: 18, fontWeight: "700", color: "#ffffff", marginBottom: 4 },
  actionSubtitlePrimary: { fontSize: 13, color: "#9CA3AF" },

  actionCardSecondary: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#E5E7EB" },
  iconWrapSecondary: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  actionTitleSecondary: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 4 },
  actionSubtitleSecondary: { fontSize: 13, color: "#6B7280" },

  recentSection: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 28,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 8,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 20 },
  emptyState: { alignItems: "center", justifyContent: "center", marginTop: 40 },
  emptyText: { fontSize: 15, color: "#9CA3AF", marginTop: 12, fontWeight: "500" },
});