// ---------------------------------------------------------------------------
// services/authStore.ts
//
// Centralized auth state for Billy.
//
// Architecture:
//   • Module-level singleton — consistent with billStore.ts pattern
//   • AsyncStorage persistence — survives app restarts
//   • Subscriber pattern — reactive updates without React Context
//
// Identity:
//   `User.uid` is Billy's identity and is referenced by stored BillGroups
//   (participants, payerId, settlement from/to), ContactGroup members, History
//   totals and Group Balances. It is therefore treated as immutable: no code
//   path here ever rewrites the uid of an existing session.
//
//   That guarantee has to outlive the session record itself. logout() clears
//   @billy_auth_user, but the bills it is referenced by live under their own
//   keys and stay on the device — so a sign-out followed by a Firebase sign-in
//   would otherwise mint a fresh uid and orphan all of that history. A small
//   durable record (@billy_auth_identity) therefore remembers which canonical
//   uid belongs to which phone number, and survives logout. Firebase auth
//   rejoins that uid instead of replacing it; the Firebase UID is recorded
//   alongside as `firebaseUid`. Only a phone number this device has never
//   signed in before gets uid === Firebase UID.
//
//   WHO authenticates is pluggable (services/auth) — local by default, Firebase
//   phone auth once its SDK and native config are registered. Swapping the
//   provider does not change this store's public API or the stored shape.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "../types/user";
import { getAuthProvider } from "./auth";
import type { AuthIdentity, SignInResult } from "./auth";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber";

const STORAGE_KEY = "@billy_auth_user";

/**
 * Durable phone → canonical uid records. Deliberately a SEPARATE key from the
 * session: logout() clears the session but leaves this behind, so signing back
 * in rejoins the same Billy identity and every bill that references it.
 */
const IDENTITY_KEY = "@billy_auth_identity";

/** How many past accounts this device remembers. Shared devices are rare. */
const MAX_REMEMBERED_IDENTITIES = 5;

/**
 * The minimum needed to prove "this phone number is already someone on this
 * device". Carries no money and no bill data — it only resolves identity.
 */
interface CanonicalIdentity {
  /** Billy's canonical uid. This is the value that must never be rewritten. */
  uid: string;
  /** Normalized E.164 number, used as the match key. */
  phoneNumber: string;
  name?: string;
  createdAt?: string;
  firebaseUid?: string;
}

interface AuthState {
  user: User | null;
  /** True while restore() is reading from AsyncStorage on app start. */
  isLoading: boolean;
}

/**
 * Bring a persisted user up to the current shape WITHOUT touching identity.
 *
 * Sessions written before providers existed have no `authProvider`; they are
 * local sessions and are tagged as such in memory. The uid is never changed,
 * so every bill, group, balance and settlement that references it keeps
 * resolving. The tag reaches storage on the next ordinary write — restore()
 * leaves the session record itself untouched so an interrupted start can never
 * corrupt it.
 */
function _migrate(user: User | null): User | null {
  if (!user) return null;
  if (user.authProvider) return user;
  return { ...user, authProvider: "local" };
}

let _state: AuthState = { user: null, isLoading: true };
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

// ── Canonical identity records ──────────────────────────────────────────────

async function _readIdentities(): Promise<CanonicalIdentity[]> {
  try {
    const raw = await AsyncStorage.getItem(IDENTITY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed)
      ? parsed.filter((r): r is CanonicalIdentity => !!r?.uid && !!r?.phoneNumber)
      : [];
  } catch {
    return [];
  }
}

/**
 * Record (or refresh) the canonical uid for a user's phone number.
 *
 * Never overwrites a uid: an existing record for the same number is updated in
 * place and keeps its original `uid`, so nothing can renumber an account that
 * bills already point at.
 */
