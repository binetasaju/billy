// ---------------------------------------------------------------------------
// services/auth/firebaseSdkContract.check.ts
//
// Compile-time proof that the installed @react-native-firebase/auth actually
// satisfies the FirebaseAuthModule contract initFirebaseAuth() requires.
//
// Nothing imports this file, so Metro never bundles it and no native module is
// touched at runtime — but `tsc --noEmit` checks it, so if a future SDK upgrade
// renames or reshapes getAuth / signInWithPhoneNumber / signOut, the type check
// fails here instead of at runtime on a device.
// ---------------------------------------------------------------------------

import type * as RNFirebaseAuth from "@react-native-firebase/auth";
import type { FirebaseAuthModule } from "./initFirebaseAuth";
import type { FirebaseConfirmationResult } from "./firebaseAuthProvider";

/** The real module must be usable where the adapter expects its contract. */
declare const realModule: typeof RNFirebaseAuth;
export const _moduleSatisfiesContract: FirebaseAuthModule = realModule;

/**
 * The real ConfirmationResult must expose what the provider reads from it:
 * `verificationId` and `confirm(code)`.
 */
declare const realConfirmation: Awaited<
  ReturnType<typeof RNFirebaseAuth.signInWithPhoneNumber>
>;
export const _confirmationShape: Pick<
  FirebaseConfirmationResult,
  "verificationId"
> = { verificationId: realConfirmation.verificationId };

export const _confirmIsCallable: (code: string) => Promise<unknown> = (code) =>
  realConfirmation.confirm(code);
