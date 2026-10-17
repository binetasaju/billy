// ---------------------------------------------------------------------------
// app/login.tsx
//
// Sign in with name + phone number.
//
// The screen does not know or care which provider authenticates: it asks
// authStore, and shows the SMS-code step only if the active provider asks for
// one. With the default local provider that step never appears, so this flow
// is unchanged from before.
// ---------------------------------------------------------------------------

import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { authStore } from "../services/authStore";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber";

export default function LoginScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string; code?: string }>({});

  // Set only when the active provider requires an SMS code.
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const validate = (): boolean => {
    const newErrors: { name?: string; phone?: string } = {};
    if (!name.trim()) newErrors.name = "Please enter your name.";
    if (!phone.trim()) {
      newErrors.phone = "Please enter your phone number.";
    } else {
      const norm = normalizePhoneNumber(phone);
      if (!norm || norm.length < 10) {
        newErrors.phone = "Please enter a valid phone number.";
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinue = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const result = await authStore.signInWithPhone(name, phone);

      if (result.status === "verification-required") {
        // Provider sent an SMS — collect the code before the session opens.
        setVerificationId(result.verificationId);
        return;
      }

      // Session is already open (local provider).
      router.replace("/onboarding" as any);
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        phone: e instanceof Error ? e.message : "Could not sign in. Please try again.",
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!verificationId) return;
    if (!code.trim()) {
      setErrors((e) => ({ ...e, code: "Enter the code we sent you." }));
      return;
    }
    setLoading(true);
    try {
      await authStore.confirmPhoneSignIn(verificationId, code.trim(), name);
      router.replace("/onboarding" as any);
    } catch (e) {
      setErrors((prev) => ({
        ...prev,
        code: e instanceof Error ? e.message : "That code did not work.",
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "android" ? 0 : 0}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Brand ── */}
          <View style={s.brand}>
            <View style={s.logoWrap}>
              <Ionicons name="receipt-outline" size={36} color="#fff" />
            </View>
            <Text style={s.appName}>Billy</Text>
            <Text style={s.tagline}>Split bills, not friendships.</Text>
          </View>

          {/* ── Card ── */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Get started</Text>
            <Text style={s.cardSubtitle}>
              Enter your details to continue.
            </Text>

            {/* Name */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Your Name</Text>
              <View style={[s.inputWrap, errors.name && s.inputError]}>
                <Ionicons name="person-outline" size={18} color="#9CA3AF" style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="e.g. Arjun Sharma"
                  placeholderTextColor="#D1D5DB"
                  value={name}
                  onChangeText={(t) => { setName(t); setErrors((e) => ({ ...e, name: undefined })); }}
                  autoCapitalize="words"
                  returnKeyType="next"
                  blurOnSubmit={false}
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
              {errors.name && <Text style={s.errorText}>{errors.name}</Text>}
            </View>

            {/* Phone */}
            <View style={s.fieldGroup}>
              <Text style={s.label}>Phone Number</Text>
              <View style={[s.inputWrap, errors.phone && s.inputError]}>
                <Ionicons name="call-outline" size={18} color="#9CA3AF" style={s.inputIcon} />
                <TextInput
                  style={s.input}
                  placeholder="+91 98765 43210"
                  placeholderTextColor="#D1D5DB"
                  value={phone}
                  onChangeText={(t) => { setPhone(t); setErrors((e) => ({ ...e, phone: undefined })); }}
                  keyboardType="phone-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => Keyboard.dismiss()}
                />
              </View>
              {errors.phone && <Text style={s.errorText}>{errors.phone}</Text>}
            </View>

            {/* Verification code — only shown when the provider sent one */}
            {verificationId && (
              <View style={s.fieldGroup}>
                <Text style={s.label}>Verification Code</Text>
                <View style={[s.inputWrap, errors.code && s.inputError]}>
                  <Ionicons name="keypad-outline" size={18} color="#9CA3AF" style={s.inputIcon} />
                  <TextInput
                    style={s.input}
                    placeholder="6-digit code"
                    placeholderTextColor="#D1D5DB"
                    value={code}
                    onChangeText={(t) => { setCode(t); setErrors((e) => ({ ...e, code: undefined })); }}
                    keyboardType="number-pad"
                    returnKeyType="done"
                    onSubmitEditing={handleConfirmCode}
                  />
                </View>
                {errors.code && <Text style={s.errorText}>{errors.code}</Text>}
              </View>
            )}

            {/* CTA */}
            <Pressable
              style={[s.btn, loading && s.btnDisabled]}
              onPress={verificationId ? handleConfirmCode : handleContinue}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>{verificationId ? "Verify →" : "Continue →"}</Text>
              }
            </Pressable>

            <Text style={s.disclaimer}>
              {authStore.requiresVerification()
                ? "We\u2019ll text you a verification code to confirm your number."
                : "We\u2019ll set up your profile on this device."}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#111827" },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: 60 },

  brand: { alignItems: "center", paddingTop: 64, paddingBottom: 40 },
  logoWrap: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: "#1D4ED8", alignItems: "center", justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#1D4ED8", shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 12,
  },
  appName: { fontSize: 36, fontWeight: "800", color: "#fff", letterSpacing: -1 },
  tagline: { fontSize: 15, color: "#9CA3AF", marginTop: 6 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 12,
  },
  cardTitle: { fontSize: 22, fontWeight: "700", color: "#111827", marginBottom: 6, letterSpacing: -0.4 },
  cardSubtitle: { fontSize: 14, color: "#6B7280", marginBottom: 24, lineHeight: 20 },

  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 8, letterSpacing: 0.2 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: "#E5E7EB",
    borderRadius: 12, backgroundColor: "#F9FAFB",
    paddingHorizontal: 14, height: 52,
  },
  inputError: { borderColor: "#EF4444", backgroundColor: "#FEF2F2" },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 16, color: "#111827" },
  errorText: { fontSize: 12, color: "#EF4444", marginTop: 5 },

  btn: {
    backgroundColor: "#111827", paddingVertical: 16,
    borderRadius: 14, alignItems: "center", marginTop: 8,
  },
  btnDisabled: { backgroundColor: "#9CA3AF" },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },

  disclaimer: {
    fontSize: 12, color: "#9CA3AF", textAlign: "center",
    marginTop: 16, lineHeight: 18,
  },
});
