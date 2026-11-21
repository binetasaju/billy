// Billy Firestore rules — run with: npm run test:rules (starts the emulator)
import { test, before, after, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, writeBatch,
} from "firebase/firestore";

let env;
const CODE = "invite-secret-123";

// Accounts: asha (creator/payer), ravi (on the bill via email), anu (joins by link), eve (outsider)
const db = (uid, token = {}) => env.authenticatedContext(uid, token).firestore();
const asha = () => db("asha", { email: "asha@x.com", email_verified: true });
const ravi = () => db("ravi");
const anu = () => db("anu");
const eve = () => db("eve");

const bill = {
  title: "Dinner",
  createdBy: "asha",
  createdByPid: "p_asha",
  memberUids: ["asha", "ravi"],
  participantUids: { p_asha: "asha", p_ravi: "ravi" },
  participants: [{ id: "p_asha", name: "Asha" }, { id: "p_ravi", name: "Ravi" }, { id: "c_anu", name: "Anu" }],
  inviteCode: CODE,
  totalAmount: 900,
};
const payRavi = { fromId: "p_ravi", toId: "p_asha", amount: 300, status: "pending" };
const payAnu = { fromId: "c_anu", toId: "p_asha", amount: 300, status: "pending" };

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-billy",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
after(async () => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const f = ctx.firestore();
    await setDoc(doc(f, "bills/b1"), bill);
    await setDoc(doc(f, "bills/b1/payments/p_ravi__p_asha"), payRavi);
    await setDoc(doc(f, "bills/b1/payments/c_anu__p_asha"), payAnu);
    await setDoc(doc(f, "users/ravi"), { name: "Ravi" });
    await setDoc(doc(f, "invites/" + CODE), { billId: "b1", createdBy: "asha", title: "Dinner" });
  });
});

