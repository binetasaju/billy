// ---------------------------------------------------------------------------
// components/ui/StatusBadge.tsx — the one status pill used everywhere
//
//   active / pending  → amber  (money still owed — needs attention)
//   settled / paid    → green  (done)
//   closed            → grey   (closed because of a mistake)
// ---------------------------------------------------------------------------
import { View, Text, StyleSheet } from "react-native";
import { C } from "@/constants/colors";

export type BillStatus = "active" | "settled" | "closed";

export function statusColors(status: BillStatus) {
  if (status === "closed") return { bg: C.surfaceAlt, text: C.textMuted, dot: C.textSubtle };
  return status === "settled"
    ? { bg: C.statusSettledBg, text: C.statusSettledText, dot: C.statusSettledDot }
    : { bg: C.statusActiveBg, text: C.statusActiveText, dot: C.statusActiveDot };
}

export function StatusBadge({ status, label, size = "md" }: {
  status: BillStatus;
  /** Defaults to "Active" / "Settled". */
  label?: string;
  size?: "sm" | "md";
}) {
  const c = statusColors(status);
  const small = size === "sm";
  return (
    <View style={[s.pill, small && s.pillSm, { backgroundColor: c.bg }]}>
      <View style={[s.dot, { backgroundColor: c.dot }]} />
      <Text style={[s.text, small && s.textSm, { color: c.text }]}>
        {label ?? (status === "settled" ? "Settled" : status === "closed" ? "Closed" : "Active")}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  pillSm: { paddingHorizontal: 8, paddingVertical: 3, gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: "600" },
  textSm: { fontSize: 11 },
});
