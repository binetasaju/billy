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
// Firebase migration path:
//   Replace the body of login() / logout() with Firebase Auth calls.
//   Add onAuthStateChanged() listener in restore() instead of AsyncStorage read.
//   The public API (login, logout, get, subscribe) stays identical.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { User } from "../types/user";

const STORAGE_KEY = "@billy_auth_user";

interface AuthState {
  user: User | null;
  /** True while restore() is reading from AsyncStorage on app start. */
  isLoading: boolean;
}

let _state: AuthState = { user: null, isLoading: true };
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
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
      const user: User | null = raw ? JSON.parse(raw) : null;
      _state = { user, isLoading: false };
    } catch {
      _state = { user: null, isLoading: false };
    }
    _notify();
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
  },

  /**
   * Update fields on the current user (e.g., adding UPI ID from onboarding).
   */
  async updateUser(patch: Partial<User>): Promise<void> {
    if (!_state.user) return;
    const updated: User = { ..._state.user, ...patch };
    _state = { user: updated, isLoading: false };
    _notify();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[authStore] Failed to persist updated user:", e);
    }
  },

  /**
   * Clear session. Called on logout.
   *
   * Firebase migration: also call firebase.auth().signOut() here.
   */
  async logout(): Promise<void> {
    _state = { user: null, isLoading: false };
    _notify();
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("[authStore] Failed to clear user:", e);
    }
  },
};
