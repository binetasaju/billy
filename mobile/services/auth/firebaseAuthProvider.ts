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
  EmailSignUpRequest,
  EmailSignInResult,
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
  email?: string | null;
  emailVerified?: boolean;
  photoURL?: string | null;
  /** One entry per linked sign-in method (password, google.com, …). */
  providerData?: { providerId?: string; photoURL?: string | null }[];
}

/**
 * The account photo. When Google was linked to an existing email account,
 * Firebase leaves the top-level photoURL empty and keeps the picture on the
 * Google provider entry — so look there too.
 */
export function photoOf(user: FirebaseAuthUser): string | undefined {
  return (
    user.photoURL ||
    user.providerData?.find((p) => p?.providerId === "google.com" && p.photoURL)?.photoURL ||
    user.providerData?.find((p) => p?.photoURL)?.photoURL ||
    undefined
  );
}

export interface FirebaseAuthInstance {
  currentUser: FirebaseAuthUser | null;
  signInWithPhoneNumber(phoneNumber: string): Promise<FirebaseConfirmationResult>;
  signOut(): Promise<void>;
  // Email + password
  createUserWithEmailAndPassword(email: string, password: string): Promise<{ user: FirebaseAuthUser }>;
  signInWithEmailAndPassword(email: string, password: string): Promise<{ user: FirebaseAuthUser }>;
  sendEmailVerification(user: FirebaseAuthUser): Promise<void>;
  sendPasswordResetEmail(email: string): Promise<void>;
  reload(user: FirebaseAuthUser): Promise<void>;
  updateProfile(user: FirebaseAuthUser, profile: { displayName?: string | null }): Promise<void>;
  // Google
  signInWithGoogleIdToken(idToken: string): Promise<{ user: FirebaseAuthUser }>;
  /** Fetch a fresh sign-in token (so the server sees e.g. email_verified). */
  refreshToken(user: FirebaseAuthUser): Promise<void>;
  // Account deletion
  reauthenticateWithPassword(user: FirebaseAuthUser, password: string): Promise<void>;
  reauthenticateWithGoogleIdToken(user: FirebaseAuthUser, idToken: string): Promise<void>;
  deleteUser(user: FirebaseAuthUser): Promise<void>;
  idToken(user: FirebaseAuthUser): Promise<string>;
}

function emailIdentity(user: FirebaseAuthUser): AuthIdentity {
  return {
    providerUid: user.uid,
    phoneNumber: user.phoneNumber ?? "",
    email: user.email ?? undefined,
    name: user.displayName ?? undefined,
    photoUrl: photoOf(user),
  };
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

    async signUpWithEmail(request: EmailSignUpRequest): Promise<EmailSignInResult> {
      const auth = sdk();
      const { user } = await auth.createUserWithEmailAndPassword(request.email, request.password);
      if (request.name) {
        try {
          await auth.updateProfile(user, { displayName: request.name });
        } catch {
          // The name is also kept locally — a failed profile update is not fatal.
        }
      }
      await auth.sendEmailVerification(user);
      return { status: "email-verification-required", email: user.email ?? request.email };
    },

    async signInWithEmail(email: string, password: string): Promise<EmailSignInResult> {
      const { user } = await sdk().signInWithEmailAndPassword(email, password);
      if (!user.emailVerified) {
        // Stay signed in to Firebase so "I've verified" / "Resend" can work.
        return { status: "email-verification-required", email: user.email ?? email };
      }
      return { status: "signed-in", identity: emailIdentity(user) };
    },

    async checkEmailVerified(): Promise<AuthIdentity | null> {
      const auth = sdk();
      const user = auth.currentUser;
      if (!user) return null;
      await auth.reload(user);
      const fresh = auth.currentUser ?? user;
      if (!fresh.emailVerified) return null;
      try {
        await auth.refreshToken(fresh); // cloud rules need the verified flag in the token
      } catch {
        // Not fatal — the token refreshes by itself within the hour.
      }
      return emailIdentity(fresh);
    },

    async resendVerificationEmail(): Promise<void> {
      const auth = sdk();
      if (!auth.currentUser) throw new Error("Please sign in again to resend the email.");
      await auth.sendEmailVerification(auth.currentUser);
    },

    async sendPasswordReset(email: string): Promise<void> {
      await sdk().sendPasswordResetEmail(email);
    },

    async currentProfile() {
      // Firebase restores the signed-in user shortly after start-up; give it
      // a moment before deciding there is none.
      for (let i = 0; i < 10; i++) {
        const user = sdk().currentUser;
        if (user) return { photoUrl: photoOf(user), email: user.email ?? undefined };
        await new Promise((r) => setTimeout(r, 300));
      }
      return null;
    },

    async signInWithGoogleIdToken(idToken: string): Promise<AuthIdentity> {
      const { user } = await sdk().signInWithGoogleIdToken(idToken);
      return emailIdentity(user);
    },

    async signOut(): Promise<void> {
      pending.clear();
      await sdk().signOut();
    },

    async reauthenticate(proof) {
      const auth = sdk();
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again first.");
      if ("password" in proof) await auth.reauthenticateWithPassword(user, proof.password);
      else await auth.reauthenticateWithGoogleIdToken(user, proof.googleIdToken);
    },

    async getIdToken() {
      const user = sdk().currentUser;
      return user ? sdk().idToken(user) : null;
    },

    signInMethods() {
      const user = sdk().currentUser;
      const ids = (user?.providerData ?? []).map((p) => p?.providerId);
      const methods: ("password" | "google")[] = [];
      if (ids.includes("password")) methods.push("password");
      if (ids.includes("google.com")) methods.push("google");
      return methods;
    },

    async deleteAccount() {
      const auth = sdk();
      const user = auth.currentUser;
      if (!user) throw new Error("Please sign in again first.");
      await auth.deleteUser(user);
    },
  };
}
