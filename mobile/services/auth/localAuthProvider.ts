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

  async confirmCode(): Promise<AuthIdentity> {
    // Local sign-in never reaches a code step.
    throw new Error("Local auth does not use verification codes.");
  },

  async signOut(): Promise<void> {
    // Nothing provider-side to clear; authStore drops the session.
  },
};
