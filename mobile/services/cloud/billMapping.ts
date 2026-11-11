// ---------------------------------------------------------------------------
// services/cloud/billMapping.ts — saved bill (on the phone) ⇄ Firestore docs
//
// Pure functions, no Firebase imports — fully unit-tested.
//
// Identity: on the phone, "me" on a bill always has participant id = my Billy
// uid (every screen compares against user.uid). In the cloud, each participant
// keeps the id it was created with (on the creator's phone that's a contact id
// or the creator's Billy uid), and `participantUids` links ids to Firebase
// accounts. So:
//   cloud → phone: my participant (linked to my authUid) is renamed to billyUid
//   phone → cloud: billyUid is renamed back to my cloud participant id
// Everything else (settlements, custom amounts, createdBy) is renamed with it.
// ---------------------------------------------------------------------------

import type { BillGroup, GroupSettlement } from "../../types/group";
import type { Person } from "../../types/bill";

export interface Me {
  /** Billy uid (what the phone's screens compare against). */
  billyUid: string;
  /** Firebase uid (what Firestore rules see). */
  authUid: string;
}

export interface CloudBill {
  title: string;
  createdBy: string;      // authUid of the creator
  createdByPid: string;   // creator's participant id
  createdAt: string;
  updatedAt: string;
  closed: boolean;
  closedAt?: string | null;
  totalAmount: number;
  splitMethod?: BillGroup["splitMethod"] | null;
  customAmounts?: Record<string, number> | null;
  billSnapshot?: BillGroup["billSnapshot"] | null;
  participants: Person[];
  participantUids: Record<string, string>;
  memberUids: string[];
  inviteCode: string;
}

export interface CloudPayment {
  fromId: string;
  toId: string;
  amount: number;
  status: "pending" | "paid" | "cancelled";
  paidAt?: string | null;
  paymentMethod?: "upi" | "cash" | "other" | null;
  markedBy?: string | null;
}

export const paymentId = (fromId: string, toId: string) => `${fromId}__${toId}`;

/** Random, unguessable code for share links (base36, ~120 bits). */
export function newInviteCode(random: () => number = Math.random): string {
  let s = "";
  while (s.length < 24) s += Math.floor(random() * 36).toString(36);
  return s;
}

/** My participant id on a cloud bill, if I'm linked to one. */
export function myCloudPid(participantUids: Record<string, string> | undefined, authUid: string): string | null {
  if (!participantUids) return null;
  for (const [pid, uid] of Object.entries(participantUids)) if (uid === authUid) return pid;
  return null;
}

const renameKeys = <T>(obj: Record<string, T> | null | undefined, rename: (k: string) => string) =>
  obj ? Object.fromEntries(Object.entries(obj).map(([k, v]) => [rename(k), v])) : undefined;

function deriveStatus(closed: boolean, settlements: GroupSettlement[]): BillGroup["status"] {
  if (closed || settlements.some((t) => t.status === "cancelled")) return "closed";
  return settlements.every((t) => t.status === "paid") ? "settled" : "active";
}

/** Firestore → the phone's BillGroup, from my point of view. */
export function toLocalBill(id: string, cloud: CloudBill, payments: CloudPayment[], me: Me): BillGroup {
  const mine = myCloudPid(cloud.participantUids, me.authUid);
  const rename = (pid: string) => (mine && pid === mine ? me.billyUid : pid);
  const order = new Map(cloud.participants.map((p, i) => [p.id, i]));

  const settlements: GroupSettlement[] = [...payments]
    .sort((a, b) => (order.get(a.fromId) ?? 99) - (order.get(b.fromId) ?? 99))
    .map((p) => ({
      fromUserId: rename(p.fromId),
      toUserId: rename(p.toId),
      amount: p.amount,
      status: p.status,
      ...(p.paidAt ? { paidAt: p.paidAt } : {}),
      ...(p.paymentMethod ? { paymentMethod: p.paymentMethod } : {}),
    }));

  return {
    id,
    title: cloud.title,
    createdBy: rename(cloud.createdByPid),
    participants: cloud.participants.map((p) => {
      const linked = cloud.participantUids[p.id];
      const { isCurrentUser: _ignored, ...rest } = p;
      return {
        ...rest,
        id: rename(p.id),
        ...(linked ? { authUid: linked } : {}),
        ...(mine && p.id === mine ? { isCurrentUser: true } : {}),
      };
    }),
    settlements,
    totalAmount: cloud.totalAmount,
    createdAt: cloud.createdAt,
    updatedAt: cloud.updatedAt,
    status: deriveStatus(cloud.closed, settlements),
    ...(cloud.closedAt ? { closedAt: cloud.closedAt } : {}),
    ...(cloud.billSnapshot ? { billSnapshot: cloud.billSnapshot } : {}),
    ...(cloud.splitMethod ? { splitMethod: cloud.splitMethod } : {}),
    ...(cloud.customAmounts ? { customAmounts: renameKeys(cloud.customAmounts, rename) } : {}),
    participantUids: renameKeys(cloud.participantUids, rename),
    inviteCode: cloud.inviteCode,
    inCloud: true,
  };
}

/**
 * The phone's BillGroup → Firestore docs. `existing` is the bill as it is in
 * the cloud now (undefined for a new bill). Only the creator writes this.
 */
export function toCloudBill(
  local: BillGroup,
  me: Me,
  existing?: CloudBill,
  inviteCode: string = existing?.inviteCode ?? local.inviteCode ?? newInviteCode()
): { bill: CloudBill; payments: Record<string, CloudPayment> } {
  const mine = (existing && myCloudPid(existing.participantUids, me.authUid)) || me.billyUid;
  const unrename = (pid: string) => (pid === me.billyUid ? mine : pid);

  const participantUids: Record<string, string> = { ...(existing?.participantUids ?? {}) };
  participantUids[mine] = me.authUid;
  for (const p of local.participants) if (p.authUid) participantUids[unrename(p.id)] = p.authUid;

  const memberUids = Array.from(new Set([...(existing?.memberUids ?? []), ...Object.values(participantUids)]));

  const participants: Person[] = local.participants.map((p) => {
    const { isCurrentUser: _a, authUid: _b, ...rest } = p;
    return stripUndefined({ ...rest, id: unrename(p.id) }) as Person;
  });

  const payments: Record<string, CloudPayment> = {};
  for (const t of local.settlements) {
    const fromId = unrename(t.fromUserId);
    const toId = unrename(t.toUserId);
    payments[paymentId(fromId, toId)] = {
      fromId,
      toId,
      amount: t.amount,
      status: t.status,
      paidAt: t.paidAt ?? null,
      paymentMethod: t.paymentMethod ?? null,
      markedBy: null,
    };
  }

  const bill: CloudBill = {
    title: local.title,
    createdBy: existing?.createdBy ?? me.authUid,
    createdByPid: unrename(local.createdBy),
    createdAt: existing?.createdAt ?? local.createdAt,
    updatedAt: local.updatedAt,
    closed: local.status === "closed",
    closedAt: local.closedAt ?? null,
    totalAmount: local.totalAmount,
    splitMethod: local.splitMethod ?? null,
    customAmounts: local.customAmounts ? renameKeys(local.customAmounts, unrename)! : null,
    billSnapshot: local.billSnapshot ? (stripUndefined(local.billSnapshot) as BillGroup["billSnapshot"]) : null,
    participants,
    participantUids,
    memberUids,
    inviteCode,
  };
  return { bill, payments };
}

/** Firestore rejects `undefined` values — drop them (deeply). */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}
