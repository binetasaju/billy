// ---------------------------------------------------------------------------
// services/groupStore.ts
//
// Centralized group state for Billy.
// Persisted using AsyncStorage, ready for Firestore sync.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BillGroup } from "../types/group";

const STORAGE_KEY = "@billy_groups";

interface GroupState {
  groups: BillGroup[];
  isLoading: boolean;
}

let _state: GroupState = { groups: [], isLoading: true };
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
    const updated = [group, ..._state.groups];
    _state = { groups: updated, isLoading: false };
    _notify();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[groupStore] Failed to save groups:", e);
    }
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

  async deleteGroup(id: string): Promise<void> {
    const updated = _state.groups.filter((g) => g.id !== id);
    _state = { groups: updated, isLoading: false };
    _notify();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn("[groupStore] Failed to delete group:", e);
    }
  },

  async markSettlementPaid(
    groupId: string,
    fromId: string,
    toId: string,
    method: "upi" | "cash" | "other" = "upi"
  ): Promise<void> {
    const group = _state.groups.find((g) => g.id === groupId);
    if (!group) return;

    // Update the specific settlement
    const updatedSettlements = group.settlements.map((tx) => {
      if (tx.fromUserId === fromId && tx.toUserId === toId) {
        return {
          ...tx,
          status: "paid" as const,
          paidAt: new Date().toISOString(),
          paymentMethod: method,
        };
      }
      return tx;
    });

    // Check if ALL settlements are now paid
    const allPaid = updatedSettlements.every((tx) => tx.status === "paid");

    await this.updateGroup(groupId, {
      settlements: updatedSettlements,
      status: allPaid ? "settled" : "active",
    });
  },
};
