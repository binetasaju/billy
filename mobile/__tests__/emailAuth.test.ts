jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// The native Google picker: the test sets which account "was picked".
let mockPickedGoogleEmail: string | null = null;
jest.mock("../services/auth/googleSignIn", () => ({
  getGoogleIdToken: async () => (mockPickedGoogleEmail ? `google:${mockPickedGoogleEmail}` : null),
  googleSignOut: async () => {},
  webClientIdFrom: jest.requireActual("../services/auth/googleSignIn").webClientIdFrom,
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { authStore } from "../services/authStore";
import { registerAuthProvider, resetAuthProvider } from "../services/auth";
import { createFirebaseAuthProvider } from "../services/auth/firebaseAuthProvider";
import type { FirebaseAuthInstance, FirebaseAuthUser } from "../services/auth/firebaseAuthProvider";

/** A tiny in-memory stand-in for Firebase email auth. */
function fakeFirebase() {
  const accounts = new Map<string, { password: string; user: FirebaseAuthUser }>();
  const sent: string[] = [];
  let current: FirebaseAuthUser | null = null;
  let n = 0;

  const instance: FirebaseAuthInstance = {
    get currentUser() { return current; },
    signInWithPhoneNumber: async () => { throw new Error("not used"); },
    signOut: async () => { current = null; },
    createUserWithEmailAndPassword: async (email, password) => {
      if (accounts.has(email)) throw Object.assign(new Error("in use"), { code: "auth/email-already-in-use" });
      const user: FirebaseAuthUser = { uid: `fb_${++n}`, phoneNumber: null, email, emailVerified: false };
      accounts.set(email, { password, user });
      current = user;
      return { user };
    },
    signInWithEmailAndPassword: async (email, password) => {
      const a = accounts.get(email);
      if (!a || a.password !== password) throw Object.assign(new Error("bad"), { code: "auth/invalid-credential" });
      current = a.user;
      return { user: a.user };
    },
    sendEmailVerification: async (user) => { sent.push(user.email ?? ""); },
    sendPasswordResetEmail: async (email) => { sent.push(`reset:${email}`); },
    reload: async () => {},
    refreshToken: async () => {},
    updateProfile: async (user, p) => { user.displayName = p.displayName ?? null; },
    signInWithGoogleIdToken: async (idToken) => {
      const email = idToken.replace(/^google:/, "");
      const existing = accounts.get(email);
      const user: FirebaseAuthUser = existing?.user ?? {
        uid: `fb_${++n}`, phoneNumber: null, email, emailVerified: true, displayName: "Google Asha",
      };
      user.emailVerified = true; // Google accounts are always verified
      if (!existing) accounts.set(email, { password: "", user });
      current = user;
      return { user };
    },
    reauthenticateWithPassword: async (user, password) => {
      if (accounts.get(user.email ?? "")?.password !== password) {
        throw Object.assign(new Error("bad"), { code: "auth/invalid-credential" });
      }
    },
    reauthenticateWithGoogleIdToken: async (user, idToken) => {
      if (idToken.replace(/^google:/, "") !== user.email) {
        throw Object.assign(new Error("mismatch"), { code: "auth/user-mismatch" });
      }
    },
    deleteUser: async (user) => {
      accounts.delete(user.email ?? "");
      if (current === user) current = null;
    },
  };

  return {
    instance,
    sent,
    verify: (email: string) => { accounts.get(email)!.user.emailVerified = true; },
  };
}

describe("email sign-in", () => {
  let fb: ReturnType<typeof fakeFirebase>;

  beforeEach(async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await AsyncStorage.clear();
    fb = fakeFirebase();
    expect(registerAuthProvider(createFirebaseAuthProvider(() => fb.instance))).toBe(true);
    await authStore.restore();
  });

  afterEach(() => {
    resetAuthProvider();
    jest.restoreAllMocks();
  });

  it("sign-up sends a verification email and does not open a session yet", async () => {
    const result = await authStore.signUpWithEmail("Asha", "9876543210", "asha@example.com", "secret1");
    expect(result.status).toBe("email-verification-required");
    expect(fb.sent).toEqual(["asha@example.com"]);
    expect(authStore.get().user).toBeNull();
  });

  it("opens the session after verification, keeping the name and phone from sign-up", async () => {
    await authStore.signUpWithEmail("Asha", "9876543210", "asha@example.com", "secret1");
    expect(await authStore.confirmEmailVerified()).toBeNull(); // not clicked yet

    fb.verify("asha@example.com");
    const user = await authStore.confirmEmailVerified();
    expect(user).not.toBeNull();
    expect(user!.name).toBe("Asha");
    expect(user!.email).toBe("asha@example.com");
    expect(user!.phoneNumber).toBe("+919876543210");
    expect(authStore.get().user?.uid).toBe(user!.uid);
  });

  it("an unverified account cannot sign in", async () => {
    await authStore.signUpWithEmail("Asha", "9876543210", "asha@example.com", "secret1");
    await authStore.cancelEmailSignIn();
    const result = await authStore.signInWithEmail("asha@example.com", "secret1");
    expect(result.status).toBe("email-verification-required");
    expect(authStore.get().user).toBeNull();
  });

  it("signing in again later rejoins the same Billy uid (bills stay attached)", async () => {
    await authStore.signUpWithEmail("Asha", "9876543210", "asha@example.com", "secret1");
    fb.verify("asha@example.com");
    const first = await authStore.confirmEmailVerified();
    await authStore.logout();

    const result = await authStore.signInWithEmail("asha@example.com", "secret1");
    expect(result.status).toBe("signed-in");
    expect(authStore.get().user?.uid).toBe(first!.uid);
    expect(authStore.get().user?.phoneNumber).toBe("+919876543210");
  });

  it("a wrong password is rejected", async () => {
    await authStore.signUpWithEmail("Asha", "9876543210", "asha@example.com", "secret1");
    fb.verify("asha@example.com");
    await expect(authStore.signInWithEmail("asha@example.com", "nope")).rejects.toMatchObject({
      code: "auth/invalid-credential",
    });
  });

  it("sends a password reset email", async () => {
    await authStore.sendPasswordReset(" asha@example.com ");
    expect(fb.sent).toContain("reset:asha@example.com");
  });
});

describe("Google sign-in", () => {
  let fb: ReturnType<typeof fakeFirebase>;

  beforeEach(async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await AsyncStorage.clear();
    fb = fakeFirebase();
    registerAuthProvider(createFirebaseAuthProvider(() => fb.instance));
    await authStore.restore();
    mockPickedGoogleEmail = null;
  });

  afterEach(() => {
    resetAuthProvider();
    jest.restoreAllMocks();
  });

  it("does nothing when the account picker is closed", async () => {
    expect(await authStore.signInWithGoogle()).toBeNull();
    expect(authStore.get().user).toBeNull();
  });

  it("opens a session with the Google account's name and email (no phone yet)", async () => {
    mockPickedGoogleEmail = "asha@gmail.com";
    const user = await authStore.signInWithGoogle();
    expect(user?.email).toBe("asha@gmail.com");
    expect(user?.name).toBe("Google Asha");
    expect(user?.phoneNumber).toBe("");
  });

  it("joins the existing Billy account that used the same email", async () => {
    await authStore.signUpWithEmail("Asha", "9876543210", "asha@gmail.com", "secret1");
    fb.verify("asha@gmail.com");
    const emailUser = await authStore.confirmEmailVerified();
    await authStore.logout();

    mockPickedGoogleEmail = "asha@gmail.com";
    const googleUser = await authStore.signInWithGoogle();
    expect(googleUser?.uid).toBe(emailUser!.uid);
    expect(googleUser?.phoneNumber).toBe("+919876543210");
  });
});

describe("webClientIdFrom", () => {
  const { webClientIdFrom } = jest.requireActual("../services/auth/googleSignIn");

  it("finds the Web (type 3) client ID", () => {
    const config = {
      client: [{
        oauth_client: [
          { client_id: "android-id", client_type: 1 },
          { client_id: "web-id.apps.googleusercontent.com", client_type: 3 },
        ],
      }],
    };
    expect(webClientIdFrom(config)).toBe("web-id.apps.googleusercontent.com");
  });

  it("returns null before Google is enabled in Firebase", () => {
    expect(webClientIdFrom({ client: [{ oauth_client: [] }] })).toBeNull();
  });
});

describe("profile photo", () => {
  const { photoOf } = jest.requireActual("../services/auth/firebaseAuthProvider");

  it("uses the account photo when Firebase has one", () => {
    expect(photoOf({ uid: "u", phoneNumber: null, photoURL: "https://a/photo.jpg" })).toBe("https://a/photo.jpg");
  });

  it("finds the Google photo when Google was linked to an email account later", () => {
    expect(
      photoOf({
        uid: "u",
        phoneNumber: null,
        photoURL: null,
        providerData: [{ providerId: "password", photoURL: null }, { providerId: "google.com", photoURL: "https://g/me.jpg" }],
      })
    ).toBe("https://g/me.jpg");
  });

  it("is undefined when there is no photo anywhere", () => {
    expect(photoOf({ uid: "u", phoneNumber: null, providerData: [{ providerId: "password" }] })).toBeUndefined();
  });

  it("fills a missing photo on app start from the restored Firebase account", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    await AsyncStorage.clear();
    const fb = fakeFirebase();
    registerAuthProvider(createFirebaseAuthProvider(() => fb.instance));
    // A saved session from before photos were kept…
    await AsyncStorage.setItem(
      "@billy_auth_user",
      JSON.stringify({ uid: "u1", name: "Asha", phoneNumber: "+919876543210", email: "asha@gmail.com", authProvider: "firebase" })
    );
    // …and Firebase has restored the same account, with Google linked.
    mockPickedGoogleEmail = "asha@gmail.com";
    const { user } = await fb.instance.signInWithGoogleIdToken("google:asha@gmail.com");
    user.providerData = [{ providerId: "google.com", photoURL: "https://g/asha.jpg" }];

    await authStore.restore();
    await new Promise((r) => setTimeout(r, 10));
    expect(authStore.get().user?.photoUrl).toBe("https://g/asha.jpg");
    expect(authStore.get().user?.uid).toBe("u1");
    resetAuthProvider();
  });
});
