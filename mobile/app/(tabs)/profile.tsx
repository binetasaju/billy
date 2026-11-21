// ---------------------------------------------------------------------------
// app/profile.tsx
//
// Profile: avatar, quick stats, personal details (name / phone editable,
// email shown as verified), payments (UPI), account (change password,
// log out) and about (version, privacy note).
// ---------------------------------------------------------------------------

import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Switch,
} from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { authStore } from "../../services/authStore";
import { useAuth } from "../../hooks/useAuth";
import { useGroups } from "../../hooks/useGroups";
import { myIdOn } from "../../services/homeSummary";
import { statusForMe } from "../../services/viewerStatus";
import { useContactGroups } from "../../hooks/useContactGroups";
import { friendlyAuthError } from "../../services/auth/authErrors";
import { isValidUpiId } from "../../services/upi";
import { isCloudSyncEnabled, setCloudSyncEnabled, subscribeCloudSyncSwitch } from "../../services/cloud/cloudSync";
import { deleteMyAccount, deletionMethod, type DeletionProof } from "../../services/accountDeletion";
import { getGoogleIdToken } from "../../services/auth/googleSignIn";
import { isValidPhoneNumber, normalizePhoneNumber } from "../../utils/normalizePhoneNumber";
import Constants from "expo-constants";
import * as Clipboard from "expo-clipboard";

import { C } from "@/constants/colors";
import { TAB_BAR_CLEARANCE } from "@/constants/layout";
import { T } from "@/constants/typography";
import { UserAvatar } from "@/components/ui/UserAvatar";

/** Public privacy policy (web/public/privacy.html on Firebase Hosting). */
const PRIVACY_URL = "https://billy-ed9eb.web.app/privacy";

/** Where "Report a problem" emails go. */
const SUPPORT_EMAIL = "binetasaju@gmail.com";

type EditField = "name" | "phone" | "upi";

const EDIT_CONFIG: Record<EditField, {
  title: string;
  hint: string;
  placeholder: string;
  keyboard: "default" | "phone-pad" | "email-address";
  capitalize: "none" | "words";
}> = {
  name: { title: "Edit name", hint: "This is how friends see you on bills.", placeholder: "Your name", keyboard: "default", capitalize: "words" },
  phone: { title: "Edit phone number", hint: "Friends add you from their contacts by this number.", placeholder: "98765 43210", keyboard: "phone-pad", capitalize: "none" },
  upi: { title: "Edit UPI ID", hint: "So friends can pay you directly, e.g. name@okbank.", placeholder: "yourname@upi", keyboard: "email-address", capitalize: "none" },
};

