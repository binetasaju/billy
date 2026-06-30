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
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import { GestureHandlerRootView } from "react-native-gesture-handler";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { authStore } from "../services/authStore";
import { useAuth } from "../hooks/useAuth";

// ── Auth-aware navigator ──────────────────────────────────────────────────────
// Separated into a child component so useRouter() has a valid context.
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === "login" || segments[0] === "onboarding";

    if (!user && !inAuthGroup) {
      // Not signed in — force to login
      router.replace("/login" as any);
    } else if (user && inAuthGroup) {
      // Already signed in but on an auth screen — push to app root
      router.replace("/" as any);
    }
  }, [user, isLoading, segments]);

  // Show spinner while AsyncStorage is being read
  if (isLoading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#1D4ED8" />
      </View>
    );
  }

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Restore persisted session once on app start
  useEffect(() => {
    authStore.restore();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
          {/* AuthGate runs alongside the stack — redirects happen inside */}
          <AuthGate />
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