async function _rememberIdentity(user: User): Promise<void> {
  const phoneNumber = normalizePhoneNumber(user.phoneNumber);
  if (!phoneNumber || !user.uid) return;

  try {
    const existing = await _readIdentities();
    const prior = existing.find((r) => r.phoneNumber === phoneNumber);
    const record: CanonicalIdentity = {
      uid: prior?.uid ?? user.uid,
      phoneNumber,
      name: user.name || prior?.name,
      createdAt: prior?.createdAt ?? user.createdAt,
      firebaseUid: user.firebaseUid ?? prior?.firebaseUid,
    };
    const next = [record, ...existing.filter((r) => r.phoneNumber !== phoneNumber)].slice(
      0,
      MAX_REMEMBERED_IDENTITIES
    );
    await AsyncStorage.setItem(IDENTITY_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("[authStore] Failed to record canonical identity:", e);
  }
}

/** The canonical identity this device already holds for a number, if any. */
async function _recallIdentity(phoneNumber: string): Promise<CanonicalIdentity | null> {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) return null;
  const existing = await _readIdentities();
  return existing.find((r) => r.phoneNumber === normalized) ?? null;
}

export const authStore = {
  // ── Read ────────────────────────────────────────────────────────────────────
  get(): AuthState {
    return _state;
  },

  // ── Subscribe ───────────────────────────────────────────────────────────────
  /**
   * Subscribe to state changes.
   * Returns an unsubscribe function — call it in useEffect cleanup.
   */
  subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  // ── Persistence ─────────────────────────────────────────────────────────────
  /**
   * Called once on app start (from _layout.tsx).
   * Reads the persisted user from AsyncStorage and notifies listeners.
   *
   * Firebase migration: replace with Firebase's onAuthStateChanged listener.
   */
  async restore(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const stored: User | null = raw ? JSON.parse(raw) : null;
      _state = { user: _migrate(stored), isLoading: false };
    } catch {
      _state = { user: null, isLoading: false };
    }
    _notify();

    // Seed the durable identity record from whatever session is already on the
    // device. A session written long before this record existed would otherwise
    // only be captured on its next write — and a logout could come first, at
    // which point the canonical uid its bills reference would be unrecoverable.
    // This touches IDENTITY_KEY only; the session record is still never
    // rewritten here, and a failure is non-fatal to app start.
    if (_state.user) {
      void _rememberIdentity(_state.user);
    }
  },

  // ── Auth actions ─────────────────────────────────────────────────────────────
  /**
   * Persist a user session. Called after mock login or Firebase sign-in.
   */
  async login(user: User): Promise<void> {
    _state = { user, isLoading: false };
    _notify();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } catch (e) {
      console.warn("[authStore] Failed to persist user:", e);
    }
    await _rememberIdentity(user);
  },

  /**
   * Update fields on the current user (e.g., adding UPI ID from onboarding).
   */
  async updateUser(patch: Partial<User>): Promise<void> {
    if (!_state.user) return;
    const updated: User = { ..._state.user, ...patch, uid: _state.user.uid };
    _state = { user: updated, isLoading: false };
    _notify();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[authStore] Failed to persist updated user:", e);
    }
    await _rememberIdentity(updated);
  },

  // ── Provider-backed sign-in ─────────────────────────────────────────────────

  /** Which provider is currently active ("local" until one is registered). */
  activeProviderId() {
    return getAuthProvider().id;
  },

  /** True when sign-in needs an SMS code step. */
  requiresVerification(): boolean {
    return getAuthProvider().requiresVerification();
  },

  /**
   * Start a phone sign-in. With the local provider this completes immediately
   * and the session is live on return; with Firebase it sends an SMS and
   * returns a verificationId for confirmPhoneSignIn().
   */
  async signInWithPhone(name: string, phoneNumber: string): Promise<SignInResult> {
    const normalized = normalizePhoneNumber(phoneNumber) ?? phoneNumber;
    const result = await getAuthProvider().signInWithPhone({
      phoneNumber: normalized,
      name: name.trim(),
    });

    if (result.status === "signed-in") {
      await _openSession(result.identity, name);
    }
    return result;
  },

  /** Complete an SMS-code sign-in and open the session. */
  async confirmPhoneSignIn(
    verificationId: string,
    code: string,
    name: string
  ): Promise<User> {
    const identity = await getAuthProvider().confirmCode(verificationId, code, name);
    return _openSession(identity, name);
  },

  /**
   * Attach a verified Firebase identity to the CURRENT session.
   *
   * The existing `uid` is kept deliberately: it is referenced by stored bills,
   * groups and balances, so replacing it would orphan that history. The
   * Firebase UID is recorded alongside for future server-side resolution.
   *
   * Returns the linked user, or null when there is no open session to link to
   * (in which case _openSession falls back to the remembered-identity path).
   */
  async linkFirebaseIdentity(identity: AuthIdentity): Promise<User | null> {
    if (!_state.user) return null;
    await this.updateUser({
      firebaseUid: identity.providerUid,
      authProvider: "firebase",
      phoneNumber: _state.user.phoneNumber || identity.phoneNumber,
    });
    return _state.user;
  },

  /**
   * Clear session. Signs out of the provider too; a provider failure must not
   * strand the user in a signed-in state, so the local session is cleared
   * regardless.
   *
   * IDENTITY_KEY is deliberately left in place — see the identity notes at the
   * top of this file. Signing back in must land on the same canonical uid.
   */
  async logout(): Promise<void> {
    if (_state.user) {
      // Last chance to capture the canonical uid before the session goes.
      await _rememberIdentity(_state.user);
    }
    try {
      await getAuthProvider().signOut();
    } catch (e) {
      console.warn("[authStore] Provider sign-out failed:", e);
    }
    _state = { user: null, isLoading: false };
    _notify();
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("[authStore] Failed to clear user:", e);
    }
  },
};

