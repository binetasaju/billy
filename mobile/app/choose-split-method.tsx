// ---------------------------------------------------------------------------
// app/choose-split-method.tsx
//
// "How would you like to split this bill?"
// Two large cards: Split Equally | Item-wise Split
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";

type Method = "equal" | "itemwise";

interface MethodCard {
  method: Method;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  badge?: string;
}

const CARDS: MethodCard[] = [
  {
    method: "equal",
    icon: "people",
    iconBg: "#EFF6FF",
    iconColor: "#3B82F6",
    title: "Split Equally",
    description: "Everyone pays an equal share of the total bill.",
    badge: "Quick",
  },
  {
    method: "itemwise",
    icon: "receipt-outline",
    iconBg: "#F0FDF4",
    iconColor: "#059669",
    title: "Item-wise Split",
    description: "Assign individual items to participants for a precise split.",
    badge: "Precise",
  },
];

export default function ChooseSplitMethodScreen() {
  const router = useRouter();

  useEffect(() => {
    const store = billStore.get();
    if (!store) router.replace("/");
  }, []);

  const handleSelect = (method: Method) => {
    billStore.setSplitMethod(method);
    if (method === "equal") {
      router.push("/equal-split-summary" as any);
    } else {
      router.push("/assign-by-person" as any);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Text style={styles.title}>Split Method</Text>
          <Text style={styles.subtitle}>
            How would you like to split this bill?
          </Text>
        </View>

        {/* ── Method Cards ── */}
        <View style={styles.cards}>
          {CARDS.map(({ method, icon, iconBg, iconColor, title, description, badge }) => (
            <Pressable
              key={method}
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed,
              ]}
              onPress={() => handleSelect(method)}
              accessibilityRole="button"
              accessibilityLabel={title}
            >
              {/* Badge */}
              {badge && (
                <View style={[styles.badge, { backgroundColor: iconBg }]}>
                  <Text style={[styles.badgeText, { color: iconColor }]}>
                    {badge}
                  </Text>
                </View>
              )}

              {/* Icon */}
              <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                <Ionicons name={icon} size={32} color={iconColor} />
              </View>

              {/* Text */}
              <Text style={styles.cardTitle}>{title}</Text>
              <Text style={styles.cardDescription}>{description}</Text>

              {/* Arrow */}
              <View style={styles.cardArrow}>
                <Ionicons name="arrow-forward" size={18} color="#9CA3AF" />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  header: { marginTop: 28, marginBottom: 28 },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginTop: 6,
    lineHeight: 22,
  },

  cards: { gap: 16 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    position: "relative",
  },
  cardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  badge: {
    position: "absolute",
    top: 16,
    right: 16,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.3 },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  cardDescription: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
    marginBottom: 16,
  },
  cardArrow: {
    alignSelf: "flex-end",
  },
});
