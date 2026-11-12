// ---------------------------------------------------------------------------
// services/profilePhotos.ts — profile photos of other Billy users
//
// Every Billy account publishes users/{authUid} with its photoUrl (e.g. the
// Google profile picture). Avatars ask for a uid's photo here; each uid is
// fetched once per app session and shared by every avatar that shows it.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { getCloudDb, type CloudDb } from "./cloud/cloudDb";

/** uid → photo URL, or null when the account has no photo. */
const photos = new Map<string, string | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();

let dbForTests: CloudDb | null | undefined;
/** Tests only: use a fake database and start from an empty cache. */
export function _resetProfilePhotos(db?: CloudDb | null) {
  photos.clear();
  pending.clear();
  dbForTests = db;
}

export function getProfilePhoto(uid: string | undefined): string | undefined {
  return (uid && photos.get(uid)) || undefined;
}

/** Fetch the photo for `uid` (once). Safe to call on every render. */
export function requestProfilePhoto(uid: string | undefined): void {
  if (!uid || photos.has(uid) || pending.has(uid)) return;
  const db = dbForTests !== undefined ? dbForTests : getCloudDb();
  if (!db) return;
  pending.add(uid);
  db.get(`users/${uid}`)
    .then((profile) => {
      const url = typeof profile?.photoUrl === "string" && profile.photoUrl.trim() ? profile.photoUrl.trim() : null;
      photos.set(uid, url);
      listeners.forEach((l) => l());
    })
    .catch(() => {
      // Not signed in yet / offline — try again next time an avatar asks.
    })
    .finally(() => pending.delete(uid));
}

export function subscribeProfilePhotos(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The photo URL of a Billy account, once loaded (undefined until then or if none). */
export function useProfilePhoto(uid: string | undefined): string | undefined {
  const [url, setUrl] = useState(() => getProfilePhoto(uid));
  useEffect(() => {
    setUrl(getProfilePhoto(uid));
    if (!uid) return;
    const unsub = subscribeProfilePhotos(() => setUrl(getProfilePhoto(uid)));
    requestProfilePhoto(uid);
    return unsub;
  }, [uid]);
  return url;
}

/**
 * Person id → Billy account, learnt from your bills. Contact-group members
 * added from phone contacts don't store their account, but once they join a
 * bill made from the group (same person id) their account is on that bill.
 */
export function accountsFromBills(bills: { participants: { id: string; authUid?: string }[] }[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const b of bills) for (const p of b.participants) if (p.authUid && !map[p.id]) map[p.id] = p.authUid;
  return map;
}
