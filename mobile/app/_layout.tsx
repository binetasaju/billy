// ---------------------------------------------------------------------------
// app/_layout.tsx
//
// Root layout with auth guard.
//
// Behavior:
//   • Calls authStore.restore() once on mount (reads AsyncStorage)
//   • While loading → renders a full-screen splash/spinner
//   • No user → redirects to /login
//   • User present → renders the main Stack
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { authStore } from "../services/authStore";
import { groupStore } from "../services/groupStore";
import { contactGroupStore } from "../services/contactGroupStore";
import { initCloudSync } from "../services/cloud/cloudSync";
import { savePendingInvite, takePendingInvite } from "../services/pendingInvite";
import { initFirebaseAuth } from "../services/auth/initFirebaseAuth";
import { useAuth } from "../hooks/useAuth";
import { AppAlertHost } from "@/components/ui/AppAlert";

// ── Auth-aware navigator ──────────────────────────────────────────────────────
// Separated into a child component so useRouter() has a valid context.
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ c?: string }>();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "login" || segments[0] === "onboarding";

    if (!user && !inAuthGroup) {
      // A shared bill link opened before signing in: keep it for after sign-up.
      if (segments[0] === "bill") {
        const code = typeof params.c === "string" ? params.c : "";
        void savePendingInvite(code ? `${pathname}?c=${code}` : pathname);
      }
      // Not signed in — force to login
      router.replace("/login" as any);
      return;
    }

    if (user) {
      // A UPI ID is required (so friends can pay you): finish onboarding first.
      // Any remembered bill link waits until then.
      if (!user.upiId?.trim()) {
        if (segments[0] !== "onboarding") router.replace("/onboarding" as any);
        return;
      }
      // Signed in: a remembered bill link wins over everything else.
      void takePendingInvite().then((invite) => {
        if (invite) router.replace(invite as any);
        else if (inAuthGroup) router.replace("/" as any); // already signed in — go to app root
      });
    }
  }, [user, isLoading, segments]);

  // Show spinner while AsyncStorage is being read
  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#065F46" />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Pick the auth provider, then restore the persisted session.
  // initFirebaseAuth() is a no-op that falls back to local sign-in whenever
  // the Firebase native module or its config is missing, so this is safe to
  // call before the project's google-services files exist.
  useEffect(() => {
    initFirebaseAuth();
    authStore.restore();
    // Saved bills and groups load at start-up (not only when the tabs open),
    // so a shared bill link that opens a bill page directly can find it.
    // Then cloud sync starts (it follows sign-in / sign-out by itself).
    let stopSync: (() => void) | undefined;
    Promise.all([groupStore.restore(), contactGroupStore.restore()]).then(() => {
      stopSync = initCloudSync();
    });
    return () => stopSync?.();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }} />
          {/* Billy uses a light theme: keep status-bar icons dark even when the phone is in dark mode */}
          <StatusBar style="dark" />
          {/* AuthGate runs alongside the stack — redirects happen inside */}
          <AuthGate />
          {/* Billy-styled pop-ups (appAlert.alert) */}
          <AppAlertHost />
        </ThemeProvider>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loader: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
});