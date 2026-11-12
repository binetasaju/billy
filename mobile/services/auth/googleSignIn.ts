// ---------------------------------------------------------------------------
// services/auth/googleSignIn.ts — "Continue with Google" (free on Firebase)
//
// Gets a Google ID token from the native Google account picker; authStore then
// hands it to Firebase (signInWithGoogleIdToken). The native library is
// require()d lazily so a build made before it was installed shows a clear
// message instead of crashing at start-up.
//
// The Web client ID comes from google-services.json — it appears there only
// after Google is enabled in Firebase → Authentication → Sign-in method and the
// file is downloaded again.
// ---------------------------------------------------------------------------

/** The Web (type 3) OAuth client ID in a google-services.json, if present. */
export function webClientIdFrom(config: any): string | null {
  for (const client of config?.client ?? []) {
    const candidates = [
      ...(client?.oauth_client ?? []),
      ...(client?.services?.appinvite_service?.other_platform_oauth_client ?? []),
    ];
    const web = candidates.find((o: any) => o?.client_type === 3 && o?.client_id);
    if (web) return web.client_id as string;
  }
  return null;
}

function loadWebClientId(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return webClientIdFrom(require("../../google-services.json"));
  } catch {
    return null;
  }
}

function loadLibrary(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@react-native-google-signin/google-signin");
  } catch {
    throw new Error("Google sign-in needs the app to be rebuilt. Please update Billy.");
  }
}

let configured = false;

/** Configure the Google library once (Web client ID from google-services.json). */
export function ensureGoogleConfigured(): void {
  if (configured) return;
  const webClientId = loadWebClientId();
  if (!webClientId) {
    throw new Error("Google sign-in isn't switched on for Billy yet.");
  }
  loadLibrary().GoogleSignin.configure({ webClientId });
  configured = true;
}

/**
 * Show the Google account picker. Returns the ID token, or null when the
 * person closes the picker.
 */
export async function getGoogleIdToken(): Promise<string | null> {
  const lib = loadLibrary();
  const { GoogleSignin, statusCodes, isErrorWithCode, isSuccessResponse } = lib;

  ensureGoogleConfigured();

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Forget the last chosen account so the picker always appears (with
    // "Add another account") instead of signing straight into the old one.
    try {
      await GoogleSignin.signOut();
    } catch {
      // Nothing remembered — fine.
    }
    const response = await GoogleSignin.signIn();
    if (!isSuccessResponse(response)) return null; // picker closed
    const token = response.data?.idToken;
    if (!token) throw new Error("Google didn't return a sign-in token. Please try again.");
    return token;
  } catch (e: any) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return null;
      if (e.code === statusCodes.IN_PROGRESS) return null;
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new Error("Google Play services is missing or out of date on this phone.");
      }
      // DEVELOPER_ERROR (10): the app's SHA-1 or the Web client ID doesn't match Firebase.
      if (String(e.code) === "10" || /DEVELOPER_ERROR/i.test(String(e.code))) {
        throw new Error("Google sign-in isn't set up correctly for this build of Billy.");
      }
    }
    throw e;
  }
}

/** Forget the chosen Google account so the picker shows next time. */
export async function googleSignOut(): Promise<void> {
  try {
    await loadLibrary().GoogleSignin.signOut();
  } catch {
    // Not signed in with Google, or library missing — nothing to clear.
  }
}
