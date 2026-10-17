// ---------------------------------------------------------------------------
// services/userDirectory.ts
//
// The seam for the resolution Billy will eventually need:
//
//     phone number → Billy user → User.uid → that user's own UPI ID
//
// This exists so participants, groups and payment can later ask "is this
// contact on Billy?" through one interface instead of each growing its own
// lookup. It is intentionally NOT wired into any screen yet.
//
// The default implementation resolves nothing. That is the honest answer on a
// device with no backend: this app cannot know another person's UPI ID, and a
// local phone→UPI table would just be the payer typing it in by another name.
// Only a real backend (the person's own Billy account) can answer this, which
// is why the UPI ID stays editable solely from its owner's profile.
// ---------------------------------------------------------------------------

/** The subset of another person's account that Billy would ever need. */
export interface DirectoryUser {
  uid: string;
  phoneNumber: string;
  name?: string;
  /** Set by that person on their own profile — never by whoever is asking. */
  upiId?: string;
}

export interface UserDirectory {
  /**
   * Look up a Billy account by E.164 phone number.
   * Resolves to null when the number has no account (or when no backend is
   * configured, which is the case today).
   */
  resolveByPhone(phoneNumber: string): Promise<DirectoryUser | null>;
}

/**
 * No-op directory: no backend, so nobody resolves. Never guesses, never
 * fabricates a UPI ID, and never caches one locally.
 */
export const nullUserDirectory: UserDirectory = {
  async resolveByPhone(): Promise<DirectoryUser | null> {
    return null;
  },
};

let _directory: UserDirectory = nullUserDirectory;

/** Swap in a backed implementation once one exists (Firestore, API, …). */
export function registerUserDirectory(directory: UserDirectory): void {
  _directory = directory;
}

export function getUserDirectory(): UserDirectory {
  return _directory;
}

/** Test/reset hook. */
export function resetUserDirectory(): void {
  _directory = nullUserDirectory;
}
