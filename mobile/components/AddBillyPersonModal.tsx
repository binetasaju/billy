// ---------------------------------------------------------------------------
// components/AddBillyPersonModal.tsx — add people by their Billy account
//
// Accounts first (docs/CLOUD_SYNC_PLAN.md, option C): people added here are
// linked to the bill at once and see it on their own phone.
//   • "On Billy": people you've already split with who have accounts
//   • "Add by email": exact email lookup (emails/{email} → users/{uid})
// ---------------------------------------------------------------------------
import { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { Person } from "../types/bill";
import { useGroups } from "../hooks/useGroups";
import { useAuth } from "../hooks/useAuth";
import { cloudSession } from "../services/cloud/cloudSync";
import { findProfileByEmail, type PublicProfile } from "../services/cloud/profiles";
import { UserAvatar } from "./ui/UserAvatar";
import { C } from "@/constants/colors";

export type BillyPerson = Pick<Person, "id" | "name" | "phone" | "upiId" | "authUid">;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AddBillyPersonModal({
  visible,
  existingIds,
  onAdd,
  onClose,
}: {
  visible: boolean;
  /** Participant ids / authUids already on the bill (hidden from the list). */
  existingIds: Set<string>;
  onAdd: (person: BillyPerson) => void;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const { groups } = useGroups();
  const [email, setEmail] = useState("");
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<PublicProfile | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const cloud = cloudSession();

  // People with Billy accounts from my bills (most recent first, no duplicates).
  const onBilly = useMemo(() => {
    const seen = new Map<string, BillyPerson>();
    const sorted = [...groups].sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1));
    for (const g of sorted) {
      for (const p of g.participants) {
        if (!p.authUid || p.isCurrentUser || p.authUid === user?.firebaseUid || seen.has(p.authUid)) continue;
        seen.set(p.authUid, { id: p.authUid, name: p.name, phone: p.phone, upiId: p.upiId, authUid: p.authUid });
      }
    }
    return [...seen.values()].filter((p) => !existingIds.has(p.id) && !existingIds.has(p.authUid!));
  }, [groups, user?.firebaseUid, existingIds]);

  const reset = () => {
    setEmail("");
    setFound(null);
    setMessage(null);
  };

  const handleSearch = async () => {
    if (!cloud) return;
    if (!EMAIL_RE.test(email.trim())) {
      setMessage("Enter their full email address.");
      return;
    }
    setSearching(true);
    setFound(null);
    setMessage(null);
    try {
      const profile = await findProfileByEmail(cloud.db, email);
      if (!profile) setMessage("No Billy account with that email. Add them from contacts and share the bill link instead.");
      else if (profile.uid === cloud.me.authUid) setMessage("That's you — you're already on the bill.");
      else if (existingIds.has(profile.uid)) setMessage(`${profile.name || "They"} are already on this bill.`);
      else setFound(profile);
    } catch {
      setMessage("Couldn't search right now. Check your internet and try again.");
    } finally {
      setSearching(false);
    }
  };

  const add = (p: BillyPerson) => {
    onAdd(p);
    reset();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={s.backdrop} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <View style={s.sheet}>
          <View style={s.header}>
            <Text style={s.title}>Add a Billy user</Text>
            <Pressable onPress={() => { reset(); onClose(); }} hitSlop={10} accessibilityLabel="Close">
              <Ionicons name="close" size={22} color={C.textMuted} />
            </Pressable>
          </View>
          <Text style={s.sub}>They&apos;ll see this bill on their phone straight away.</Text>

          {!cloud ? (
            <Text style={s.message}>Sign in with your email or Google account to add Billy users.</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              {/* By email */}
              <View style={s.searchRow}>
                <View style={s.inputWrap}>
                  <Ionicons name="mail-outline" size={17} color={C.textSubtle} />
                  <TextInput
                    style={s.input}
                    placeholder="Their email"
                    placeholderTextColor={C.textSubtle}
                    value={email}
                    onChangeText={(t) => { setEmail(t); setFound(null); setMessage(null); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleSearch}
                  />
                </View>
                <Pressable style={s.findBtn} onPress={handleSearch} disabled={searching}>
                  {searching ? <ActivityIndicator color={C.white} size="small" /> : <Text style={s.findText}>Find</Text>}
                </Pressable>
              </View>

              {message && <Text style={s.message}>{message}</Text>}

              {found && (
                <View style={s.foundCard}>
                  <View style={s.avatar}>
                    <UserAvatar photoUrl={found.photoUrl} name={found.name} size={40} textStyle={s.avatarText} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name}>{found.name || "Billy user"}</Text>
                    {found.email ? <Text style={s.detail}>{found.email}</Text> : null}
                  </View>
                  <Pressable
                    style={s.addBtn}
                    onPress={() => add({ id: found.uid, name: found.name || found.email || "Friend", phone: found.phone, upiId: found.upiId, authUid: found.uid })}
                  >
                    <Text style={s.addText}>Add</Text>
                  </Pressable>
                </View>
              )}

              {/* People on Billy I've split with */}
              {onBilly.length > 0 && (
                <>
                  <Text style={s.section}>On Billy</Text>
                  {onBilly.map((p) => (
                    <Pressable key={p.id} style={s.personRow} onPress={() => add(p)} accessibilityRole="button" accessibilityLabel={`Add ${p.name}`}>
                      <View style={s.avatar}>
                        <Text style={s.avatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <Text style={[s.name, { flex: 1 }]}>{p.name}</Text>
                      <Ionicons name="add-circle" size={24} color={C.primary} />
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 18, fontWeight: "700", color: C.ink },
  sub: { fontSize: 12, color: C.textMuted, marginTop: 4, marginBottom: 16 },
  searchRow: { flexDirection: "row", gap: 8 },
  inputWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8, height: 46,
    borderWidth: 1.5, borderColor: C.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: C.bg,
  },
  input: { flex: 1, fontSize: 14, color: C.ink },
  findBtn: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 18, justifyContent: "center", minWidth: 70, alignItems: "center" },
  findText: { color: C.white, fontWeight: "700", fontSize: 14 },
  message: { fontSize: 12, color: C.textMuted, marginTop: 10, lineHeight: 17 },
  foundCard: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14, padding: 12,
    borderRadius: 14, backgroundColor: C.primarySoft,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  avatarText: { color: C.white, fontWeight: "700", fontSize: 15 },
  name: { fontSize: 15, fontWeight: "600", color: C.ink },
  detail: { fontSize: 12, color: C.textMuted, marginTop: 2 },
  addBtn: { backgroundColor: C.primary, borderRadius: 16, paddingHorizontal: 16, height: 32, justifyContent: "center" },
  addText: { color: C.white, fontWeight: "700", fontSize: 13 },
  section: { fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 20, marginBottom: 6 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
});
