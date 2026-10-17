// ---------------------------------------------------------------------------
// services/auth/initFirebaseAuth.ts
//
// Adapts @react-native-firebase/auth (v26, modular API) to the FirebaseAuthSdk
// shape createFirebaseAuthProvider already expects, and registers it.
//
// Two deliberate choices:
//
//  • The SDK is require()d lazily INSIDE the try. The package is installed, so
//    Metro resolves it, but the native module only exists after a rebuild with
//    google-services.json / GoogleService-Info.plist in place. A top-level
//    import would throw at module load and take the whole app down; this way a
//    missing/unconfigured native module is caught and Billy stays on the local
//    provider.
//
//  • The modular API (getAuth/signInWithPhoneNumber/signOut) is wrapped rather
//    than the provider being rewritten, so firebaseAuthProvider and authStore
//    are untouched.
// ---------------------------------------------------------------------------

import { registerAuthProvider } from "./index";
import { createFirebaseAuthProvider } from "./firebaseAuthProvider";
import type { FirebaseAuthSdk } from "./firebaseAuthProvider";

/** The slice of the modular auth module this adapter uses. */
export interface FirebaseAuthModule {
  getAuth: (app?: any) => any;
  signInWithPhoneNumber: (auth: any, phoneNumber: string) => Promise<any>;
  signOut: (auth: any) => Promise<void>;
}

/** Wrap the modular functions into the instance-shaped SDK the provider takes. */
export function toFirebaseAuthSdk(mod: FirebaseAuthModule): FirebaseAuthSdk {
  return () => {
    const auth = mod.getAuth();
    return {
      get currentUser() {
        return auth?.currentUser ?? null;
      },
      signInWithPhoneNumber: (phoneNumber: string) =>
        mod.signInWithPhoneNumber(auth, phoneNumber),
      signOut: () => mod.signOut(auth),
    };
  };
}

/**
 * Register Firebase phone auth as the active provider.
 *
 * Returns false (and leaves the local provider in place) when the SDK or its
 * native configuration is missing — sign-in keeps working either way.
 *
 * @param moduleOverride injected in tests; production passes nothing.
 */
export function initFirebaseAuth(moduleOverride?: FirebaseAuthModule): boolean {
  try {
    const mod: FirebaseAuthModule =
      moduleOverride ??
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@react-native-firebase/auth");

    if (
      typeof mod?.getAuth !== "function" ||
      typeof mod?.signInWithPhoneNumber !== "function"
    ) {
      console.warn("[auth] Firebase auth module is missing expected exports.");
      return false;
    }

    return registerAuthProvider(createFirebaseAuthProvider(toFirebaseAuthSdk(mod)));
  } catch (e) {
    // Native module absent (no rebuild yet) or Firebase app not configured.
    console.warn(
      "[auth] Firebase auth unavailable — continuing with local sign-in.",
      e instanceof Error ? e.message : e
    );
    return false;
  }
}