/**
 * Turn a freshly verified provider identity into an open Billy session.
 *
 * Resolution order — the first two branches both PRESERVE an existing uid:
 *
 *   1. A session is already open → link in place (linkFirebaseIdentity).
 *      This is the "verify my number" flow; uid is untouched.
 *   2. No session, but this device has signed this number in before → rejoin
 *      that remembered canonical uid. This is the legacy/local account signing
 *      in through Firebase after a logout, and is what keeps its bills,
 *      settlements, history and group balances attached.
 *   3. Genuinely new to this device → the provider uid becomes Billy's uid.
 *
 * Nothing here reads or rewrites stored bills. Participant ids, payerId and
 * settlement fromUserId/toUserId stay exactly as they were written, because
 * the uid they point at is the one that gets reused.
 */
async function _openSession(identity: AuthIdentity, fallbackName: string): Promise<User> {
  // 1 — live session: link, never replace.
  const linked = await authStore.linkFirebaseIdentity(identity);
  if (linked) return linked;

  // 2 — known number on this device: rejoin its canonical uid.
  const prior = await _recallIdentity(identity.phoneNumber);
  if (prior) {
    const user = _reattach(prior, identity, fallbackName);
    await authStore.login(user);
    return user;
  }

  // 3 — new account.
  const user = _userFromIdentity(identity, fallbackName);
  await authStore.login(user);
  return user;
}

/**
 * Rebuild a session on a remembered canonical uid. The provider uid is stored
 * as `firebaseUid` only — `uid` comes from the remembered record.
 */
function _reattach(
  prior: CanonicalIdentity,
  identity: AuthIdentity,
  fallbackName: string
): User {
  const providerId = getAuthProvider().id;
  return {
    uid: prior.uid,
    name: (identity.name ?? fallbackName ?? "").trim() || prior.name || "",
    phoneNumber:
      normalizePhoneNumber(identity.phoneNumber) ?? prior.phoneNumber,
    createdAt: prior.createdAt ?? new Date().toISOString(),
    authProvider: providerId,
    ...(providerId === "firebase" ? { firebaseUid: identity.providerUid } : {}),
  };
}

/**
 * Build Billy's User from a provider identity. For a brand-new account the
 * provider uid becomes Billy's uid; existing accounts are never rebuilt this
 * way (see _openSession, linkFirebaseIdentity and _reattach).
 */
function _userFromIdentity(identity: AuthIdentity, fallbackName: string): User {
  const providerId = getAuthProvider().id;
  return {
    uid: identity.providerUid,
    name: (identity.name ?? fallbackName).trim(),
    phoneNumber: identity.phoneNumber,
    createdAt: new Date().toISOString(),
    authProvider: providerId,
    ...(providerId === "firebase" ? { firebaseUid: identity.providerUid } : {}),
  };
}
