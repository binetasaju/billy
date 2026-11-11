// ---------------------------------------------------------------------------
// app/(tabs)/_layout.tsx — bottom navigation
//
// A black tab bar docked to the bottom edge (matches the black balance card on
// Home), with rounded top corners. Its background runs down behind the system
// navigation area so no content shows below it. Grey outline icons, and a
// deep-green pill with a white filled icon for the active tab. Tab screens pad their scroll content by TAB_BAR_CLEARANCE so
// their last items scroll clear of the bar.
// ---------------------------------------------------------------------------
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "@/constants/colors";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const BAR_HEIGHT = 60;

function TabIcon({ focused, color, active, inactive }: {
  focused: boolean; color: string; active: IconName; inactive: IconName;
}) {
  return (
    <View style={[styles.iconPill, focused && styles.iconPillActive]}>
      <Ionicons name={focused ? active : inactive} size={22} color={focused ? C.white : color} />
    </View>
  );
}

const icon = (active: IconName, inactive: IconName) => {
  const Icon = ({ focused, color }: { focused: boolean; color: string }) => (
    <TabIcon focused={focused} color={color} active={active} inactive={inactive} />
  );
  Icon.displayName = `TabIcon(${active})`;
  return Icon;
};

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Saved bills / groups are restored once at app start (app/_layout.tsx).

  // Extra space at the bottom so the icons sit above the system navigation
  // area while the black background reaches the screen edge.
  const systemBar = insets.bottom;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.white,
        tabBarInactiveTintColor: "#8A8A8A",
        tabBarShowLabel: true,
        tabBarStyle: {
          // Docked black bar — reaches the bottom edge of the screen.
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: BAR_HEIGHT + systemBar,
          paddingTop: 8,
          paddingBottom: 8 + systemBar,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderTopWidth: 0,
          backgroundColor: C.primaryDark,
          elevation: 12,
          shadowColor: "#000",
          shadowOpacity: 0.2,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: -4 },
        },
        tabBarItemStyle: { paddingVertical: 0 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home", "home-outline") }} />
      <Tabs.Screen name="pay-bills" options={{ title: "Pay", tabBarIcon: icon("wallet", "wallet-outline") }} />
      <Tabs.Screen name="groups" options={{ title: "Groups", tabBarIcon: icon("people", "people-outline") }} />
      <Tabs.Screen name="history" options={{ title: "History", tabBarIcon: icon("time", "time-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person", "person-outline") }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconPill: { width: 42, height: 26, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  iconPillActive: { backgroundColor: C.primaryMuted }, // a touch brighter so it reads on black
});
