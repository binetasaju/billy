// ---------------------------------------------------------------------------
// app/onboarding.tsx
//
// Post-login onboarding screen — collects optional UPI ID.
//
// This screen runs once after first login. Future phases can add:
//   • Profile photo upload
//   • Notification permission request
//   • Contact sync opt-in
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authStore } from "../services/authStore";
import { useAuth } from "../hooks/useAuth";

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [upiId, setUpiId] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFinish = async (skipUpi = false) => {
    setLoading(true);
    try {
      if (!skipUpi && upiId.trim()) {
        await authStore.updateUser({ upiId: upiId.trim() });
      }
      router.replace("/" as any);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Progress dots ── */}
          <View style={s.progress}>
            <View style={[s.dot, s.dotDone]} />
            <View style={[s.dot, s.dotActive]} />
          </View>

          {/* ── Header ── */}
          <View style={s.header}>
            <View style={s.iconWrap}>
              <Ionicons name="wallet-outline" size={32} color="#1D4ED8" />
            </View>
            <Text style={s.title}>
              {user?.name ? `Hey, ${user.name.split(" ")[0]}! 👋` : "One more thing"}
            </Text>
            <Text style={s.subtitle}>
              Add your UPI ID so friends can pay you directly. You can always add it later.
            </Text>
          </View>

          {/* ── UPI field ── */}
          <View style={s.card}>
            <Text style={s.label}>UPI ID</Text>
            <Text style={s.labelHint}>Optional · e.g. arjun@upi or 9876543210@paytm</Text>
            <View style={s.inputWrap}>
              <Ionicons name="at-outline" size={18} color="#9CA3AF" style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="yourname@upi"
                placeholderTextColor="#D1D5DB"
                value={upiId}
                onChangeText={setUpiId}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={() => handleFinish(false)}
              />
            </View>

            {/* ── Actions ── */}
            <Pressable
              style={[s.btn, loading && s.btnDisabled]}
              onPress={() => handleFinish(false)}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Save & Continue →</Text>
              }
            </Pressable>

            <Pressable
              style={s.skipBtn}
              onPress={() => handleFinish(true)}
              disabled={loading}
            >
              <Text style={s.skipText}>Skip for now</Text>
            </Pressable>
          </View>

          {/* ── Info note ── */}
          <View style={s.infoBox}>
            <Ionicons name="lock-closed-outline" size={14} color="#6B7280" />
            <Text style={s.infoText}>
              Your UPI ID is stored locally. Billy never charges or debits your account.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },

  progress: { flexDirection: "row", gap: 6, justifyContent: "center", paddingTop: 20, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#E5E7EB" },
  dotDone: { backgroundColor: "#059669", width: 24 },
  dotActive: { backgroundColor: "#111827", width: 24 },

  header: { alignItems: "center", marginBottom: 32 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 24, fontWeight: "700", color: "#111827", textAlign: "center", letterSpacing: -0.4 },
  subtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", marginTop: 8, lineHeight: 20, maxWidth: 300 },

  card: {
    backgroundColor: "#fff", borderRadius: 20,
    padding: 24, marginBottom: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 4,
  },
  label: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 3 },
  labelHint: { fontSize: 12, color: "#9CA3AF", marginBottom: 12 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#E5E7EB",
    borderRadius: 12, backgroundColor: "#F9FAFB",
    paddingHorizontal: 14, height: 52, marginBottom: 20,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: "#111827" },

  btn: {
    backgroundColor: "#111827", paddingVertical: 16,
    borderRadius: 14, alignItems: "center", marginBottom: 12,
  },
  btnDisabled: { backgroundColor: "#9CA3AF" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipBtn: { alignItems: "center", paddingVertical: 8 },
  skipText: { fontSize: 15, color: "#6B7280", fontWeight: "500" },

  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#F3F4F6", borderRadius: 10, padding: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: "#6B7280", lineHeight: 17 },
});
