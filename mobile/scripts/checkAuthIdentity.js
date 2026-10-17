#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/checkAuthIdentity.js
//
// Regression check for the one invariant Billy cannot afford to break:
//
//   A person who already has bills on this device keeps the SAME User.uid
//   after Firebase phone auth — and nothing rewrites the ids already stored
//   inside those bills.
//
// There is no test runner in this project, so this script is self-contained:
// it compiles services/authStore.ts (and its import graph) to CommonJS with
// the local tsc, swaps in an in-memory AsyncStorage and a fake Firebase
// provider, then drives the real authStore through the real sign-in paths.
// Nothing here re-implements store logic — a regression in authStore.ts fails
// this check.
//
//   node scripts/checkAuthIdentity.js
// ---------------------------------------------------------------------------

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const Module = require("module");

const MOBILE_ROOT = path.resolve(__dirname, "..");

// ── The device we are simulating ────────────────────────────────────────────
// The real legacy account: a pre-provider local session that owns 12 bills.
const LEGACY_UID = "mock_1789821915376_vnrdork";
const LEGACY_PHONE = "+919876543210";
const LEGACY_NAME = "Bineta";
const FIREBASE_UID = "kJ8xQ2fake0FirebaseUid9zPq";
const BILL_COUNT = 12;

// ── Compile the real store ──────────────────────────────────────────────────
function compileStore() {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "billy-authcheck-"));
  execFileSync(
    process.execPath,
    [
      path.join(MOBILE_ROOT, "node_modules", "typescript", "bin", "tsc"),
      path.join(MOBILE_ROOT, "services", "authStore.ts"),
      "--outDir", outDir,
      "--module", "commonjs",
      "--target", "es2020",
      "--moduleResolution", "node",
      "--esModuleInterop",
      "--skipLibCheck",
    ],
    { cwd: MOBILE_ROOT, stdio: ["ignore", "pipe", "inherit"] }
  );
  return outDir;
}

// ── In-memory AsyncStorage, injected before the store is required ───────────
function installFakeAsyncStorage() {
  const store = new Map();
  const api = {
    getItem: async (k) => (store.has(k) ? store.get(k) : null),
    setItem: async (k, v) => void store.set(k, v),
    removeItem: async (k) => void store.delete(k),
    clear: async () => store.clear(),
    __raw: store,
  };

  const id = "@react-native-async-storage/async-storage";
  const fake = new Module(id, null);
  fake.filename = id;
  fake.loaded = true;
  fake.exports = { __esModule: true, default: api };
  require.cache[id] = fake;

  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === id) return id;
    return originalResolve.call(this, request, ...rest);
  };

  return api;
}

// ── A Firebase provider that verifies without a network or a device ─────────
function fakeFirebaseProvider(uid, phoneNumber) {
  return {
    id: "firebase",
    isAvailable: () => true,
    requiresVerification: () => true,
    async signInWithPhone() {
      return {
        status: "verification-required",
        verificationId: "verify-1",
        phoneNumber,
      };
    },
    async confirmCode(verificationId, code, name) {
      assert.strictEqual(verificationId, "verify-1", "unexpected verificationId");
      return { providerUid: uid, phoneNumber, name };
    },
    async signOut() {},
  };
}

