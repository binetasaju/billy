import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import { C } from "@/constants/colors";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TAB_BAR_CLEARANCE } from "@/constants/layout";
import { T } from "@/constants/typography";
import { rupeesExact } from "../../utils/formatRupees";

export default function PayBillsScreen() {
  const router = useRouter();
  const { groups } = useGroups();
  const { user } = useAuth();
  const me = user?.uid;
  // Only bills where YOU still owe or are owed money. A bill whose open
  // payments are between other people belongs on their screens, not yours.
  const myOpen = (g: (typeof groups)[number]) =>
    g.settlements.filter((t) => t.status === "pending" && (t.fromUserId === me || t.toUserId === me));
  const activeGroups = groups.filter((g) => g.status === "active" && myOpen(g).length > 0);
  return (
    <SafeAreaView style={s.safeArea} edges={["top", "left", "right"]}>
      <View style={s.header}>
        <Text style={s.title}>Pay Bills</Text>
        <Text style={s.subtitle}>Active bills & settlements</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {activeGroups.length === 0 ? (
          <View style={s.emptyState}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="card-outline" size={40} color={C.textSubtle} />
            </View>
            <Text style={s.emptyTitle}>No active bills yet</Text>
            <Text style={s.emptySubtitle}>
              Bills where you owe money or are owed money will appear here.
            </Text>

            <Pressable
              style={({ pressed }) => [s.btn, pressed && s.btnPressed, s.btnDisabled]}
              disabled={true}
            >
              <Text style={s.btnText}>Create from Last Bill</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.groupList}>
            {activeGroups.map((group) => (
              <Pressable
                key={group.id}
                style={({ pressed }) => [s.groupCard, pressed && s.groupCardPressed]}
                onPress={() => router.push(`/group/${group.id}` as any)}
              >
                <View style={s.groupHeader}>
                  <Text style={s.groupTitle} numberOfLines={1}>{group.title}</Text>
                  {(() => {
                    const paid = group.settlements.filter((t) => t.status === "paid").length;
                    const n = group.settlements.length;
                    return <StatusBadge status="active" label={paid > 0 ? `${paid} of ${n} paid` : "Active"} />;
                  })()}
                </View>
                
                <Text style={s.groupDate}>
                  {new Date(group.createdAt).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric"
                  })}
                  {"  ·  "}Bill total {rupeesExact(group.totalAmount)}
                </Text>

                {/* Your share is the big number — these add up to Home's card */}
                {(() => {
                  const open = myOpen(group);
                  const youOwe = open.filter((t) => t.fromUserId === me).reduce((sum, t) => sum + t.amount, 0);
                  const owedToYou = open.filter((t) => t.toUserId === me).reduce((sum, t) => sum + t.amount, 0);
                  return (
                    <View style={s.groupFooter}>
                      <View style={s.footerItem}>
                        <Ionicons name="people" size={16} color={C.textMuted} />
                        <Text style={s.footerText}>{group.participants.length} participants</Text>
                      </View>
                      <View style={s.myShare}>
                        {owedToYou > 0 && (
                          <>
                            <Text style={s.myShareLabel}>You&apos;ll get</Text>
                            <Text style={[s.groupAmount, s.myAmountOwed]}>{rupeesExact(owedToYou)}</Text>
                          </>
                        )}
                        {youOwe > 0 && (
                          <>
                            <Text style={s.myShareLabel}>You&apos;ll give</Text>
                            <Text style={[s.groupAmount, s.myAmountOwe]}>{rupeesExact(youOwe)}</Text>
                          </>
                        )}
                      </View>
                    </View>
                  );
                })()}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  myShare: { alignItems: "flex-end" },
  myShareLabel: { fontSize: 11, color: C.textMuted, fontWeight: "600" },
  myAmountOwe: { color: C.danger },
  myAmountOwed: { color: C.success },
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  title: { ...T.largeTitle, color: C.ink, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.textMuted },

  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingBottom: TAB_BAR_CLEARANCE, justifyContent: "center" },
  emptyState: { alignItems: "center", justifyContent: "center", marginTop: -60 },
  emptyIconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.surfaceAlt,
    alignItems: "center", justifyContent: "center",
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: C.ink, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: C.textMuted, textAlign: "center", lineHeight: 18, maxWidth: 280, marginBottom: 32 },

  btn: {
    backgroundColor: C.primary,
    paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 14, alignItems: "center", width: "100%", maxWidth: 260,
  },
  btnPressed: { opacity: 0.8 },
  btnDisabled: { backgroundColor: C.borderStrong },
  btnText: { color: C.white, fontSize: 14, fontWeight: "700" },

  groupList: { gap: 16, paddingTop: 8 },
  groupCard: {
    backgroundColor: C.glass,
    borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: C.glassBorder,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04, shadowRadius: 12, elevation: 0,
  },
  groupCardPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  groupHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  groupTitle: { fontSize: 15, fontWeight: "700", color: C.ink, flex: 1, marginRight: 12 },
  groupDate: { fontSize: 12, color: C.textSubtle, marginBottom: 20 },
  
  groupFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  footerItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  footerText: { fontSize: 12, color: C.text, fontWeight: "500" },
  groupAmount: { fontSize: 16, fontWeight: "800", color: C.ink, letterSpacing: -0.5 },
});
