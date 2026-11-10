// ---------------------------------------------------------------------------
// app/(tabs)/_layout.tsx — bottom navigation
//
// A floating black capsule tab bar (matches the black balance card on Home):
// grey outline icons, and a deep-green pill with a white filled icon for the
// active tab. Tab screens pad their scroll content by TAB_BAR_CLEARANCE so
// their last items scroll clear of the bar.
// ---------------------------------------------------------------------------
import { Tabs } from "expo-router";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useEffect } from "react";
import { groupStore } from "../../services/groupStore";
import { contactGroupStore } from "../../services/contactGroupStore";
import { C } from "@/constants/colors";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const BAR_HEIGHT = 60;
const BAR_GAP = 10; // space between the bar and the bottom edge / system bar

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
  // Restore persisted stores when the tab layout mounts
  useEffect(() => {
    groupStore.restore();
    contactGroupStore.restore();
  }, []);

  const bottom = insets.bottom + BAR_GAP;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.white,
        tabBarInactiveTintColor: "#8A8A8A",
        tabBarShowLabel: true,
        tabBarStyle: {
          // Floating black capsule — matches the black balance card on Home.
          position: "absolute",
          left: 40,
          right: 40,
          bottom,
          height: BAR_HEIGHT,
          paddingTop: 8,
          paddingBottom: 8,
          borderRadius: 32,
          borderTopWidth: 0,
          backgroundColor: C.primaryDark,
          elevation: 12,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
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
