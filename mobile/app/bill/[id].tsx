// ---------------------------------------------------------------------------
// app/bill/[id].tsx — opening a shared bill link
//
// https://billy-ed9eb.web.app/bill/<id>?c=<invite code> lands here (Android
// App Links, or the web page's "Open in Billy").
//   • the bill is already on this phone → go to it
//   • otherwise, with an invite code → "Join <bill>? Which one are you?"
// Joining links your Billy account to that person on the bill (firestore.rules
// allow it only with the right code, and only for yourself).
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useGroups } from "../../hooks/useGroups";
import { useAuth } from "../../hooks/useAuth";
import { groupStore } from "../../services/groupStore";
import { cloudSession } from "../../services/cloud/cloudSync";
import { getInvite, joinBill, type InviteInfo } from "../../services/cloud/billSync";
import { rupeesExact } from "../../utils/formatRupees";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";

type Phase = "loading" | "choose" | "joining" | "error";

export default function BillLinkScreen() {
  const { id, c } = useLocalSearchParams<{ id: string; c?: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const { groups, isLoading } = useGroups();
  const onPhone = groups.some((g) => g.id === id);

  const [phase, setPhase] = useState<Phase>("loading");
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  // Load who can be joined as (only when the bill isn't on this phone).
  useEffect(() => {
    if (isLoading || onPhone) return;
    if (!c) {
      setMessage("This link doesn't include an invite. Ask whoever shared the bill to share it again.");
      setPhase("error");
      return;
    }
    const cloud = cloudSession();
    if (!cloud) {
      setMessage("Sign in with your email or Google account to join shared bills.");
      setPhase("error");
      return;
    }
    getInvite(cloud.db, c)
      .then((inv) => {
        if (!inv || inv.billId !== id) {
          setMessage("This invite is no longer valid. Ask for a new link.");
          setPhase("error");
          return;
        }
        setInvite(inv);
        // Pre-select the one person with my name, if exactly one matches.
        const mine = inv.participants.filter(
          (p) => !p.linked && p.name.trim().toLowerCase() === (user?.name ?? "").trim().toLowerCase()
        );
        if (mine.length === 1) setPicked(mine[0].id);
        setPhase("choose");
      })
      .catch(() => {
        setMessage("Couldn't open this bill. Check your internet and try again.");
        setPhase("error");
      });
  }, [isLoading, onPhone, c, id, user?.name]);

  // After joining, the bill arrives through sync — then open it.
  useEffect(() => {
    if (phase === "joining" && onPhone) router.replace(`/group/${id}` as any);
  }, [phase, onPhone, id, router]);

  const open = useMemo(() => invite?.participants.filter((p) => !p.linked) ?? [], [invite]);

  const handleJoin = async () => {
    const cloud = cloudSession();
    if (!cloud || !picked || !c) return;
    setPhase("joining");
    try {
      await joinBill(cloud.db, cloud.me.authUid, id, c, picked);
      // Usually already on the phone by now; otherwise the effect above waits for it.
      if (groupStore.getGroupById(id)) router.replace(`/group/${id}` as any);
    } catch {
      setMessage("Couldn't join — someone may already have joined as that person. Ask for a new link.");
      setPhase("error");
    }
  };

  if (onPhone && phase !== "joining") return <Redirect href={`/group/${id}` as any} />;

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        {phase === "loading" || phase === "joining" ? (
          <View style={s.center}>
            <ActivityIndicator color={C.primary} />
            <Text style={s.muted}>{phase === "joining" ? "Joining the bill…" : "Opening the bill…"}</Text>
          </View>
        ) : phase === "error" ? (
          <View style={s.center}>
            <Ionicons name="link-outline" size={36} color={C.textSubtle} />
            <Text style={s.errorText}>{message}</Text>
            <Pressable style={s.secondaryBtn} onPress={() => router.replace("/(tabs)" as any)}>
              <Text style={s.secondaryBtnText}>Go to Home</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={s.title}>Join this bill?</Text>
            <View style={s.card}>
              <Text style={s.billTitle}>{invite?.title}</Text>
              <Text style={s.muted}>
                {rupeesExact(invite?.totalAmount ?? 0)}
                {invite?.payerName ? `  ·  paid by ${invite.payerName}` : ""}
              </Text>
            </View>

            <Text style={s.section}>Which one are you?</Text>
            {open.length === 0 ? (
              <Text style={s.muted}>Everyone on this bill has already joined.</Text>
            ) : (
              <View style={s.list}>
                {open.map((p, i) => {
                  const on = picked === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => setPicked(p.id)}
                      style={[s.row, i > 0 && s.rowBorder, on && s.rowOn]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <View style={[s.radio, on && s.radioOn]}>{on && <View style={s.radioDot} />}</View>
                      <Text style={s.name}>{p.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={s.note}>
              Your Billy account will be linked to that person on this bill, so it shows up on your phone and you can mark your payment.
            </Text>

            <Pressable
              style={[s.primaryBtn, !picked && s.btnDisabled]}
              onPress={handleJoin}
              disabled={!picked}
              accessibilityRole="button"
            >
              <Text style={s.primaryBtnText}>Join bill</Text>
            </Pressable>
            <Pressable style={s.secondaryBtn} onPress={() => router.replace("/(tabs)" as any)}>
              <Text style={s.secondaryBtnText}>Not now</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 80 },
  title: { ...T.largeTitle, color: C.ink, marginBottom: 16 },
  card: { backgroundColor: C.primaryDark, borderRadius: 20, padding: 20, marginBottom: 24, gap: 6 },
  billTitle: { fontSize: 18, fontWeight: "700", color: C.onDark },
  muted: { fontSize: 13, color: C.textMuted, textAlign: "center" },
  section: { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  list: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
  rowOn: { backgroundColor: C.primarySoft },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.borderStrong, alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: C.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  name: { fontSize: 15, fontWeight: "600", color: C.ink },
  note: { fontSize: 12, color: C.textMuted, marginTop: 14, lineHeight: 17 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  btnDisabled: { backgroundColor: C.textSubtle },
  primaryBtnText: { color: C.white, fontSize: 15, fontWeight: "700" },
  secondaryBtn: { paddingVertical: 14, alignItems: "center" },
  secondaryBtnText: { color: C.textMuted, fontSize: 14, fontWeight: "600" },
  errorText: { fontSize: 14, color: C.text, textAlign: "center", lineHeight: 20, paddingHorizontal: 12 },
});
