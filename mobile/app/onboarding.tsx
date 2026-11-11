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
  ScrollView,
  ActivityIndicator,
} from "react-native";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authStore } from "../services/authStore";
import { useAuth } from "../hooks/useAuth";
import { C } from "@/constants/colors";
import { isValidPhoneNumber, normalizePhoneNumber } from "../utils/normalizePhoneNumber";

export default function OnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [upiId, setUpiId] = useState("");
  const [loading, setLoading] = useState(false);
  // Google sign-in doesn't give a phone number. It's optional (accounts come
  // first — docs/CLOUD_SYNC_PLAN.md); it only helps friends who add you from
  // their contacts.
  const needsPhone = !user?.phoneNumber;
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const handleFinish = async (skipUpi = false) => {
    if (needsPhone && phone.trim() && !isValidPhoneNumber(phone)) {
      setPhoneError("Enter a valid 10-digit mobile number, or leave it empty.");
      return;
    }
    setLoading(true);
    try {
      if (needsPhone && phone.trim()) {
        await authStore.updateUser({ phoneNumber: normalizePhoneNumber(phone) ?? phone.trim() });
      }
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
              <Ionicons name="wallet-outline" size={32} color={C.primary} />
            </View>
            <Text style={s.title}>
              {user?.name ? `Hey, ${user.name.split(" ")[0]}! 👋` : "One more thing"}
            </Text>
            <Text style={s.subtitle}>
              {needsPhone
                ? "Add your UPI ID so friends can pay you. Your phone number is optional."
                : "Add your UPI ID so friends can pay you directly. You can always add it later."}
            </Text>
          </View>

          {/* ── UPI field ── */}
          <View style={s.card}>
            {needsPhone && (
              <View style={s.phoneGroup}>
                <Text style={s.label}>Phone number</Text>
                <Text style={s.labelHint}>Optional · helps friends who add you from contacts</Text>
                <View style={[s.inputWrap, phoneError && s.inputError]}>
                  <Ionicons name="call-outline" size={18} color={C.textSubtle} style={s.inputIcon} />
                  <TextInput
                    style={s.input}
                    placeholder="98765 43210"
                    placeholderTextColor={C.borderStrong}
                    value={phone}
                    onChangeText={(t) => { setPhone(t); setPhoneError(null); }}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                  />
                </View>
                {phoneError && <Text style={s.phoneError}>{phoneError}</Text>}
              </View>
            )}
            <Text style={s.label}>UPI ID</Text>
            <Text style={s.labelHint}>Optional · e.g. arjun@upi or 9876543210@paytm</Text>
            <View style={s.inputWrap}>
              <Ionicons name="at-outline" size={18} color={C.textSubtle} style={s.inputIcon} />
              <TextInput
                style={s.input}
                placeholder="yourname@upi"
                placeholderTextColor={C.borderStrong}
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
            <Ionicons name="lock-closed-outline" size={14} color={C.textMuted} />
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
  phoneGroup: { marginBottom: 16 },
  inputError: { borderColor: C.danger, backgroundColor: C.dangerSoft },
  phoneError: { fontSize: 11, color: C.danger, marginTop: 5 },
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 },

  progress: { flexDirection: "row", gap: 6, justifyContent: "center", paddingTop: 20, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotDone: { backgroundColor: C.successDark, width: 24 },
  dotActive: { backgroundColor: C.primary, width: 24 },

  header: { alignItems: "center", marginBottom: 32 },
  iconWrap: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center",
    marginBottom: 18,
  },
  title: { fontSize: 19, fontWeight: "700", color: C.ink, textAlign: "center", letterSpacing: -0.4 },
  subtitle: { fontSize: 12, color: C.textMuted, textAlign: "center", marginTop: 8, lineHeight: 17, maxWidth: 300 },

  card: {
    backgroundColor: C.glass, borderWidth: 1, borderColor: C.glassBorder, borderRadius: 20,
    padding: 24, marginBottom: 20,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 0,
  },
  label: { fontSize: 12, fontWeight: "600", color: C.text, marginBottom: 3 },
  labelHint: { fontSize: 11, color: C.textSubtle, marginBottom: 12 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: C.border,
    borderRadius: 12, backgroundColor: C.bg,
    paddingHorizontal: 14, height: 52, marginBottom: 20,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: C.ink },

  btn: {
    backgroundColor: C.primary, paddingVertical: 16,
    borderRadius: 14, alignItems: "center", marginBottom: 12,
  },
  btnDisabled: { backgroundColor: C.textSubtle },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  skipBtn: { alignItems: "center", paddingVertical: 8 },
  skipText: { fontSize: 13, color: C.textMuted, fontWeight: "500" },

  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: C.surfaceAlt, borderRadius: 10, padding: 14,
  },
  infoText: { flex: 1, fontSize: 11, color: C.textMuted, lineHeight: 14 },
});
