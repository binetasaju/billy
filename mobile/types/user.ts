// ---------------------------------------------------------------------------
// types/user.ts
//
// Billy User model.
//
// Firebase-ready: uid maps directly to Firebase Auth UID.
// When Firebase is added, mapFirebaseUserToBillyUser() will convert
// a FirebaseAuthTypes.User into this interface.
// ---------------------------------------------------------------------------

export interface User {
  /** Firebase Auth UID — globally unique, immutable. */
  uid: string;

  /** Display name set during onboarding. */
  name: string;

  /**
   * E.164 normalized phone number — the primary identity key.
   * Example: "+919876543210"
   * Firebase Auth uses this as the login credential in the OTP flow.
   */
  phoneNumber: string;

  /** UPI ID for future payment integrations. */
  upiId?: string;

  /** Profile photo URL — Firebase Storage or Google Photos. */
  photoUrl?: string;

  /** ISO 8601 timestamp of account creation. */
  createdAt?: string;

  /**
   * Which provider authenticated this session. Absent on sessions created
   * before providers existed — those are treated as "local" and left alone.
   */
  authProvider?: "local" | "firebase";

  /**
   * Firebase Auth UID, when this person has verified a phone number.
   *
   * Deliberately separate from `uid`: `uid` is Billy's identity and is
   * referenced by every stored BillGroup participant, payerId, settlement and
   * ContactGroup member. Rewriting it would orphan that history, so linking a
   * Firebase identity to an existing local account records the Firebase UID
   * here and leaves `uid` untouched. New accounts get uid === firebaseUid.
   */
  firebaseUid?: string;
}
