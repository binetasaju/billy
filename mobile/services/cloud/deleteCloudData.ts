// ---------------------------------------------------------------------------
// services/cloud/deleteCloudData.ts — everything an account owns in Firestore
//
// Deleted:  users/{uid} profile, users/{uid}/groups/*, emails/{email},
//           bills I created (+ their payments and invite link).
// Kept:     bills other people created that I was on — they belong to them
//           (firestore.rules only let a bill's creator delete it). My name
//           stays on those as a participant; my profile, UPI ID and photo go.
// ---------------------------------------------------------------------------
import type { CloudDb, DocData, WriteOp } from "./cloudDb";
import { normalizeEmail } from "./profiles";

/** Firestore allows 500 writes per batch; stay well under. */
const BATCH = 400;

type Doc = { id: string; data: DocData };

/** Read a (filtered) collection once through the live-listener API. */
function once(listen: (onDocs: (docs: Doc[]) => void, onError: (e: unknown) => void) => () => void): Promise<Doc[]> {
  return new Promise((resolve, reject) => {
    let unsub: (() => void) | null = null;
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      fn();
      // The first snapshot can arrive before listen() returns.
      if (unsub) unsub();
      else setTimeout(() => unsub?.(), 0);
    };
    unsub = listen(
      (docs) => finish(() => resolve(docs)),
      (e) => finish(() => reject(e))
    );
    if (done) unsub();
  });
}

export interface DeletionSummary {
  billsDeleted: number;
  billsKept: number;
  groupsDeleted: number;
}

export async function deleteCloudData(db: CloudDb, authUid: string, email?: string | null): Promise<DeletionSummary> {
  const ops: WriteOp[] = [];

  // Bills I'm on
  const bills = await once((ok, err) => db.listenWhereContains("bills", "memberUids", authUid, ok, err));
  const mine = bills.filter((b) => b.data.createdBy === authUid);
  for (const bill of mine) {
    const payments = await once((ok, err) => db.listenCollection(`bills/${bill.id}/payments`, ok, err));
    for (const p of payments) ops.push({ type: "delete", path: `bills/${bill.id}/payments/${p.id}` });
    // Only existing docs I own: a rule that reads resource.data denies a
    // delete of a missing doc, which would fail the whole batch.
    const code = bill.data.inviteCode;
    if (typeof code === "string" && code && (await db.get(`invites/${code}`))?.createdBy === authUid) {
      ops.push({ type: "delete", path: `invites/${code}` });
    }
    // Payments first: their rules look the bill up.
    ops.push({ type: "delete", path: `bills/${bill.id}` });
  }

  // Saved groups
  const groups = await once((ok, err) => db.listenCollection(`users/${authUid}/groups`, ok, err));
  for (const g of groups) ops.push({ type: "delete", path: `users/${authUid}/groups/${g.id}` });

  // Email lookup + profile last
  if (email && (await db.get(`emails/${normalizeEmail(email)}`))?.uid === authUid) {
    ops.push({ type: "delete", path: `emails/${normalizeEmail(email)}` });
  }
  ops.push({ type: "delete", path: `users/${authUid}` });

  for (let i = 0; i < ops.length; i += BATCH) {
    await db.batch(ops.slice(i, i + BATCH));
  }

  return { billsDeleted: mine.length, billsKept: bills.length - mine.length, groupsDeleted: groups.length };
}
