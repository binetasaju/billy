// ---------------------------------------------------------------------------
// services/cloud/billSync.ts — keeps my bills in Firestore and on the phone
//
//   listen:  bills where memberUids contains me  +  each bill's payments
//   write:   save (create / edit), mark paid, close, delete, join
//
// Firestore's offline cache queues writes without internet and shows them at
// once (snapshots include pending writes), so the store simply mirrors what
// the listeners report. See docs/CLOUD_SYNC_PLAN.md.
// ---------------------------------------------------------------------------

import type { BillGroup } from "../../types/group";
import type { CloudDb, Unsubscribe, WriteOp } from "./cloudDb";
import {
  type CloudBill,
  type CloudPayment,
  type Me,
  myCloudPid,
  paymentId,
  stripUndefined,
  toCloudBill,
  toLocalBill,
} from "./billMapping";

export interface InviteInfo {
  billId: string;
  title: string;
  createdBy: string;
  payerName: string;
  totalAmount: number;
  participants: { id: string; name: string; linked: boolean }[];
}

export interface BillSync {
  stop(): void;
  /** Is this bill stored in the cloud (known to the listener)? */
  has(billId: string): boolean;
  saveBill(local: BillGroup): Promise<void>;
  markPaid(billId: string, fromLocalId: string, toLocalId: string, method?: "upi" | "cash" | "other"): Promise<void>;
  closeBill(billId: string): Promise<void>;
  deleteBill(billId: string): Promise<void>;
}

export function startBillSync(
  db: CloudDb,
  me: Me,
  onBills: (bills: BillGroup[]) => void,
  onError: (e: unknown) => void = (e) => console.warn("[cloud] sync error:", e)
): BillSync {
  const bills = new Map<string, CloudBill>();
  const payments = new Map<string, Map<string, CloudPayment>>();
  const paymentListeners = new Map<string, Unsubscribe>();

  // Only report a bill once its payments have loaded (no flash of "settled").
  const emit = () => {
    const out: BillGroup[] = [];
    for (const [id, bill] of bills) {
      const p = payments.get(id);
      if (p) out.push(toLocalBill(id, bill, [...p.values()], me));
    }
    onBills(out);
  };

  const stopBills = db.listenWhereContains(
    "bills",
    "memberUids",
    me.authUid,
    (docs) => {
      const ids = new Set(docs.map((d) => d.id));
      for (const id of [...bills.keys()]) {
        if (!ids.has(id)) {
          bills.delete(id);
          payments.delete(id);
          paymentListeners.get(id)?.();
          paymentListeners.delete(id);
        }
      }
      for (const d of docs) {
        bills.set(d.id, d.data as CloudBill);
        if (!paymentListeners.has(d.id)) {
          paymentListeners.set(
            d.id,
            db.listenCollection(
              `bills/${d.id}/payments`,
              (pdocs) => {
                payments.set(d.id, new Map(pdocs.map((p) => [p.id, p.data as CloudPayment])));
                emit();
              },
              onError
            )
          );
        }
      }
      emit();
    },
    onError
  );

  /** Phone participant id → cloud participant id for a bill. */
  const toCloudPid = (billId: string, localId: string) => {
    const mine = myCloudPid(bills.get(billId)?.participantUids, me.authUid) ?? me.billyUid;
    return localId === me.billyUid ? mine : localId;
  };

  return {
    stop() {
      stopBills();
      for (const u of paymentListeners.values()) u();
      paymentListeners.clear();
    },

    has: (billId) => bills.has(billId),

    async saveBill(local) {
      const existing = bills.get(local.id);
      if (existing && existing.createdBy !== me.authUid) return; // only the creator edits
      const { bill, payments: pays } = toCloudBill(local, me, existing);
      const ops: WriteOp[] = [{ type: "set", path: `bills/${local.id}`, data: stripUndefined(bill) }];
      for (const [pid, p] of Object.entries(pays)) {
        ops.push({ type: "set", path: `bills/${local.id}/payments/${pid}`, data: stripUndefined(p) });
      }
      for (const old of payments.get(local.id)?.keys() ?? []) {
        if (!pays[old]) ops.push({ type: "delete", path: `bills/${local.id}/payments/${old}` });
      }
      const payerPid = Object.values(pays)[0]?.toId ?? bill.createdByPid;
      const invite: InviteInfo = {
        billId: local.id,
        title: bill.title,
        createdBy: me.authUid,
        payerName: bill.participants.find((p) => p.id === payerPid)?.name ?? "",
        totalAmount: bill.totalAmount,
        participants: bill.participants.map((p) => ({ id: p.id, name: p.name, linked: !!bill.participantUids[p.id] })),
      };
      ops.push({ type: "set", path: `invites/${bill.inviteCode}`, data: stripUndefined(invite) });
      await db.batch(ops);
    },

    async markPaid(billId, fromLocalId, toLocalId, method) {
      const id = paymentId(toCloudPid(billId, fromLocalId), toCloudPid(billId, toLocalId));
      await db.update(`bills/${billId}/payments/${id}`, {
        status: "paid",
        paidAt: new Date().toISOString(),
        paymentMethod: method ?? null,
        markedBy: me.authUid,
      });
    },

    async closeBill(billId) {
      const now = new Date().toISOString();
      const ops: WriteOp[] = [{ type: "update", path: `bills/${billId}`, data: { closed: true, closedAt: now, updatedAt: now } }];
      for (const [pid, p] of payments.get(billId) ?? []) {
        if (p.status === "pending") ops.push({ type: "update", path: `bills/${billId}/payments/${pid}`, data: { status: "cancelled" } });
      }
      await db.batch(ops);
    },

    async deleteBill(billId) {
      const ops: WriteOp[] = [];
      for (const pid of payments.get(billId)?.keys() ?? []) ops.push({ type: "delete", path: `bills/${billId}/payments/${pid}` });
      const code = bills.get(billId)?.inviteCode;
      if (code) ops.push({ type: "delete", path: `invites/${code}` });
      ops.push({ type: "delete", path: `bills/${billId}` });
      await db.batch(ops);
    },
  };
}

/** Who can I join as? (anyone signed in with the link's code) */
export async function getInvite(db: CloudDb, code: string): Promise<InviteInfo | null> {
  return (await db.get(`invites/${code}`)) as InviteInfo | null;
}

/** Join a bill as participant `pid` using the invite code (see firestore.rules isJoin). */
export async function joinBill(db: CloudDb, authUid: string, billId: string, code: string, pid: string): Promise<void> {
  await db.update(`bills/${billId}`, {
    memberUids: db.arrayUnion(authUid),
    [`participantUids.${pid}`]: authUid,
    joinCode: code,
    joinPid: pid,
    updatedAt: new Date().toISOString(),
  });
}
