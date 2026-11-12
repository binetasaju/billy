// ---------------------------------------------------------------------------
// services/cloud/cloudSync.ts — turns cloud sync on / off with the session
//
// Signed in with Firebase → listen to my bills, send changes, publish my
// profile, and upload bills that are only on this phone (once each).
// Signed out → stop, and drop cloud copies from the phone (they come back on
// the next sign-in); bills that were never uploaded stay.
// Without Firestore (old build) nothing happens: Billy works on the phone only.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import { authStore } from "../authStore";
import { groupStore } from "../groupStore";
import { contactGroupStore } from "../contactGroupStore";
import { myIdOn } from "../homeSummary";
import type { User } from "../../types/user";
import { type CloudDb, getCloudDb } from "./cloudDb";
import { type BillSync, startBillSync } from "./billSync";
import { startGroupSync, type GroupSync } from "./groupSync";
import { publishProfile } from "./profiles";
import type { Me } from "./billMapping";

interface Session {
  me: Me;
  db: CloudDb;
  bills: BillSync;
  groups: GroupSync;
  profileKey: string;
}

let session: Session | null = null;

// ── On/off switch (Profile → Cloud sync) ──────────────────────────────────
const ENABLED_KEY = "@billy_cloud_sync_enabled";
let enabled = true;
let rerun: (() => void) | null = null;
const switchListeners = new Set<() => void>();

export function isCloudSyncEnabled(): boolean {
  return enabled;
}

export function subscribeCloudSyncSwitch(fn: () => void): () => void {
  switchListeners.add(fn);
  return () => switchListeners.delete(fn);
}

/** Turn syncing on/off. Off = Billy works on this phone only (cloud copies stay cached). */
export async function setCloudSyncEnabled(on: boolean): Promise<void> {
  enabled = on;
  switchListeners.forEach((fn) => fn());
  try {
    await AsyncStorage.setItem(ENABLED_KEY, on ? "1" : "0");
  } catch {
    // Not critical — the choice still applies until the app restarts.
  }
  if (!on) stop(false);
  rerun?.();
}

const profileKey = (u: User) => JSON.stringify([u.name, u.email, u.phoneNumber, u.upiId, u.photoUrl]);

/** Upload my bills that exist only on this phone (not other accounts' bills). */
export async function uploadPhoneOnlyBills(sync: BillSync, me: Me): Promise<number> {
  let n = 0;
  for (const g of groupStore.get().groups) {
    if (g.inCloud || sync.has(g.id) || myIdOn(g, me.billyUid) === null) continue;
    try {
      await sync.saveBill(g);
      n++;
    } catch (e) {
      console.warn("[cloud] could not upload bill", g.id, e);
    }
  }
  return n;
}

function stop(signedOut: boolean) {
  if (!session) return;
  session.bills.stop();
  session.groups.stop();
  groupStore.setRemote(null);
  contactGroupStore.setRemote(null);
  session = null;
  if (signedOut) {
    void groupStore.applyCloud([]);
    void contactGroupStore.applyCloud([]);
  }
}

function onSession(getDb: () => CloudDb | null) {
  const user = authStore.get().user;
  const authUid = user?.authProvider === "firebase" ? user.firebaseUid : undefined;

  if (!user || !authUid) {
    stop(true);
    return;
  }
  if (!enabled) return;

  if (session && session.me.authUid === authUid) {
    // Same account — just keep the public profile current.
    const key = profileKey(user);
    if (key !== session.profileKey) {
      session.profileKey = key;
      publishProfile(session.db, authUid, user).catch((e) => console.warn("[cloud] profile:", e));
    }
    return;
  }

  stop(true);
  const db = getDb();
  if (!db) return;

  const me: Me = { billyUid: user.uid, authUid };
  let uploaded = false;
  const bills = startBillSync(db, me, (cloudBills) => {
    void groupStore.applyCloud(cloudBills);
    if (!uploaded) {
      uploaded = true;
      void uploadPhoneOnlyBills(bills, me).then((n) => n && console.log(`[cloud] uploaded ${n} bills`));
    }
  });
  const groups = startGroupSync(db, authUid);

  groupStore.setRemote(bills);
  contactGroupStore.setRemote(groups);
  session = { me, db, bills, groups, profileKey: profileKey(user) };
  publishProfile(db, authUid, user).catch((e) => console.warn("[cloud] profile:", e));
}

/** Call once at start-up, after the local stores have been restored. */
export function initCloudSync(getDb: () => CloudDb | null = getCloudDb): () => void {
  const handler = () => onSession(getDb);
  rerun = handler;
  const unsubscribe = authStore.subscribe(handler);
  AsyncStorage.getItem(ENABLED_KEY)
    .then((v) => {
      enabled = v !== "0";
      switchListeners.forEach((fn) => fn());
    })
    .catch(() => {})
    .finally(handler);
  return () => {
    unsubscribe();
    rerun = null;
    stop(false);
  };
}

/** The live cloud connection, for screens that need it (add by email, join). */
export function cloudSession(): { db: CloudDb; me: Me } | null {
  return session ? { db: session.db, me: session.me } : null;
}