// ── Profiles ────────────────────────────────────────────────────────────────
test("anyone signed in can get a profile, nobody can list them", async () => {
  await assertSucceeds(getDoc(doc(eve(), "users/ravi")));
  await assertFails(getDocs(collection(eve(), "users")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users/ravi")));
});
test("you can only write your own profile", async () => {
  await assertSucceeds(setDoc(doc(anu(), "users/anu"), { name: "Anu" }));
  await assertFails(setDoc(doc(eve(), "users/ravi"), { name: "hacked" }));
});
test("saved groups are private", async () => {
  await assertSucceeds(setDoc(doc(anu(), "users/anu/groups/g1"), { name: "Flat" }));
  await assertFails(getDoc(doc(eve(), "users/anu/groups/g1")));
});

// ── Email lookup ────────────────────────────────────────────────────────────
test("you can register only your own verified email", async () => {
  await assertSucceeds(setDoc(doc(asha(), "emails/asha@x.com"), { uid: "asha" }));
  await assertFails(setDoc(doc(asha(), "emails/ravi@x.com"), { uid: "asha" }));
  await assertFails(setDoc(doc(db("bob", { email: "bob@x.com", email_verified: false }), "emails/bob@x.com"), { uid: "bob" }));
  await assertFails(setDoc(doc(asha(), "emails/asha@x.com"), { uid: "eve" }));
  await assertFails(getDocs(collection(eve(), "emails")));
});

// ── Invites ─────────────────────────────────────────────────────────────────
test("an invite can be read with its code but not listed", async () => {
  await assertSucceeds(getDoc(doc(eve(), "invites/" + CODE)));
  await assertFails(getDocs(collection(eve(), "invites")));
});

// ── Bills ───────────────────────────────────────────────────────────────────
test("members read a bill; outsiders can't", async () => {
  await assertSucceeds(getDoc(doc(ravi(), "bills/b1")));
  await assertFails(getDoc(doc(eve(), "bills/b1")));
  await assertSucceeds(getDocs(query(collection(ravi(), "bills"), where("memberUids", "array-contains", "ravi"))));
  await assertFails(getDocs(collection(eve(), "bills")));
});
test("you can create a bill only as yourself", async () => {
  await assertSucceeds(setDoc(doc(anu(), "bills/b2"), { ...bill, createdBy: "anu", memberUids: ["anu"] }));
  await assertFails(setDoc(doc(anu(), "bills/b3"), { ...bill, createdBy: "asha", memberUids: ["anu"] }));
});
test("only the creator edits or deletes a bill", async () => {
  await assertSucceeds(updateDoc(doc(asha(), "bills/b1"), { title: "Dinner (fixed)" }));
  await assertFails(updateDoc(doc(ravi(), "bills/b1"), { title: "mine now" }));
  await assertFails(updateDoc(doc(asha(), "bills/b1"), { createdBy: "ravi" }));
  await assertFails(deleteDoc(doc(ravi(), "bills/b1")));
});
test("joining with the invite code links only yourself", async () => {
  await assertSucceeds(updateDoc(doc(anu(), "bills/b1"), {
    memberUids: ["asha", "ravi", "anu"],
    participantUids: { ...bill.participantUids, c_anu: "anu" },
    joinCode: CODE,
    joinPid: "c_anu",
  }));
});
test("joining fails without the right code", async () => {
  await assertFails(updateDoc(doc(eve(), "bills/b1"), {
    memberUids: ["asha", "ravi", "eve"],
    participantUids: { ...bill.participantUids, c_anu: "eve" },
    joinCode: "guess",
    joinPid: "c_anu",
  }));
});
test("a joiner can't take someone else's place, add others, or change the bill", async () => {
  const base = { memberUids: ["asha", "ravi", "anu"], joinCode: CODE, joinPid: "c_anu" };
  // re-point an already linked participant
  await assertFails(updateDoc(doc(anu(), "bills/b1"), { ...base, joinPid: "p_asha", participantUids: { p_asha: "anu", p_ravi: "ravi" } }));
  // claim one participant but link another
  await assertFails(updateDoc(doc(anu(), "bills/b1"), { ...base, joinPid: "c_anu", participantUids: { ...bill.participantUids, c_other: "anu" } }));
  // link two participants
  await assertFails(updateDoc(doc(anu(), "bills/b1"), { ...base, participantUids: { ...bill.participantUids, c_anu: "anu", c_x: "anu" } }));
  // link someone else's account
  await assertFails(updateDoc(doc(anu(), "bills/b1"), { ...base, participantUids: { ...bill.participantUids, c_anu: "eve" } }));
  // add another member too
  await assertFails(updateDoc(doc(anu(), "bills/b1"), { memberUids: ["asha", "ravi", "anu", "eve"], participantUids: { ...bill.participantUids, c_anu: "anu" }, joinCode: CODE, joinPid: "c_anu" }));
  // sneak in another change
  await assertFails(updateDoc(doc(anu(), "bills/b1"), { ...base, participantUids: { ...bill.participantUids, c_anu: "anu" }, totalAmount: 1 }));
});

// ── Payments ────────────────────────────────────────────────────────────────
test("members read payments; outsiders can't", async () => {
  await assertSucceeds(getDoc(doc(ravi(), "bills/b1/payments/p_ravi__p_asha")));
  await assertFails(getDoc(doc(eve(), "bills/b1/payments/p_ravi__p_asha")));
});
test("the person who owes can mark it paid", async () => {
  await assertSucceeds(updateDoc(doc(ravi(), "bills/b1/payments/p_ravi__p_asha"), { status: "paid", paidAt: "2026-11-11T10:00:00Z", markedBy: "ravi" }));
});
test("the payer can save the UPI transaction reference when marking paid", async () => {
  await assertSucceeds(updateDoc(doc(ravi(), "bills/b1/payments/p_ravi__p_asha"), {
    status: "paid", paidAt: "2026-11-12T10:00:00Z", paymentMethod: "upi", markedBy: "ravi", upiRef: "AXI123",
  }));
});
test("the person owed can mark it received", async () => {
  await assertSucceeds(updateDoc(doc(asha(), "bills/b1/payments/p_ravi__p_asha"), { status: "paid", paidAt: "2026-11-11T10:00:00Z", markedBy: "asha" }));
});
test("nobody else can mark a payment, or change its amount", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "bills/b1"), { memberUids: ["asha", "ravi", "anu"], participantUids: { ...bill.participantUids, c_anu: "anu" } });
  });
  // anu is a member but not part of Ravi's payment
  await assertFails(updateDoc(doc(anu(), "bills/b1/payments/p_ravi__p_asha"), { status: "paid", markedBy: "anu" }));
  // ravi can't lower what he owes
  await assertFails(updateDoc(doc(ravi(), "bills/b1/payments/p_ravi__p_asha"), { status: "paid", markedBy: "ravi", amount: 1 }));
  // can't claim someone else marked it
  await assertFails(updateDoc(doc(ravi(), "bills/b1/payments/p_ravi__p_asha"), { status: "paid", markedBy: "asha" }));
  await assertFails(updateDoc(doc(eve(), "bills/b1/payments/p_ravi__p_asha"), { status: "paid", markedBy: "eve" }));
});
test("a contact who hasn't joined can't mark anything", async () => {
  await assertFails(updateDoc(doc(anu(), "bills/b1/payments/c_anu__p_asha"), { status: "paid", markedBy: "anu" }));
});
test("the creator can cancel payments (close) and delete the bill with its payments", async () => {
  await assertSucceeds(updateDoc(doc(asha(), "bills/b1/payments/c_anu__p_asha"), { status: "cancelled" }));
  const f = asha();
  const b = writeBatch(f);
  b.delete(doc(f, "bills/b1/payments/p_ravi__p_asha"));
  b.delete(doc(f, "bills/b1/payments/c_anu__p_asha"));
  b.delete(doc(f, "bills/b1"));
  await assertSucceeds(b.commit());
});
test("the creator writes a new bill and its payments in one batch", async () => {
  const f = anu();
  const b = writeBatch(f);
  b.set(doc(f, "bills/b9"), { ...bill, createdBy: "anu", memberUids: ["anu"], participantUids: { p_anu: "anu" } });
  b.set(doc(f, "bills/b9/payments/x__p_anu"), { fromId: "x", toId: "p_anu", amount: 10, status: "pending" });
  await assertSucceeds(b.commit());
  await assertFails(setDoc(doc(ravi(), "bills/b1/payments/new"), { fromId: "a", toId: "b", amount: 1, status: "pending" }));
});
