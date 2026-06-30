// ---------------------------------------------------------------------------
// app/login.tsx
//
// Mock login screen — Phase 2 foundation.
//
// Collects name + phone number and creates a local User object.
// No OTP or Firebase yet — that is Phase 3.
//
// Firebase migration path:
//   Replace handleContinue's body with:
//     const result = await signInWithPhoneNumber(auth, normalizedPhone);
//     navigation.push("/verify-otp", { confirmation: result });
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
import type { User } from "../types/user";

// Simple UUID-like ID generator (matches existing nanoid pattern)
function generateUid(): string {
  return `mock_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function LoginScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});

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
      const normalizedPhone = normalizePhoneNumber(phone)!;

      // ── Mock User (replace with Firebase Auth in Phase 3) ──
      const mockUser: User = {
        uid: generateUid(),
        name: name.trim(),
        phoneNumber: normalizedPhone,
        createdAt: new Date().toISOString(),
      };

      await authStore.login(mockUser);
      // Navigate to onboarding to optionally collect UPI ID
      router.replace("/onboarding" as any);
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

            {/* CTA */}
            <Pressable
              style={[s.btn, loading && s.btnDisabled]}
              onPress={handleContinue}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Continue →</Text>
              }
            </Pressable>

            <Text style={s.disclaimer}>
              OTP verification coming soon. For now, we'll set up your profile locally.
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
