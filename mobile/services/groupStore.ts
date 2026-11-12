// ---------------------------------------------------------------------------
// services/groupStore.ts
//
// Centralized group state for Billy.
// Persisted using AsyncStorage, ready for Firestore sync.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BillGroup, GroupSettlement } from "../types/group";
import type { BillSync } from "./cloud/billSync";

const STORAGE_KEY = "@billy_groups";

interface GroupState {
  groups: BillGroup[];
  isLoading: boolean;
}

/**
 * A group's status is derived from its settlement records — never stored
 * independently. A group with no outstanding settlements (nobody owes anyone,
 * e.g. a solo bill) is settled from the moment it is created; `every` on an
 * empty array is true, which is exactly the behaviour we want here.
 */
function deriveStatus(settlements: GroupSettlement[]): BillGroup["status"] {
  if (settlements.some((tx) => tx.status === "cancelled")) return "closed";
  return settlements.every((tx) => tx.status === "paid") ? "settled" : "active";
}

let _state: GroupState = { groups: [], isLoading: true };

/**
 * Cloud sync (services/cloud/billSync.ts), when signed in with Firebase.
 * Mutations below update the phone first (instant), then the cloud; the
 * cloud listener then feeds the authoritative bills back via applyCloud().
 */
let _remote: BillSync | null = null;

async function _toCloud(label: string, op: (r: BillSync) => Promise<void>): Promise<void> {
  if (!_remote) return;
  try {
    await op(_remote);
  } catch (e) {
    console.warn(`[groupStore] cloud ${label} failed:`, e);
  }
}

async function _persistAll(groups: BillGroup[]) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch (e) {
    console.warn("[groupStore] Failed to save groups:", e);
  }
}
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

export const groupStore = {
  // ── Read ────────────────────────────────────────────────────────────────────
  get(): GroupState {
    return _state;
  },

  getGroups(): BillGroup[] {
    return [..._state.groups].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  getGroupById(id: string): BillGroup | undefined {
    return _state.groups.find((g) => g.id === id);
  },

  // ── Subscribe ───────────────────────────────────────────────────────────────
  subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  // ── Persistence ─────────────────────────────────────────────────────────────
  async restore(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const groups: BillGroup[] = raw ? JSON.parse(raw) : [];
      _state = { groups, isLoading: false };
    } catch {
      _state = { groups: [], isLoading: false };
    }
    _notify();
  },

  // ── Mutations ───────────────────────────────────────────────────────────────
  async createGroup(group: BillGroup): Promise<void> {
    // Status is always derived here, so a bill with zero settlements is stored
    // as "settled" instead of stranding as "active" forever.
    const withStatus: BillGroup = { ...group, status: deriveStatus(group.settlements) };
    const updated = [withStatus, ..._state.groups];
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persistAll(updated);
    await _toCloud("save", (r) => r.saveBill(withStatus));
  },

  async updateGroup(id: string, patch: Partial<BillGroup>): Promise<void> {
    const updated = _state.groups.map((g) =>
      g.id === id ? { ...g, ...patch, updatedAt: new Date().toISOString() } : g
    );
    _state = { groups: updated, isLoading: false };
    _notify();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[groupStore] Failed to update group:", e);
    }
  },

  /** Replace a bill's content after an edit (see services/billEditing.ts). */
  async replaceGroup(group: BillGroup): Promise<void> {
    const withStatus: BillGroup = { ...group, status: deriveStatus(group.settlements) };
    const updated = _state.groups.map((g) => (g.id === group.id ? withStatus : g));
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persistAll(updated);
    await _toCloud("edit", (r) => r.saveBill(withStatus));
  },

  async deleteGroup(id: string): Promise<void> {
    const updated = _state.groups.filter((g) => g.id !== id);
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persistAll(updated);
    await _toCloud("delete", async (r) => {
      if (r.has(id)) await r.deleteBill(id);
    });
  },

  async markSettlementPaid(
    groupId: string,
    fromId: string,
    toId: string,
    /** How it was paid, when known. Omitted for a plain "received" confirmation. */
    method?: "upi" | "cash" | "other",
    /** UPI transaction reference reported by the payment app. */
    upiRef?: string
  ): Promise<void> {
    const group = _state.groups.find((g) => g.id === groupId);
    if (!group) return;

    // Idempotent: a double tap (or a second device later) must not re-record
    // a payment or overwrite when it was originally paid.
    const target = group.settlements.find((tx) => tx.fromUserId === fromId && tx.toUserId === toId);
    // Only pending rows can be paid — not paid ones, nor cancelled (closed bill).
    if (!target || target.status !== "pending") return;

    // Update the specific settlement
    const updatedSettlements = group.settlements.map((tx) => {
      if (tx.fromUserId === fromId && tx.toUserId === toId) {
        return {
          ...tx,
          status: "paid" as const,
          paidAt: new Date().toISOString(),
          ...(method ? { paymentMethod: method } : {}),
          ...(upiRef ? { upiRef } : {}),
        };
      }
      return tx;
    });

    await this.updateGroup(groupId, {
      settlements: updatedSettlements,
      status: deriveStatus(updatedSettlements),
    });
    await _toCloud("mark paid", async (r) => {
      if (r.has(groupId)) await r.markPaid(groupId, fromId, toId, method, upiRef);
    });
  },

  /**
   * Close a bill that has a mistake after someone already paid part of it.
   * Only the creator can close, and only an active bill with at least one
   * payment (before any payment, Edit is used instead). Unpaid rows become
   * "cancelled"; paid rows are kept so everyone can see who must be repaid.
   */
  async closeBill(groupId: string, byUserId: string | undefined): Promise<boolean> {
    const group = _state.groups.find((g) => g.id === groupId);
    if (!group || !byUserId || group.createdBy !== byUserId) return false;
    if (group.status !== "active") return false;
    if (!group.settlements.some((tx) => tx.status === "paid")) return false;

    const settlements = group.settlements.map((tx) =>
      tx.status === "pending" ? { ...tx, status: "cancelled" as const } : tx
    );
    await this.updateGroup(groupId, {
      settlements,
      status: "closed",
      closedAt: new Date().toISOString(),
    });
    await _toCloud("close", async (r) => {
      if (r.has(groupId)) await r.closeBill(groupId);
    });
    return true;
  },

  // ── Cloud sync hooks (used by services/cloud/cloudSync.ts) ────────────────

  /** Start / stop sending changes to the cloud. */
  setRemote(remote: BillSync | null): void {
    _remote = remote;
  },

  /**
   * Bills from the cloud listener. Cloud bills replace their phone copies;
   * bills that were never uploaded (not inCloud) stay; bills that used to be
   * in the cloud but are gone (deleted, or I was removed) are dropped.
   */
  async applyCloud(cloudBills: BillGroup[]): Promise<void> {
    const cloudIds = new Set(cloudBills.map((b) => b.id));
    const phoneOnly = _state.groups.filter((g) => !cloudIds.has(g.id) && !g.inCloud);
    const groups = [...cloudBills, ...phoneOnly];
    _state = { groups, isLoading: false };
    _notify();
    await _persistAll(groups);
  },
};