// ── Stored-bill fixtures ────────────────────────────────────────────────────
// Shaped like real BillGroups: the owner's uid appears as createdBy, as a
// participant id (isCurrentUser) and on both sides of settlements.
function makeBills(ownerUid) {
  return Array.from({ length: BILL_COUNT }, (_, i) => ({
    id: `bill_${i + 1}`,
    title: `Dinner ${i + 1}`,
    createdBy: ownerUid,
    participants: [
      { id: ownerUid, name: LEGACY_NAME, isCurrentUser: true, itemIds: [], color: "#1D4ED8" },
      { id: `friend_${i}`, name: `Friend ${i}`, isCurrentUser: false, itemIds: [], color: "#059669" },
    ],
    settlements: [
      {
        fromUserId: `friend_${i}`,
        toUserId: ownerUid,
        amount: 100 + i,
        status: i % 2 === 0 ? "pending" : "paid",
      },
    ],
    totalAmount: 200 + i,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

/** How many stored bills still resolve to the signed-in user. */
function billsOwnedBy(bills, uid) {
  return bills.filter(
    (b) =>
      b.createdBy === uid &&
      b.participants.some((p) => p.id === uid && p.isCurrentUser) &&
      b.settlements.some((s) => s.fromUserId === uid || s.toUserId === uid)
  ).length;
}

/** The viewer's net across every outstanding row — group-balance readability. */
function viewerNet(bills, uid) {
  let net = 0;
  for (const b of bills) {
    for (const s of b.settlements) {
      if (s.status === "paid") continue;
      if (s.toUserId === uid) net += s.amount;
      if (s.fromUserId === uid) net -= s.amount;
    }
  }
  return Math.round(net * 100) / 100;
}

// ── Scenarios ───────────────────────────────────────────────────────────────
async function main() {
  const outDir = compileStore();
  const storage = installFakeAsyncStorage();

  const { authStore } = require(path.join(outDir, "services", "authStore.js"));
  const { registerAuthProvider, resetAuthProvider } = require(
    path.join(outDir, "services", "auth", "index.js")
  );

  const SESSION_KEY = "@billy_auth_user";
  const GROUPS_KEY = "@billy_groups";

  const legacySession = {
    uid: LEGACY_UID,
    name: LEGACY_NAME,
    phoneNumber: LEGACY_PHONE,
    upiId: "bineta@upi",
    createdAt: "2025-11-02T09:15:00.000Z",
    // No authProvider — written before providers existed.
  };

  const bills = makeBills(LEGACY_UID);
  const billsBefore = JSON.stringify(bills);
  const expectedNet = viewerNet(bills, LEGACY_UID);

  const seedDevice = async () => {
    await storage.clear();
    await storage.setItem(SESSION_KEY, JSON.stringify(legacySession));
    await storage.setItem(GROUPS_KEY, billsBefore);
    resetAuthProvider();
  };

  const readBills = async () => JSON.parse(await storage.getItem(GROUPS_KEY));

  const results = [];
  const scenario = async (name, fn) => {
    await seedDevice();
    await fn();
    results.push(name);
    console.log(`  ✓ ${name}`);
  };

  console.log("\nauth identity regression check\n");

  // 1 — Legacy account links Firebase WITHOUT logging out first.
  await scenario("legacy session links Firebase in place; uid preserved", async () => {
    await authStore.restore();
    assert.strictEqual(authStore.get().user.uid, LEGACY_UID);
    assert.strictEqual(authStore.get().user.authProvider, "local");

    registerAuthProvider(fakeFirebaseProvider(FIREBASE_UID, LEGACY_PHONE));
    const start = await authStore.signInWithPhone(LEGACY_NAME, LEGACY_PHONE);
    assert.strictEqual(start.status, "verification-required");
    const user = await authStore.confirmPhoneSignIn(start.verificationId, "123456", LEGACY_NAME);

    assert.strictEqual(user.uid, LEGACY_UID, "canonical uid was replaced");
    assert.strictEqual(user.firebaseUid, FIREBASE_UID, "firebaseUid not recorded");
    assert.strictEqual(user.authProvider, "firebase");
    assert.strictEqual(user.upiId, "bineta@upi", "profile fields lost on link");

    const persisted = JSON.parse(await storage.getItem(SESSION_KEY));
    assert.strictEqual(persisted.uid, LEGACY_UID, "persisted uid was replaced");
    assert.strictEqual(persisted.firebaseUid, FIREBASE_UID);

    assert.strictEqual(billsOwnedBy(await readBills(), user.uid), BILL_COUNT);
    assert.strictEqual(viewerNet(await readBills(), user.uid), expectedNet);
    assert.strictEqual(await storage.getItem(GROUPS_KEY), billsBefore, "stored bills mutated");
  });

  // 2 — The real test path: log out, then sign in through Firebase OTP.
  await scenario("logout → Firebase sign-in rejoins the canonical uid", async () => {
    await authStore.restore();
    await authStore.logout();
    assert.strictEqual(authStore.get().user, null);
    assert.strictEqual(await storage.getItem(SESSION_KEY), null, "session not cleared");

    registerAuthProvider(fakeFirebaseProvider(FIREBASE_UID, LEGACY_PHONE));
    const start = await authStore.signInWithPhone(LEGACY_NAME, LEGACY_PHONE);
    const user = await authStore.confirmPhoneSignIn(start.verificationId, "123456", LEGACY_NAME);

    assert.strictEqual(user.uid, LEGACY_UID, "Firebase uid replaced the canonical uid");
    assert.strictEqual(user.firebaseUid, FIREBASE_UID);
    assert.strictEqual(user.authProvider, "firebase");
    assert.strictEqual(user.createdAt, legacySession.createdAt, "account age lost");

    assert.strictEqual(billsOwnedBy(await readBills(), user.uid), BILL_COUNT);
    assert.strictEqual(viewerNet(await readBills(), user.uid), expectedNet);
    assert.strictEqual(await storage.getItem(GROUPS_KEY), billsBefore, "stored bills mutated");
  });

  // 3 — Unnormalized input on the login screen must still match.
  await scenario("same number typed as '98765 43210' still rejoins", async () => {
    await authStore.restore();
    await authStore.logout();

    registerAuthProvider(fakeFirebaseProvider(FIREBASE_UID, LEGACY_PHONE));
    const start = await authStore.signInWithPhone(LEGACY_NAME, "98765 43210");
    const user = await authStore.confirmPhoneSignIn(start.verificationId, "123456", LEGACY_NAME);

    assert.strictEqual(user.uid, LEGACY_UID);
    assert.strictEqual(billsOwnedBy(await readBills(), user.uid), BILL_COUNT);
  });

  // 4 — A genuinely new account is allowed to take the Firebase uid.
  await scenario("new number gets uid === firebaseUid", async () => {
    await storage.clear();
    resetAuthProvider();
    await authStore.restore();
    assert.strictEqual(authStore.get().user, null);

    const newUid = "brandNewFirebaseUid123";
    registerAuthProvider(fakeFirebaseProvider(newUid, "+919000000001"));
    const start = await authStore.signInWithPhone("Newcomer", "+919000000001");
    const user = await authStore.confirmPhoneSignIn(start.verificationId, "123456", "Newcomer");

    assert.strictEqual(user.uid, newUid, "new account should use the Firebase uid");
    assert.strictEqual(user.firebaseUid, newUid);
  });

  // 5 — A DIFFERENT person on the same device must not inherit the uid.
  await scenario("a different number does not inherit the legacy uid", async () => {
    await authStore.restore();
    await authStore.logout();

    const otherUid = "someoneElseFirebaseUid";
    registerAuthProvider(fakeFirebaseProvider(otherUid, "+919000000002"));
    const start = await authStore.signInWithPhone("Someone Else", "+919000000002");
    const user = await authStore.confirmPhoneSignIn(start.verificationId, "123456", "Someone Else");

    assert.strictEqual(user.uid, otherUid, "legacy uid leaked to another number");
    assert.strictEqual(billsOwnedBy(await readBills(), user.uid), 0);
    assert.strictEqual(billsOwnedBy(await readBills(), LEGACY_UID), BILL_COUNT);
  });

  // 6 — Re-signing in after the link keeps the same uid (no drift).
  await scenario("repeat Firebase sign-in is idempotent", async () => {
    await authStore.restore();
    registerAuthProvider(fakeFirebaseProvider(FIREBASE_UID, LEGACY_PHONE));

    for (let i = 0; i < 3; i++) {
      await authStore.logout();
      const start = await authStore.signInWithPhone(LEGACY_NAME, LEGACY_PHONE);
      const user = await authStore.confirmPhoneSignIn(start.verificationId, "123456", LEGACY_NAME);
      assert.strictEqual(user.uid, LEGACY_UID, `uid drifted on pass ${i + 1}`);
    }
    assert.strictEqual(billsOwnedBy(await readBills(), LEGACY_UID), BILL_COUNT);
  });

  // 7 — updateUser() (onboarding, UPI) can never renumber the account.
  await scenario("updateUser cannot rewrite uid", async () => {
    await authStore.restore();
    await authStore.updateUser({ uid: "attemptedOverwrite", upiId: "new@upi" });
    assert.strictEqual(authStore.get().user.uid, LEGACY_UID);
    assert.strictEqual(authStore.get().user.upiId, "new@upi");
  });

  fs.rmSync(outDir, { recursive: true, force: true });
  console.log(`\n${results.length} checks passed.\n`);
}

main().catch((e) => {
  console.error("\n✗ auth identity check FAILED\n");
  console.error(e);
  process.exit(1);
});
