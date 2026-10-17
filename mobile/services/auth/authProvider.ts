// ---------------------------------------------------------------------------
// services/auth/authProvider.ts
//
// The seam between Billy and whatever actually authenticates a user.
//
// authStore owns session state and persistence; a provider owns only the
// mechanics of proving who someone is. Swapping local → Firebase changes the
// registered provider and nothing else, so no screen imports an auth SDK.
//
// Phone number is the sign-in credential because Billy's future contact
// matching is phone-based: phone → Billy user → uid → their own UPI ID.
// ---------------------------------------------------------------------------

export type AuthProviderId = "local" | "firebase";

/** What a provider returns about an authenticated person. */
export interface AuthIdentity {
  /**
   * The provider's own stable id for this person. For Firebase this is the
   * Firebase Auth UID. NOTE: this is not automatically Billy's `User.uid` —
   * see authStore's migration rules, which never rewrite an existing uid.
   */
  providerUid: string;
  /** E.164 phone number that was verified / supplied. */
  phoneNumber: string;
  /** Display name, when the provider knows one. */
  name?: string;
}

/** A sign-in that completed immediately (local dev). */
export interface SignedInResult {
  status: "signed-in";
  identity: AuthIdentity;
}

/**
 * A sign-in awaiting an SMS code. `verificationId` is opaque and is passed
 * back to confirmCode() — Billy never inspects or stores it.
 */
export interface VerificationRequiredResult {
  status: "verification-required";
  verificationId: string;
  phoneNumber: string;
}

export type SignInResult = SignedInResult | VerificationRequiredResult;

export interface PhoneSignInRequest {
  /** Raw phone input; the provider receives it already normalized to E.164. */
  phoneNumber: string;
  /** Display name collected by the sign-in screen, when the flow asks for one. */
  name?: string;
}

export interface AuthProvider {
  readonly id: AuthProviderId;

  /**
   * True when this provider can actually run — for Firebase, that means the
   * SDK is installed AND the native config is present. A provider that is not
   * available is never selected.
   */
  isAvailable(): boolean;

  /** Whether sign-in needs a second (code confirmation) step. */
  requiresVerification(): boolean;

  /** Begin sign-in. Local completes immediately; Firebase sends an SMS. */
  signInWithPhone(request: PhoneSignInRequest): Promise<SignInResult>;

  /** Complete an SMS-code sign-in. Throws when the code is wrong/expired. */
  confirmCode(verificationId: string, code: string, name?: string): Promise<AuthIdentity>;

  /** Provider-side sign-out. Clearing Billy's own session is authStore's job. */
  signOut(): Promise<void>;
}
