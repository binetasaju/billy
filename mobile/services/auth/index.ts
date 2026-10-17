// ---------------------------------------------------------------------------
// services/auth/index.ts
//
// Provider registry. Exactly one provider is active at a time; local is the
// default so the app works with no configuration at all.
// ---------------------------------------------------------------------------

import type { AuthProvider } from "./authProvider";
import { localAuthProvider } from "./localAuthProvider";

let _provider: AuthProvider = localAuthProvider;

/**
 * Swap in a real provider at app start (see firebaseAuthProvider for the
 * one-line wiring). A provider that reports itself unavailable is ignored,
 * so a half-finished Firebase setup can never lock anyone out.
 */
export function registerAuthProvider(provider: AuthProvider): boolean {
  if (!provider.isAvailable()) {
    console.warn(
      `[auth] Provider "${provider.id}" is not available — keeping "${_provider.id}".`
    );
    return false;
  }
  _provider = provider;
  return true;
}

export function getAuthProvider(): AuthProvider {
  return _provider;
}

/** Test/reset hook — restores the default local provider. */
export function resetAuthProvider(): void {
  _provider = localAuthProvider;
}

export * from "./authProvider";
export { localAuthProvider, generateLocalUid } from "./localAuthProvider";
export { createFirebaseAuthProvider } from "./firebaseAuthProvider";
export type {
  FirebaseAuthSdk,
  FirebaseAuthInstance,
  FirebaseAuthUser,
  FirebaseConfirmationResult,
} from "./firebaseAuthProvider";
