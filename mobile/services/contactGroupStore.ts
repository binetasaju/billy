// ---------------------------------------------------------------------------
// services/contactGroupStore.ts
//
// Reusable contact groups ("Flatmates", "Office Lunch", …) so the same people
// can be pulled into bill after bill without re-picking them from contacts.
//
// This store owns ALL group CRUD and persistence — screens only call into it.
// It is deliberately separate from groupStore (which owns BillGroup, the
// immutable settlement record). Using a group to start a bill COPIES its
// members into that bill; nothing here is ever read back during settlement.
//
// Identity model: contact identity only (name + phone). A person's UPI ID
// lives on their own profile and is never stored here.
// ---------------------------------------------------------------------------

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ContactGroup, GroupMember } from "../types/group";
import type { GroupSync } from "./cloud/groupSync";
import type { Person } from "../types/bill";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber";
import { nanoid } from "../utils/nanoid";

/**
 * True when `userId` is the group's admin (its creator). Groups saved before
 * `createdBy` existed were all made on this phone, so the signed-in user is
 * their admin.
 */
export function isGroupAdmin(group: ContactGroup, userId: string | undefined): boolean {
  if (!userId) return false;
  return group.createdBy === undefined || group.createdBy === userId;
}

const STORAGE_KEY = "@billy_contact_groups";

/** Same palette the participants screen uses, so avatars stay consistent. */
export const MEMBER_COLORS = [
  "#065F46", "#0A0A0A", "#115E59", "#525252",
  "#047857", "#78716C", "#14532D", "#0F766E",
];

interface ContactGroupState {
  groups: ContactGroup[];
  isLoading: boolean;
}

let _state: ContactGroupState = { groups: [], isLoading: true };
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

/**
 * Cloud backup (services/cloud/groupSync.ts) when signed in with Firebase.
 * Every change goes through _persist, which also sends what changed.
 */
let _remote: GroupSync | null = null;

async function _persist(groups: ContactGroup[], previous: ContactGroup[] = _lastSaved) {
  _lastSaved = groups;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch (e) {
    console.warn("[contactGroupStore] Failed to save groups:", e);
  }
  if (!_remote) return;
  const before = new Map(previous.map((g) => [g.id, JSON.stringify(g)]));
  const now = new Set(groups.map((g) => g.id));
  try {
    for (const g of groups) if (before.get(g.id) !== JSON.stringify(g)) await _remote.saveGroup(g);
    for (const id of before.keys()) if (!now.has(id)) await _remote.deleteGroup(id);
  } catch (e) {
    console.warn("[contactGroupStore] cloud backup failed:", e);
  }
}

let _lastSaved: ContactGroup[] = [];

function _now() {
  return new Date().toISOString();
}

// ── Pure helpers (exported so they can be reused and tested directly) ───────

/**
 * A person is already in the list if the ids match, or if both carry the same
 * phone number. Names are never used — two people can share a name.
 */
export function isDuplicateMember(
  members: Pick<GroupMember, "id" | "phone">[],
  candidate: Pick<GroupMember, "id" | "phone">
): boolean {
  const candidatePhone = normalizePhoneNumber(candidate.phone);
  return members.some((m) => {
    if (m.id === candidate.id) return true;
    const phone = normalizePhoneNumber(m.phone);
    return !!phone && !!candidatePhone && phone === candidatePhone;
  });
}

/** Drop duplicates within a batch and against what is already there. */
export function dedupeMembers(
  existing: GroupMember[],
  incoming: GroupMember[]
): GroupMember[] {
  const accepted: GroupMember[] = [];
  incoming.forEach((m) => {
    if (isDuplicateMember([...existing, ...accepted], m)) return;
    accepted.push(m);
  });
  return accepted;
}

/**
 * Copy group members onto a bill's participant list.
 *
 * Returns a NEW array — the group's own members are never mutated, so editing
 * participants for one bill cannot change the reusable group. The current user
 * is skipped: the bill already has its own "me" participant, whose identity
 * comes from the auth profile.
 */
export function membersToParticipants(
  members: GroupMember[],
  existing: Person[],
  colors: string[] = MEMBER_COLORS
): Person[] {
  const result: Person[] = [...existing];

  members.forEach((m) => {
    if (m.isCurrentUser) return;
    if (isDuplicateMember(result, m)) return;
    result.push({
      id: m.id,
      name: m.name,
      phone: m.phone,
      color: m.color ?? colors[result.length % colors.length],
      itemIds: [],
    });
  });

  return result;
}

