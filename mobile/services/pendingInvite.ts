// ---------------------------------------------------------------------------
// services/pendingInvite.ts — remember a bill link opened before signing in
//
// A friend taps a shared bill link without a Billy account → they go through
// sign-up (maybe closing the app to verify their email) → then land on the
// "Join this bill?" screen. The link is kept on the phone until it's used.
// ---------------------------------------------------------------------------
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@billy_pending_invite";
let cached: string | null | undefined;

/** Only our own bill paths are ever kept (e.g. "/bill/abc?c=xyz"). */
const isBillPath = (p: string) => /^\/bill\/[^/?#]+(\?c=[A-Za-z0-9_-]+)?$/.test(p);

export async function savePendingInvite(path: string): Promise<void> {
  if (!isBillPath(path)) return;
  cached = path;
  try {
    await AsyncStorage.setItem(KEY, path);
  } catch {
    // Kept in memory for this session at least.
  }
}

/** Returns the saved link once, then forgets it. */
export async function takePendingInvite(): Promise<string | null> {
  let path = cached;
  if (path === undefined) {
    try {
      path = await AsyncStorage.getItem(KEY);
    } catch {
      path = null;
    }
  }
  cached = null;
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing to clean up.
  }
  return path && isBillPath(path) ? path : null;
}
