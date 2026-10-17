// ---------------------------------------------------------------------------
// services/auth/firebaseAuthProvider.ts
//
// Firebase phone-auth adapter.
//
// IMPORTANT: this file deliberately does NOT import @react-native-firebase/auth.
// The SDK is not installed yet, and a static import (or require) of a missing
// module breaks the Metro bundle for everyone. Instead the adapter is built
// around the small slice of the SDK it actually uses, which the app injects
// once the package and native config exist:
//
//   // app/_layout.tsx, after installing @react-native-firebase/auth:
//   import auth from "@react-native-firebase/auth";
//   registerAuthProvider(createFirebaseAuthProvider(auth));
//
// Until that line exists Billy keeps using localAuthProvider, and nothing here
// runs. Injecting the SDK also makes this adapter testable without installing
// anything. No project ids, keys, or other config values are invented here —
// they belong in google-services.json / GoogleService-Info.plist.
// ---------------------------------------------------------------------------

import type {
  AuthProvider,
  AuthIdentity,
  PhoneSignInRequest,
  SignInResult,
} from "./authProvider";

/** The confirmation handle returned by signInWithPhoneNumber(). */
export interface FirebaseConfirmationResult {
  verificationId: string;
  confirm(code: string): Promise<{ user: FirebaseAuthUser } | null>;
}

export interface FirebaseAuthUser {
  uid: string;
  phoneNumber: string | null;
  displayName?: string | null;
}

export interface FirebaseAuthInstance {
  currentUser: FirebaseAuthUser | null;
  signInWithPhoneNumber(phoneNumber: string): Promise<FirebaseConfirmationResult>;
  signOut(): Promise<void>;
}

/** `auth` as exported by @react-native-firebase/auth — callable, returns the instance. */
export type FirebaseAuthSdk = () => FirebaseAuthInstance;

export function createFirebaseAuthProvider(sdk: FirebaseAuthSdk): AuthProvider {
  // Confirmation handles are held in memory only, keyed by verificationId.
  // Nothing about them is persisted.
  const pending = new Map<string, FirebaseConfirmationResult>();

  return {
    id: "firebase",

    isAvailable() {
      try {
        return typeof sdk === "function" && !!sdk();
      } catch {
        return false;
      }
    },

    requiresVerification() {
      return true;
    },

    async signInWithPhone(request: PhoneSignInRequest): Promise<SignInResult> {
      const confirmation = await sdk().signInWithPhoneNumber(request.phoneNumber);
      pending.set(confirmation.verificationId, confirmation);
      return {
        status: "verification-required",
        verificationId: confirmation.verificationId,
        phoneNumber: request.phoneNumber,
      };
    },

    async confirmCode(
      verificationId: string,
      code: string,
      name?: string
    ): Promise<AuthIdentity> {
      const confirmation = pending.get(verificationId);
      if (!confirmation) {
        throw new Error("This verification has expired. Request a new code.");
      }

      const credential = await confirmation.confirm(code);
      const user = credential?.user ?? sdk().currentUser;
      if (!user) {
        throw new Error("Could not verify that code. Please try again.");
      }

      pending.delete(verificationId);

      return {
        providerUid: user.uid,
        phoneNumber: user.phoneNumber ?? "",
        name: name ?? user.displayName ?? undefined,
      };
    },

    async signOut(): Promise<void> {
      pending.clear();
      await sdk().signOut();
    },
  };
}