// ── Store ───────────────────────────────────────────────────────────────────

export const contactGroupStore = {
  // ── Read ──────────────────────────────────────────────────────────────────
  get(): ContactGroupState {
    return _state;
  },

  /** Most recently updated first. */
  getGroups(): ContactGroup[] {
    return [..._state.groups].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  },

  getGroupById(id: string): ContactGroup | undefined {
    return _state.groups.find((g) => g.id === id);
  },

  // ── Subscribe ─────────────────────────────────────────────────────────────
  subscribe(listener: () => void): () => void {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  // ── Persistence ───────────────────────────────────────────────────────────
  async restore(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const groups: ContactGroup[] = raw ? JSON.parse(raw) : [];
      _state = { groups, isLoading: false };
    } catch {
      _state = { groups: [], isLoading: false };
    }
    _lastSaved = _state.groups;
    _notify();
  },

  // ── Mutations ─────────────────────────────────────────────────────────────
  /** `createdBy` is the creator's user ID — they become the group admin. */
  async createGroup(
    name: string,
    members: GroupMember[] = [],
    createdBy?: string
  ): Promise<ContactGroup> {
    const ts = _now();
    const group: ContactGroup = {
      id: `cg_${Date.now()}_${nanoid(6)}`,
      name: name.trim() || "Untitled Group",
      members: dedupeMembers([], members),
      createdBy,
      createdAt: ts,
      updatedAt: ts,
    };
    const updated = [group, ..._state.groups];
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persist(updated);
    return group;
  },

  async renameGroup(id: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) return;
    const updated = _state.groups.map((g) =>
      g.id === id ? { ...g, name: trimmed, updatedAt: _now() } : g
    );
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persist(updated);
  },

  /** Adds only the members that are not already present. */
  async addMembers(id: string, members: GroupMember[]): Promise<void> {
    const group = _state.groups.find((g) => g.id === id);
    if (!group) return;
    const accepted = dedupeMembers(group.members, members);
    if (accepted.length === 0) return;

    const updated = _state.groups.map((g) =>
      g.id === id
        ? { ...g, members: [...g.members, ...accepted], updatedAt: _now() }
        : g
    );
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persist(updated);
  },

  /**
   * Only the group admin (`byUserId` must be the creator) can remove members.
   * The current user cannot be removed from their own group.
   */
  async removeMember(id: string, memberId: string, byUserId: string | undefined): Promise<void> {
    const group = _state.groups.find((g) => g.id === id);
    if (!group || !isGroupAdmin(group, byUserId)) return;
    const member = group.members.find((m) => m.id === memberId);
    if (!member || member.isCurrentUser) return;

    const updated = _state.groups.map((g) =>
      g.id === id
        ? { ...g, members: g.members.filter((m) => m.id !== memberId), updatedAt: _now() }
        : g
    );
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persist(updated);
  },

  async deleteGroup(id: string): Promise<void> {
    const updated = _state.groups.filter((g) => g.id !== id);
    _state = { groups: updated, isLoading: false };
    _notify();
    await _persist(updated);
  },

  // ── Cloud backup hooks (used by services/cloud/cloudSync.ts) ──────────────

  setRemote(remote: GroupSync | null): void {
    _remote = remote;
  },

  /** Groups from my cloud backup; phone-only groups stay (and get uploaded). */
  async applyCloud(cloudGroups: ContactGroup[]): Promise<void> {
    const ids = new Set(cloudGroups.map((g) => g.id));
    const phoneOnly = _state.groups.filter((g) => !ids.has(g.id) && !g.inCloud);
    const groups = [...cloudGroups.map((g) => ({ ...g, inCloud: true })), ...phoneOnly];
    _state = { groups, isLoading: false };
    _lastSaved = groups; // came from the cloud — nothing to send back
    _notify();
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
    } catch (e) {
      console.warn("[contactGroupStore] Failed to save groups:", e);
    }
    if (_remote) {
      for (const g of phoneOnly) {
        try {
          await _remote.saveGroup(g);
        } catch (e) {
          console.warn("[contactGroupStore] could not upload group", g.id, e);
        }
      }
    }
  },
};
