// ---------------------------------------------------------------------------
// app/gmail-import.tsx — "Import from Gmail"
//
// Connect a Google account → list recent order emails (Swiggy, Zomato,
// Amazon…) → tap one → the same bill parser as photos → Review.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator } from "react-native";
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";
import {
  connectGmail,
  disconnectGmail,
  listBillEmails,
  readBillEmail,
  GmailError,
  type BillEmail,
} from "../services/gmailBills";
import { parseBill } from "../services/parseBill";
import { billStore } from "../services/billStore";
import { authStore } from "../services/authStore";
import { nanoid } from "../utils/nanoid";

type State =
  | { kind: "connecting" }
  | { kind: "cancelled" }
  | { kind: "error"; message: string }
  | { kind: "list"; emails: BillEmail[] }
  | { kind: "reading"; email: BillEmail };

export default function GmailImportScreen() {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "connecting" });
  const [emails, setEmails] = useState<BillEmail[]>([]);

  const load = useCallback(async () => {
    setState({ kind: "connecting" });
    try {
      const ok = await connectGmail();
      if (!ok) {
        setState({ kind: "cancelled" });
        return;
      }
      const found = await listBillEmails();
      setEmails(found);
      setState({ kind: "list", emails: found });
    } catch (e) {
      setState({ kind: "error", message: e instanceof GmailError || e instanceof Error ? e.message : "Something went wrong." });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const switchAccount = async () => {
    await disconnectGmail();
    load();
  };

  const openEmail = async (email: BillEmail) => {
    setState({ kind: "reading", email });
    try {
      const text = await readBillEmail(email.id);
      const bill = await parseBill(text);
      if (bill.isBill === false || bill.items.length === 0) {
        setState({ kind: "error", message: "That email doesn't have an itemised bill. Try another one." });
        return;
      }
      if (!bill.restaurant || bill.restaurant === "Extracted Locally") bill.restaurant = email.from;
      bill.items = bill.items.map((it) => ({ ...it, id: it.id || nanoid() }));
      billStore.set(bill, "", null, authStore.get().user);
      router.replace("/review-items");
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Couldn't read that email." });
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={C.ink} />
        </Pressable>
        <Text style={s.title}>Import from Gmail</Text>
      </View>

      {state.kind === "connecting" && (
        <Center>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={s.muted}>Looking for order emails…</Text>
        </Center>
      )}

      {state.kind === "reading" && (
        <Center>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={s.muted}>Reading the bill from {state.email.from}…</Text>
        </Center>
      )}

      {state.kind === "cancelled" && (
        <Center>
          <Ionicons name="mail-outline" size={40} color={C.textSubtle} />
          <Text style={s.body}>
            Billy needs permission to read your order emails. It only reads the email you pick, and nothing is
            stored except the bill.
          </Text>
          <PrimaryButton label="Connect Gmail" onPress={load} />
        </Center>
      )}

      {state.kind === "error" && (
        <Center>
          <Ionicons name="alert-circle-outline" size={40} color={C.danger} />
          <Text style={s.body}>{state.message}</Text>
          <PrimaryButton label="Try again" onPress={emails.length ? () => setState({ kind: "list", emails }) : load} />
        </Center>
      )}

      {state.kind === "list" && (
        <FlatList
          data={state.emails}
          keyExtractor={(e) => e.id}
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <Text style={s.hint}>
              Order emails from the last 90 days (Swiggy, Zomato, Amazon, BigBasket, Zepto, Blinkit…). Tap one to
              split it.
            </Text>
          }
          ListEmptyComponent={
            <Text style={[s.body, { marginTop: 40 }]}>No order emails found in this account.</Text>
          }
          ListFooterComponent={
            <Pressable onPress={switchAccount} style={s.switchBtn} accessibilityRole="button">
              <Text style={s.switchText}>Use another Google account</Text>
            </Pressable>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openEmail(item)}
              style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              accessibilityLabel={`${item.from}: ${item.subject}`}
            >
              <View style={s.rowTop}>
                <Text style={s.from} numberOfLines={1}>{item.from}</Text>
                {item.date && (
                  <Text style={s.date}>
                    {item.date.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </Text>
                )}
              </View>
              <Text style={s.subject} numberOfLines={2}>{item.subject}</Text>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return <View style={s.center}>{children}</View>;
}

function PrimaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]} accessibilityRole="button">
      <Text style={s.btnText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { ...T.title1, color: C.ink },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  muted: { ...T.subhead, color: C.textMuted, textAlign: "center" },
  body: { ...T.body, color: C.text, textAlign: "center" },
  hint: { ...T.footnote, color: C.textMuted, marginBottom: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: {
    backgroundColor: C.glassStrong, borderColor: C.glassBorder, borderWidth: 1, borderRadius: 14,
    padding: 14, marginBottom: 10,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginBottom: 4 },
  from: { ...T.headline, color: C.ink, flexShrink: 1 },
  date: { ...T.footnote, color: C.textMuted },
  subject: { ...T.subhead, color: C.text },
  btn: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12 },
  btnText: { color: C.white, fontWeight: "700", fontSize: 15 },
  switchBtn: { alignItems: "center", paddingVertical: 16 },
  switchText: { ...T.subhead, color: C.primary, fontWeight: "600" },
});
