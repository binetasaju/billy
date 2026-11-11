// ---------------------------------------------------------------------------
// services/cloud/profiles.ts — my public profile + "add by email" lookup
//
//   users/{authUid}   name, email, phone, upiId, photoUrl (anyone signed in can GET)
//   emails/{email}    { uid } — only your own, verified email (see firestore.rules)
// ---------------------------------------------------------------------------

import type { User } from "../../types/user";
import type { CloudDb } from "./cloudDb";
import { stripUndefined } from "./billMapping";

export interface PublicProfile {
  uid: string;
  name: string;
  email?: string;
  phone?: string;
  upiId?: string;
  photoUrl?: string;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** Publish my profile (and my email for lookups). Safe to call often. */
export async function publishProfile(db: CloudDb, authUid: string, user: User): Promise<void> {
  await db.set(
    `users/${authUid}`,
    stripUndefined({
      name: user.name || "",
      email: user.email ? normalizeEmail(user.email) : undefined,
      phone: user.phoneNumber || undefined,
      upiId: user.upiId || undefined,
      photoUrl: user.photoUrl || undefined,
      updatedAt: new Date().toISOString(),
    }),
    true
  );
  if (user.email) {
    try {
      await db.set(`emails/${normalizeEmail(user.email)}`, { uid: authUid });
    } catch (e) {
      // Fails until the sign-in token knows the email is verified — retried on next publish.
      console.warn("[cloud] email lookup not registered yet:", e instanceof Error ? e.message : e);
    }
  }
}

export async function getProfile(db: CloudDb, uid: string): Promise<PublicProfile | null> {
  const data = await db.get(`users/${uid}`);
  return data ? ({ uid, ...data } as PublicProfile) : null;
}

/** Find a Billy account by email (exact match only). */
export async function findProfileByEmail(db: CloudDb, email: string): Promise<PublicProfile | null> {
  const entry = await db.get(`emails/${normalizeEmail(email)}`);
  if (!entry?.uid) return null;
  return getProfile(db, entry.uid as string);
}