export default function ProfileScreen() {
  const { user } = useAuth();
  const { groups: bills } = useGroups();
  const { groups: savedGroups } = useContactGroups();

  const [editing, setEditing] = useState<EditField | null>(null);
  const [syncOn, setSyncOn] = useState(isCloudSyncEnabled());
  useEffect(() => subscribeCloudSyncSwitch(() => setSyncOn(isCloudSyncEnabled())), []);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);

  const openEdit = (field: EditField) => {
    setDraft(
      field === "name" ? user?.name ?? "" : field === "phone" ? user?.phoneNumber ?? "" : user?.upiId ?? ""
    );
    setDraftError(null);
    setEditing(field);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const value = draft.trim();
    if (editing === "name") {
      if (!value) return setDraftError("Please enter your name.");
      await authStore.updateUser({ name: value });
    } else if (editing === "phone") {
      if (!isValidPhoneNumber(value)) return setDraftError("Enter a valid 10-digit mobile number.");
      await authStore.updateUser({ phoneNumber: normalizePhoneNumber(value) ?? value });
    } else {
      // Required — friends on your bills pay you with it.
      if (!value) return setDraftError("Your UPI ID is needed so friends can pay you.");
      if (!isValidUpiId(value)) return setDraftError("That UPI ID doesn't look right (e.g. name@okbank).");
      await authStore.updateUser({ upiId: value });
    }
    setEditing(null);
  };

  const handleChangePassword = () => {
    if (!user?.email) return;
    appAlert.alert(
      "Change password",
      `We'll email a password reset link to ${user.email}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Send link",
          onPress: async () => {
            try {
              await authStore.sendPasswordReset(user.email!);
              appAlert.alert("Email sent", "Check your inbox for the reset link.");
            } catch (e) {
              appAlert.alert("Couldn't send", friendlyAuthError(e, "Please try again later."));
            }
          },
        },
      ]
    );
  };

  // ── Report a problem: opens the email app with a ready-to-fill message ────
  const handleReportProblem = async () => {
    const subject = `Billy problem report (v${appVersion})`;
    const body = [
      "What went wrong?",
      "",
      "",
      "What were you doing when it happened?",
      "",
      "",
      "(Screenshots help — please attach any.)",
      "",
      "— details for the Billy team —",
      `App version: ${appVersion}`,
      `Phone: ${Platform.OS} ${Platform.Version}`,
      `Account: ${user?.email || user?.phoneNumber || "—"}`,
    ].join("\n");
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      await Clipboard.setStringAsync(SUPPORT_EMAIL);
      appAlert.alert(
        "No email app found",
        `Please email ${SUPPORT_EMAIL} — the address has been copied.`
      );
    }
  };

  // ── Delete account (Play Store requirement) ──────────────────────────────
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const runDelete = async (proof: DeletionProof) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const summary = await deleteMyAccount(proof);
      setDeleteOpen(false);
      appAlert.alert(
        "Account deleted",
        summary && summary.billsKept > 0
          ? `Your account and the bills you created are gone. ${summary.billsKept} bill${summary.billsKept === 1 ? "" : "s"} created by friends stay with them.`
          : "Your account and everything Billy stored for it are gone."
      );
      // AuthGate in _layout.tsx sends you to /login.
    } catch (e) {
      setDeleteError(friendlyAuthError(e, "Couldn't delete your account. Please check your internet and try again."));
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAccount = () => {
    appAlert.alert(
      "Delete account?",
      "This permanently deletes your Billy account, your profile and UPI ID, your saved groups, " +
        "and the bills you created (for everyone on them). Bills friends created stay with them. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: async () => {
            const method = deletionMethod();
            if (method === "password") {
              setDeletePassword("");
              setDeleteError(null);
              setDeleteOpen(true);
            } else if (method === "google") {
              try {
                const idToken = await getGoogleIdToken();
                if (!idToken) return; // picker closed
                setDeleteOpen(true);
                await runDelete({ googleIdToken: idToken });
              } catch (e) {
                appAlert.alert("Couldn't confirm", friendlyAuthError(e, "Please try again."));
              }
            } else {
              setDeleteOpen(true);
              await runDelete(null);
            }
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    appAlert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            await authStore.logout();
            // AuthGate in _layout.tsx will redirect to /login automatically
          },
        },
      ]
    );
  };

  const memberSince = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;
  const myBills = bills.filter((b) => myIdOn(b, user?.uid) !== null);
  // Done from my point of view (I don't see whether others on the bill paid)
  const settledCount = myBills.filter((b) => statusForMe(b, user?.uid).status === "settled").length;
  const config = editing ? EDIT_CONFIG[editing] : null;
  const appVersion = Constants.expoConfig?.version ?? "—";

  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={s.header}>
          <Text style={s.title}>Profile</Text>
        </View>

        {/* ── Avatar + name ── */}
        <View style={s.avatarCard}>
          <View style={s.avatar}>
            <UserAvatar photoUrl={user?.photoUrl} name={user?.name} size={80} textStyle={s.avatarText} />
          </View>
          <Text style={s.name}>{user?.name || "—"}</Text>
          {user?.email ? <Text style={s.sub}>{user.email}</Text> : null}
          {memberSince ? <Text style={s.memberSince}>Member since {memberSince}</Text> : null}
        </View>

        {/* ── Quick stats ── */}
        <View style={s.statsRow}>
          <View style={s.stat}>
            <Text style={s.statValue}>{myBills.length}</Text>
            <Text style={s.statLabel}>Bills</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>{settledCount}</Text>
            <Text style={s.statLabel}>Settled</Text>
          </View>
          <View style={s.statDivider} />
          <View style={s.stat}>
            <Text style={s.statValue}>{savedGroups.length}</Text>
            <Text style={s.statLabel}>Groups</Text>
          </View>
        </View>

        {/* ── Personal details ── */}
        <Text style={s.sectionTitle}>Personal details</Text>
        <View style={s.card}>
          <Pressable onPress={() => openEdit("name")}>
            <Row icon="person-outline" label="Name" value={user?.name || "Not set — tap to add"} muted={!user?.name} actionIcon="pencil-outline" />
          </Pressable>
          <View style={s.divider} />
          <Pressable onPress={() => openEdit("phone")}>
            <Row icon="call-outline" label="Phone" value={user?.phoneNumber || "Not set — tap to add"} muted={!user?.phoneNumber} actionIcon="pencil-outline" />
          </Pressable>
          <View style={s.divider} />
          <Row
            icon="mail-outline"
            label="Email"
            value={user?.email || "Not linked"}
            muted={!user?.email}
            badge={user?.email ? "Verified" : undefined}
          />
        </View>

        {/* ── Payments ── */}
        <Text style={s.sectionTitle}>Payments</Text>
        <View style={s.card}>
          <Pressable onPress={() => openEdit("upi")}>
            <Row icon="wallet-outline" label="UPI ID" value={user?.upiId || "Not set — tap to add"} muted={!user?.upiId} actionIcon="pencil-outline" />
          </Pressable>
        </View>

        {/* ── Cloud sync ── */}
        <Text style={s.sectionTitle}>Sync</Text>
        <View style={s.card}>
          <View style={s.syncRow}>
            <View style={s.rowIcon}>
              <Ionicons name={syncOn ? "cloud-done-outline" : "cloud-offline-outline"} size={18} color={C.textMuted} />
            </View>
            <View style={s.rowContent}>
              <Text style={s.rowLabel}>Cloud sync</Text>
              <Text style={s.rowValue}>
                {syncOn ? "On — bills sync with friends" : "Off — bills stay on this phone"}
              </Text>
            </View>
            <Switch
              value={syncOn}
              onValueChange={(v) => void setCloudSyncEnabled(v)}
              trackColor={{ true: C.primary, false: C.borderStrong }}
              thumbColor={C.white}
              accessibilityLabel="Cloud sync"
            />
          </View>
        </View>

        {/* ── Account ── */}
        <Text style={s.sectionTitle}>Account</Text>
        <View style={s.card}>
          {user?.email && (
            <>
              <Pressable onPress={handleChangePassword}>
                <Row icon="key-outline" label="Password" value="Change password" actionIcon="chevron-forward" />
              </Pressable>
              <View style={s.divider} />
            </>
          )}
          <Pressable onPress={handleLogout}>
            <Row icon="log-out-outline" label="Session" value="Log out" danger actionIcon="chevron-forward" />
          </Pressable>
          <View style={s.divider} />
          <Pressable onPress={handleDeleteAccount} accessibilityRole="button">
            <Row icon="trash-outline" label="Delete account" value="Delete account and data" danger actionIcon="chevron-forward" />
          </Pressable>
        </View>

        {/* ── Help ── */}
        <Text style={s.sectionTitle}>Help</Text>
        <View style={s.card}>
          <Pressable onPress={handleReportProblem}>
            <Row icon="bug-outline" label="Something not working?" value="Report a problem" actionIcon="chevron-forward" />
          </Pressable>
        </View>

        {/* ── About ── */}
        <Text style={s.sectionTitle}>About</Text>
        <View style={s.card}>
          <Row icon="information-circle-outline" label="Version" value={`Billy ${appVersion}`} />
          <View style={s.divider} />
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)} accessibilityRole="link">
            <Row icon="shield-checkmark-outline" label="Privacy" value="Bills are shared only with the people on them. Billy never moves money. Read the privacy policy" multiline actionIcon="open-outline" />
          </Pressable>
        </View>

        <Text style={s.tagline}>Every bill matters.</Text>
      </ScrollView>

      {/* ── Edit modal (name / phone / UPI) ── */}
      <Modal visible={!!editing} animationType="slide" transparent onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView style={s.modalBackdrop} behavior="padding">
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{config?.title}</Text>
            <Text style={s.modalLabel}>{config?.hint}</Text>
            <TextInput
              style={[s.modalInput, draftError && s.modalInputError]}
              value={draft}
              onChangeText={(t) => { setDraft(t); setDraftError(null); }}
              placeholder={config?.placeholder}
              placeholderTextColor={C.textSubtle}
              keyboardType={config?.keyboard}
              autoCapitalize={config?.capitalize}
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveEdit}
              autoFocus
            />
            {draftError && <Text style={s.modalError}>{draftError}</Text>}
            <View style={s.modalActions}>
              <Pressable onPress={() => setEditing(null)} style={s.modalCancelBtn}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={saveEdit} style={s.modalSaveBtn}>
                <Text style={s.modalSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── Delete account: confirm with password / progress ── */}
      <Modal visible={deleteOpen} animationType="fade" transparent onRequestClose={() => !deleting && setDeleteOpen(false)}>
        <KeyboardAvoidingView style={s.modalBackdrop} behavior="padding">
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Delete account</Text>
            {deletionMethod() === "password" && !deleting && (
              <>
                <Text style={s.modalLabel}>Enter your password to confirm.</Text>
                <TextInput
                  style={[s.modalInput, deleteError && s.modalInputError]}
                  value={deletePassword}
                  onChangeText={(t) => { setDeletePassword(t); setDeleteError(null); }}
                  placeholder="Password"
                  placeholderTextColor={C.textSubtle}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
              </>
            )}
            {deleting && <Text style={s.modalLabel}>Deleting your account…</Text>}
            {deleteError && <Text style={s.modalError}>{deleteError}</Text>}
            {!deleting && (
              <View style={s.modalActions}>
                <Pressable onPress={() => setDeleteOpen(false)} style={s.modalCancelBtn}>
                  <Text style={s.modalCancelText}>Cancel</Text>
                </Pressable>
                {deletionMethod() === "password" && (
                  <Pressable
                    onPress={() => deletePassword && runDelete({ password: deletePassword })}
                    style={[s.modalSaveBtn, { backgroundColor: C.danger }]}
                  >
                    <Text style={s.modalSaveText}>Delete forever</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Row({
  icon, label, value, muted = false, mono = false, danger = false, multiline = false, badge, actionIcon,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  muted?: boolean;
  mono?: boolean;
  danger?: boolean;
  multiline?: boolean;
  badge?: string;
  actionIcon?: React.ComponentProps<typeof Ionicons>["name"];
}) {
  return (
    <View style={s.row}>
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={18} color={danger ? C.danger : C.textMuted} />
      </View>
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
        <View style={s.rowValueLine}>
          <Text
            style={[s.rowValue, muted && s.rowValueMuted, mono && s.rowValueMono, danger && s.rowValueDanger, { flexShrink: 1 }]}
            numberOfLines={multiline ? 2 : 1}
          >
            {value}
          </Text>
          {badge ? (
            <View style={s.badge}>
              <Ionicons name="checkmark-circle" size={11} color={C.successDark} />
              <Text style={s.badgeText}>{badge}</Text>
            </View>
          ) : null}
        </View>
      </View>
      {actionIcon && (
        <View style={{ paddingLeft: 8 }}>
          <Ionicons name={actionIcon} size={18} color={C.textSubtle} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: TAB_BAR_CLEARANCE },

  header: { marginBottom: 20 },
  title: { ...T.largeTitle, color: C.ink },

  avatarCard: { alignItems: "center", marginBottom: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: C.primary,
    alignItems: "center", justifyContent: "center",
    marginBottom: 12, overflow: "hidden",
    shadowColor: C.primary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 0,
  },
  avatarText: { color: "#fff", fontSize: 24, fontWeight: "700" },
  name: { fontSize: 17, fontWeight: "700", color: C.ink, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: C.textMuted, marginTop: 4 },
  memberSince: { fontSize: 11, color: C.textSubtle, marginTop: 4 },

  statsRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: C.glass, borderRadius: 16,
    borderWidth: 1, borderColor: C.glassBorder, paddingVertical: 14, marginBottom: 24,
  },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 17, fontWeight: "800", color: C.ink },
  statLabel: { fontSize: 11, color: C.textMuted, marginTop: 2, fontWeight: "600" },
  statDivider: { width: 1, height: 28, backgroundColor: C.surfaceAlt },

  sectionTitle: {
    fontSize: 11, fontWeight: "700", color: C.textMuted, textTransform: "uppercase",
    letterSpacing: 0.6, marginBottom: 8, marginLeft: 4,
  },
  tagline: { textAlign: "center", fontSize: 11, color: C.textSubtle, marginTop: 4, marginBottom: 8 },

  card: {
    backgroundColor: C.glass, borderRadius: 16,
    borderWidth: 1, borderColor: C.glassBorder,
    marginBottom: 24, overflow: "hidden",
  },
  divider: { height: 1, backgroundColor: C.surfaceAlt, marginLeft: 52 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14 },
  rowIcon: { width: 36, alignItems: "center" },
  rowContent: { flex: 1 },
  syncRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  rowLabel: { fontSize: 11, color: C.textSubtle, fontWeight: "500", marginBottom: 2 },
  rowValue: { fontSize: 13, color: C.ink, fontWeight: "500" },
  rowValueMuted: { color: C.textSubtle },
  rowValueMono: { fontFamily: "monospace", fontSize: 11, color: C.text },
  rowValueDanger: { color: C.danger, fontWeight: "700" },
  rowValueLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: {
    flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.successSoft,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: C.successDark },

  logoutBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, paddingVertical: 16, borderRadius: 14,
    borderWidth: 1.5, borderColor: "#FEE2E2", backgroundColor: "#FFF5F5",
  },
  logoutText: { fontSize: 14, fontWeight: "700", color: C.danger },

  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: C.ink, marginBottom: 6 },
  modalLabel: { fontSize: 12, color: C.textMuted, marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: C.border, borderRadius: 12, padding: 14, fontSize: 14, color: C.ink, marginBottom: 8, backgroundColor: C.bg },
  modalInputError: { borderColor: C.danger, backgroundColor: C.dangerSoft },
  modalError: { fontSize: 11, color: C.danger, marginBottom: 8 },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 16 },
  modalCancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: "center" },
  modalCancelText: { color: C.text, fontWeight: "600", fontSize: 13 },
  modalSaveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: "center" },
  modalSaveText: { color: "#fff", fontWeight: "600", fontSize: 13 },
});
