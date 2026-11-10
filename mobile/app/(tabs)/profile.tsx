// ---------------------------------------------------------------------------
// app/profile.tsx
//
// Profile screen — shows current user info and provides logout.
// ---------------------------------------------------------------------------

import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert, Modal, TextInput, KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { authStore } from "../../services/authStore";
import { useAuth } from "../../hooks/useAuth";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";

export default function ProfileScreen() {
  const { user } = useAuth();
  
  const [editUpiVisible, setEditUpiVisible] = useState(false);
  const [upiDraft, setUpiDraft] = useState("");

  const openUpiEdit = () => {
    setUpiDraft(user?.upiId ?? "");
    setEditUpiVisible(true);
  };

  const saveUpi = async () => {
    const trimmed = upiDraft.trim();
    await authStore.updateUser({ upiId: trimmed || undefined });
    setEditUpiVisible(false);
  };

  const handleLogout = () => {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            await authStore.logout();
            // AuthGate in _layout.tsx will redirect to /login automatically
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.title}>Profile</Text>
        </View>

        {/* ── Avatar + name ── */}
        <View style={s.avatarCard}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>
              {user?.name?.charAt(0).toUpperCase() ?? "?"}
            </Text>
          </View>
          <Text style={s.name}>{user?.name ?? "—"}</Text>
          <Text style={s.phone}>{user?.phoneNumber ?? "No phone"}</Text>
        </View>

        {/* ── Details ── */}
        <View style={s.card}>
          <Row icon="call-outline" label="Phone" value={user?.phoneNumber ?? "—"} />
          <View style={s.divider} />
          <Pressable onPress={openUpiEdit}>
            <Row 
              icon="wallet-outline" 
              label="UPI ID" 
              value={user?.upiId ?? "Not set — tap to edit"} 
              muted={!user?.upiId} 
              actionIcon="pencil-outline"
            />
          </Pressable>
          <View style={s.divider} />
          <Row icon="finger-print-outline" label="User ID" value={user?.uid ?? "—"} mono />
        </View>

        {/* ── Logout ── */}
        <Pressable style={s.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={C.danger} />
          <Text style={s.logoutText}>Log Out</Text>
        </Pressable>

      </ScrollView>

      {/* ── Edit UPI Modal ── */}
      <Modal visible={editUpiVisible} animationType="slide" transparent>
        <KeyboardAvoidingView style={s.modalBackdrop} behavior="padding">
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Edit UPI ID</Text>
            <Text style={s.modalLabel}>Enter your UPI ID (e.g., name@okbank)</Text>
            <TextInput
              style={s.modalInput}
              value={upiDraft}
              onChangeText={setUpiDraft}
              placeholder="yourname@upi"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveUpi}
              autoFocus
            />
            <View style={s.modalActions}>
              <Pressable onPress={() => setEditUpiVisible(false)} style={s.modalCancelBtn}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveUpi} style={s.modalSaveBtn}>
                <Text style={s.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Row({
  icon, label, value, muted = false, mono = false, actionIcon,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  muted?: boolean;
  mono?: boolean;
  actionIcon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={s.row}>
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={18} color={C.textMuted} />
      </View>
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={[s.rowValue, muted && s.rowValueMuted, mono && s.rowValueMono]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {actionIcon && (
        <View style={{ paddingLeft: 8 }}>
          <Ionicons name={actionIcon} size={18} color={C.textSubtle} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  header: { marginTop: 24, marginBottom: 24 },
  title: { ...T.largeTitle, color: C.ink },

  avatarCard: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12,
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 0,
  },
  avatarText: { color: "#fff", fontSize: 32, fontWeight: "700" },
  name: { fontSize: 22, fontWeight: "700", color: C.ink, letterSpacing: -0.3 },
  phone: { fontSize: 14, color: C.textMuted, marginTop: 4 },

  card: {
    backgroundColor: "#fff", borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    marginBottom: 24, overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: C.surfaceAlt, marginLeft: 52 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon: { width: 36, alignItems: "center" },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 12, color: C.textSubtle, fontWeight: "500", marginBottom: 2 },
  rowValue: { fontSize: 15, color: C.ink, fontWeight: "500" },
  rowValueMuted: { color: C.textSubtle },
  rowValueMono: { fontFamily: "monospace", fontSize: 12, color: C.text },

  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: "#FEE2E2", backgroundColor: "#FFF5F5",
  },
  logoutText: { fontSize: 16, fontWeight: "700", color: C.danger },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: C.ink, marginBottom: 6 },
  modalLabel: { fontSize: 14, color: C.textMuted, marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 16, color: C.ink, marginBottom: 24, backgroundColor: C.bg },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  modalCancelText: { color: C.text, fontWeight: "600", fontSize: 15 },
  modalSaveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: "center" },
  modalSaveText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
