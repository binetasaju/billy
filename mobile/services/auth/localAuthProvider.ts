// ---------------------------------------------------------------------------
// services/auth/localAuthProvider.ts
//
// The development identity Billy has always used: a name + phone typed on the
// login screen, with a locally generated uid. No SMS, no network.
//
// This is preserved exactly as-is so existing local sessions and every record
// that references their uid keep working. It is the default provider until a
// real one is registered.
// ---------------------------------------------------------------------------

import { nanoid } from "../../utils/nanoid";
import type {
  AuthProvider,
  AuthIdentity,
  PhoneSignInRequest,
  SignInResult,
  EmailSignUpRequest,
  EmailSignInResult,
} from "./authProvider";

/** Same shape the login screen has always produced: "user_<random>". */
export function generateLocalUid(): string {
  return `user_${nanoid(16)}`;
}

export const localAuthProvider: AuthProvider = {
  id: "local",

  isAvailable() {
    return true;
  },

  requiresVerification() {
    return false;
  },

  async signInWithPhone(request: PhoneSignInRequest): Promise<SignInResult> {
    return {
      status: "signed-in",
      identity: {
        providerUid: generateLocalUid(),
        phoneNumber: request.phoneNumber,
        name: request.name,
      },
    };
  },

  // Local (offline dev) sign-in has no server: email accounts open immediately
  // with no password check and no verification email.
  async signUpWithEmail(request: EmailSignUpRequest): Promise<EmailSignInResult> {
    return {
      status: "signed-in",
      identity: {
        providerUid: generateLocalUid(),
        phoneNumber: request.phoneNumber,
        email: request.email,
        name: request.name,
      },
    };
  },

  async signInWithEmail(email: string): Promise<EmailSignInResult> {
    return {
      status: "signed-in",
      identity: { providerUid: generateLocalUid(), phoneNumber: "", email },
    };
  },

  async checkEmailVerified(): Promise<AuthIdentity | null> {
    return null;
  },

  async resendVerificationEmail(): Promise<void> {},

  async sendPasswordReset(): Promise<void> {},

  async currentProfile() {
    return null;
  },

  async signInWithGoogleIdToken(): Promise<AuthIdentity> {
    throw new Error("Google sign-in isn't available in this build.");
  },

  async confirmCode(): Promise<AuthIdentity> {
    // Local sign-in never reaches a code step.
    throw new Error("Local auth does not use verification codes.");
  },

  async signOut(): Promise<void> {
    // Nothing provider-side to clear; authStore drops the session.
  },
};
