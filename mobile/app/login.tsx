// ---------------------------------------------------------------------------
// app/login.tsx
//
// Email sign-in (free on Firebase's Spark plan — SMS needs paid billing).
//
//   Sign in        email + password, "Forgot password?"
//   Create account name + phone + email + password → verification email
//   Check email    "I've verified" / "Resend email" / "Use a different email"
//
// The phone number is still collected at sign-up (unverified) because Billy
// matches people by phone. The screen never touches an auth SDK — it asks
// authStore, which uses the active provider (local fallback opens at once).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  AppState,
  Platform,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { authStore } from "../services/authStore";
import { friendlyAuthError } from "../services/auth/authErrors";
import { isValidPhoneNumber } from "../utils/normalizePhoneNumber";
import { C } from "@/constants/colors";
import { StatusBar } from "expo-status-bar";
import { BillyLogo } from "@/components/BillyLogo";

type Mode = "signin" | "signup" | "verify";
type Errors = { name?: string; phone?: string; email?: string; password?: string; form?: string };

const LAST_EMAIL_KEY = "@billy_last_email";
// Google's four-colour "G" (expo-image renders SVG; no extra package needed).
const GOOGLE_G = require("../assets/images/google-g.svg");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [notice, setNotice] = useState<string | null>(null);

  // Pre-fill the last email used on this phone, so signing back in after a
  // logout only needs the password.
  useEffect(() => {
    AsyncStorage.getItem(LAST_EMAIL_KEY)
      .then((saved) => { if (saved) setEmail((cur) => cur || saved); })
      .catch(() => {});
  }, []);
  const rememberEmail = () => {
    AsyncStorage.setItem(LAST_EMAIL_KEY, email.trim()).catch(() => {});
  };

  // Hide the logo while the keyboard is open so everything fits without scrolling.
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setKeyboardOpen(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // On "Check your email": quietly re-check every few seconds and whenever the
  // app comes back to the front (e.g. after tapping the link in Gmail), and go
  // in as soon as the email is verified — no button press needed.
  const checking = useRef(false);
  useEffect(() => {
    if (mode !== "verify") return;
    let done = false;
    const check = async () => {
      if (checking.current || done) return;
      checking.current = true;
      try {
        const user = await authStore.confirmEmailVerified();
        if (user && !done) {
          done = true;
          router.replace("/onboarding" as any);
        }
      } catch {
        // Offline or similar — the next check (or the button) will retry.
      } finally {
        checking.current = false;
      }
    };
    const timer = setInterval(check, 4000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check();
    });
    return () => {
      done = true;
      clearInterval(timer);
      sub.remove();
    };
  }, [mode, router]);

  const clearError = (field: keyof Errors) =>
    setErrors((e) => ({ ...e, [field]: undefined, form: undefined }));

  const switchMode = (next: Mode) => {
    setMode(next);
    setErrors({});
    setNotice(null);
    setPassword("");
  };

  const validate = (): boolean => {
    const e: Errors = {};
    if (mode === "signup") {
      if (!name.trim()) e.name = "Please enter your name.";
      // Phone is optional (accounts come first); check it only if given.
      if (phone.trim() && !isValidPhoneNumber(phone)) e.phone = "Enter a valid 10-digit mobile number, or leave it empty.";
    }
    if (!EMAIL_RE.test(email.trim())) e.email = "Enter a valid email address.";
    if (password.length < 6) e.password = "Password must be at least 6 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const goIn = () => router.replace("/onboarding" as any);

  const handleSubmit = async () => {
    Keyboard.dismiss();
    if (!validate()) return;
    setLoading(true);
    setNotice(null);
    try {
      const result =
        mode === "signup"
          ? await authStore.signUpWithEmail(name, phone, email, password)
          : await authStore.signInWithEmail(email, password);
      rememberEmail();
      if (result.status === "email-verification-required") {
        setMode("verify");
        setNotice(null);
        return;
      }
      goIn();
    } catch (err) {
      setErrors({ form: friendlyAuthError(err, "Could not sign in. Please try again.") });
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = async () => {
    setLoading(true);
    setErrors({});
    try {
      const user = await authStore.confirmEmailVerified();
      if (user) goIn();
      else setErrors({ form: "Not verified yet. Tap the link in the email, then try again." });
    } catch (err) {
      setErrors({ form: friendlyAuthError(err, "Could not check. Please try again.") });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setErrors({});
    try {
      await authStore.resendVerificationEmail();
      setNotice("Sent again. Check your inbox (and spam folder).");
    } catch (err) {
      setErrors({ form: friendlyAuthError(err, "Could not resend. Please try again.") });
    } finally {
      setLoading(false);
    }
  };

  const handleDifferentEmail = async () => {
    await authStore.cancelEmailSignIn();
    switchMode("signin");
  };

  const handleGoogle = async () => {
    Keyboard.dismiss();
    setLoading(true);
    setErrors({});
    setNotice(null);
    try {
      const user = await authStore.signInWithGoogle();
      if (user) goIn(); // null = picker closed, stay here
    } catch (err) {
      setErrors({ form: friendlyAuthError(err, "Google sign-in didn't work. Please try again.") });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!EMAIL_RE.test(email.trim())) {
      setErrors({ email: "Enter your email first, then tap Forgot password." });
      return;
    }
    setLoading(true);
    setErrors({});
    try {
      await authStore.sendPasswordReset(email);
      setNotice(`Password reset link sent to ${email.trim()}.`);
    } catch (err) {
      setErrors({ form: friendlyAuthError(err, "Could not send the reset email.") });
    } finally {
      setLoading(false);
    }
  };

  const field = (
    key: "name" | "phone" | "email" | "password",
    icon: React.ComponentProps<typeof Ionicons>["name"],
    input: React.ReactNode
  ) => (
    <View style={s.fieldGroup}>
      <View style={[s.inputWrap, errors[key] && s.inputError]}>
        <Ionicons name={icon} size={18} color={C.textSubtle} style={s.inputIcon} />
        {input}
      </View>
      {errors[key] && <Text style={s.errorText}>{errors[key]}</Text>}
    </View>
  );

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Fixed layout — no scrolling. Tapping outside a field closes the keyboard. */}
        <Pressable style={s.page} onPress={Keyboard.dismiss} accessible={false}>
          {/* ── Brand (hidden while the keyboard is open, so the card fits) ── */}
          <StatusBar style="light" />
          {!keyboardOpen && (
            <View style={s.brand}>
              <BillyLogo size={72} style={s.logoWrap} />
              <Text style={s.appName}>Billy</Text>
              <Text style={s.tagline}>Every bill matters.</Text>
            </View>
          )}

          {/* ── Card ── */}
          <View style={s.card}>
            {mode === "verify" ? (
              <>
                <View style={s.verifyIcon}>
                  <Ionicons name="mail-unread-outline" size={26} color={C.primary} />
                </View>
                <Text style={[s.cardTitle, s.center]}>Check your email</Text>
                <Text style={[s.cardSubtitle, s.center]}>
                  We sent a verification link to{"\n"}
                  <Text style={s.emailStrong}>{email.trim()}</Text>
                  {"\n"}Tap the link — Billy will continue by itself.
                </Text>

                <View style={s.waitingRow}>
                  <ActivityIndicator size="small" color={C.primary} />
                  <Text style={s.waitingText}>Waiting for verification…</Text>
                </View>

                {errors.form && <Text style={[s.formError, s.center]}>{errors.form}</Text>}
                {notice && <Text style={[s.notice, s.center]}>{notice}</Text>}

                <Pressable style={[s.btn, loading && s.btnDisabled]} onPress={handleVerified} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>I&apos;ve verified →</Text>}
                </Pressable>
                <View style={s.linkRow}>
                  <Pressable onPress={handleResend} disabled={loading} hitSlop={8}>
                    <Text style={s.link}>Resend email</Text>
                  </Pressable>
                  <Text style={s.linkSep}>·</Text>
                  <Pressable onPress={handleDifferentEmail} disabled={loading} hitSlop={8}>
                    <Text style={s.link}>Use a different email</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={s.cardTitle}>{mode === "signup" ? "Create account" : "Welcome back"}</Text>
                <Text style={s.cardSubtitle}>
                  {mode === "signup" ? "We\u2019ll email you a link to verify it\u2019s you." : "Sign in to continue."}
                </Text>

                {/* Google — hidden while typing so the email form still fits */}
                {!keyboardOpen && (
                  <>
                    <Pressable
                      style={({ pressed }) => [s.googleBtn, pressed && s.googleBtnPressed]}
                      onPress={handleGoogle}
                      disabled={loading}
                      accessibilityRole="button"
                    >
                      <Image source={GOOGLE_G} style={s.googleLogo} contentFit="contain" accessible={false} />
                      <Text style={s.googleBtnText}>Continue with Google</Text>
                    </Pressable>
                    <View style={s.orRow}>
                      <View style={s.orLine} />
                      <Text style={s.orText}>or with email</Text>
                      <View style={s.orLine} />
                    </View>
                  </>
                )}

                {mode === "signup" &&
                  field("name", "person-outline",
                    <TextInput
                      style={s.input}
                      placeholder="Your name"
                      placeholderTextColor={C.borderStrong}
                      value={name}
                      onChangeText={(t) => { setName(t); clearError("name"); }}
                      autoCapitalize="words"
                      autoComplete="name"
                    />
                  )}
                {mode === "signup" &&
                  field("phone", "call-outline",
                    <TextInput
                      style={s.input}
                      placeholder="Phone number (optional)"
                      placeholderTextColor={C.borderStrong}
                      value={phone}
                      onChangeText={(t) => { setPhone(t); clearError("phone"); }}
                      keyboardType="phone-pad"
                      autoComplete="tel"
                    />
                  )}
                {field("email", "mail-outline",
                  <TextInput
                    style={s.input}
                    placeholder="Email"
                    placeholderTextColor={C.borderStrong}
                    value={email}
                    onChangeText={(t) => { setEmail(t); clearError("email"); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete={mode === "signup" ? "email" : "username"}
                    textContentType={mode === "signup" ? "emailAddress" : "username"}
                    importantForAutofill="yes"
                  />
                )}
                {field("password", "lock-closed-outline",
                  <>
                    <TextInput
                      style={s.input}
                      placeholder={mode === "signup" ? "Password (6+ characters)" : "Password"}
                      placeholderTextColor={C.borderStrong}
                      value={password}
                      onChangeText={(t) => { setPassword(t); clearError("password"); }}
                      secureTextEntry={!showPassword}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      textContentType={mode === "signup" ? "newPassword" : "password"}
                      importantForAutofill="yes"
                      returnKeyType="done"
                      onSubmitEditing={handleSubmit}
                    />
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={10}
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    >
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={C.textSubtle} />
                    </Pressable>
                  </>
                )}

                {mode === "signin" && (
                  <Pressable onPress={handleForgotPassword} disabled={loading} hitSlop={8} style={s.forgot}>
                    <Text style={s.link}>Forgot password?</Text>
                  </Pressable>
                )}

                {errors.form && <Text style={s.formError}>{errors.form}</Text>}
                {notice && <Text style={s.notice}>{notice}</Text>}

                <Pressable style={[s.btn, loading && s.btnDisabled]} onPress={handleSubmit} disabled={loading}>
                  {loading
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={s.btnText}>{mode === "signup" ? "Create account →" : "Sign in →"}</Text>}
                </Pressable>

                <Pressable
                  onPress={() => switchMode(mode === "signup" ? "signin" : "signup")}
                  hitSlop={8}
                  style={s.switchRow}
                >
                  <Text style={s.switchText}>
                    {mode === "signup" ? "Already have an account? " : "New to Billy? "}
                    <Text style={s.link}>{mode === "signup" ? "Sign in" : "Create account"}</Text>
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.primaryDark },
  page: { flex: 1, paddingHorizontal: 20, paddingVertical: 16, justifyContent: "center" },

  brand: { alignItems: "center", paddingBottom: 28 },
  logoWrap: {
    marginBottom: 12,
    shadowColor: C.brand, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 16, elevation: 6,
  },
  appName: { fontSize: 27, fontWeight: "800", color: "#fff", letterSpacing: -1 },
  tagline: { fontSize: 13, color: C.onDarkMuted, marginTop: 6 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: C.ink, marginBottom: 6, letterSpacing: -0.4 },
  cardSubtitle: { fontSize: 12, color: C.textMuted, marginBottom: 18, lineHeight: 17 },

  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "600", color: C.text, marginBottom: 8, letterSpacing: 0.2 },
  inputWrap: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: C.border,
    borderRadius: 12, backgroundColor: C.bg,
    paddingHorizontal: 14, height: 48,
  },
  inputError: { borderColor: C.danger, backgroundColor: C.dangerSoft },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: C.ink },
  errorText: { fontSize: 11, color: C.danger, marginTop: 5 },

  btn: {
    backgroundColor: C.primary, paddingVertical: 16,
    borderRadius: 14, alignItems: "center", marginTop: 8,
  },
  btnDisabled: { backgroundColor: C.textSubtle },
  btnText: { color: "#fff", fontSize: 14, fontWeight: "700" },

  center: { textAlign: "center" },
  googleBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    height: 48, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surface,
  },
  googleBtnPressed: { backgroundColor: C.surfaceAlt },
  googleLogo: { width: 18, height: 18 },
  googleBtnText: { fontSize: 14, fontWeight: "700", color: C.ink },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  orLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.borderStrong },
  orText: { fontSize: 11, color: C.textSubtle, fontWeight: "600" },
  waitingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 14 },
  waitingText: { fontSize: 12, color: C.textMuted },
  verifyIcon: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: C.primarySoft,
    alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 12,
  },
  emailStrong: { color: C.ink, fontWeight: "700" },
  formError: { fontSize: 12, color: C.danger, marginBottom: 10, lineHeight: 16 },
  notice: { fontSize: 12, color: C.successDark, marginBottom: 10, lineHeight: 16 },
  link: { fontSize: 13, color: C.primary, fontWeight: "700" },
  linkRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 },
  linkSep: { color: C.textSubtle },
  forgot: { alignSelf: "flex-end", marginTop: -4, marginBottom: 12 },
  switchRow: { marginTop: 16, alignItems: "center" },
  switchText: { fontSize: 13, color: C.textMuted },

  disclaimer: {
    fontSize: 11, color: C.textSubtle, textAlign: "center",
    marginTop: 16, lineHeight: 15,
  },
});
