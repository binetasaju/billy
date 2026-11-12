// ---------------------------------------------------------------------------
// services/accountDeletion.ts — Profile → Delete account
//
//   1. prove it's you (password or Google) — Firebase refuses old sign-ins
//   2. pause cloud sync so nothing is uploaded again
//   3. delete cloud data (services/cloud/deleteCloudData.ts)
//   4. delete the Firebase account
//   5. wipe everything Billy stored on this phone
//
// If step 3 or 4 fails, sync is turned back on and nothing is wiped, so the
// person can try again.
// ---------------------------------------------------------------------------
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authStore } from "./authStore";
import { getAuthProvider } from "./auth";
import { groupStore } from "./groupStore";
import { contactGroupStore } from "./contactGroupStore";
import { getCloudDb } from "./cloud/cloudDb";
import { deleteCloudData, type DeletionSummary } from "./cloud/deleteCloudData";
import { pauseCloudSync, resumeCloudSync } from "./cloud/cloudSync";

export type DeletionProof = { password: string } | { googleIdToken: string } | null;

/** How this account confirms the delete: "password", "google", or "none" (phone-only account). */
export function deletionMethod(): "password" | "google" | "none" {
  const user = authStore.get().user;
  if (user?.authProvider !== "firebase") return "none";
  const methods = getAuthProvider().signInMethods?.() ?? [];
  if (methods.includes("password")) return "password";
  if (methods.includes("google")) return "google";
  return "none";
}

export async function deleteMyAccount(proof: DeletionProof): Promise<DeletionSummary | null> {
  const user = authStore.get().user;
  if (!user) throw new Error("You're not signed in.");
  let summary: DeletionSummary | null = null;

  if (user.authProvider === "firebase" && user.firebaseUid) {
    const provider = getAuthProvider();
    if (!provider.deleteAccount) throw new Error("Deleting accounts needs the latest version of Billy.");
    if (proof && provider.reauthenticate) await provider.reauthenticate(proof);

    pauseCloudSync();
    try {
      const db = getCloudDb();
      if (db) summary = await deleteCloudData(db, user.firebaseUid, user.email);
      await provider.deleteAccount();
    } catch (e) {
      resumeCloudSync();
      throw e;
    }
  }

  await wipePhone();
  resumeCloudSync();
  return summary;
}

/** Everything Billy keeps on this phone. */
async function wipePhone(): Promise<void> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("@billy"));
    await AsyncStorage.multiRemove(keys);
  } catch (e) {
    console.warn("[deleteAccount] could not clear phone storage:", e);
  }
  await groupStore.restore();
  await contactGroupStore.restore();
  await authStore.forgetDeletedAccount();
}
