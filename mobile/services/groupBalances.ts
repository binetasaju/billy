// ---------------------------------------------------------------------------
// services/groupBalances.ts
//
// Group balances are a READ-ONLY aggregation over records that already exist:
//
//   ContactGroup ──▶ linked BillGroups ──▶ their settlements[] ──▶ net balances
//
// There is no balance ledger and no storage key of its own. Nothing here
// writes, and nothing here re-derives a split — per-bill settlement amounts
// produced by calculateSettlement remain the single source of truth. Because
// every number is computed from persisted BillGroups on demand, balances are
// automatically correct after a restart.
//
// Only OUTSTANDING (unpaid) settlement rows count toward what people currently
// owe; paid rows stay in the bill's history but drop out of the balance.
// ---------------------------------------------------------------------------

import type { BillGroup, ContactGroup } from "../types/group";

/** Amounts below this are treated as settled (float dust from summing). */
const EPSILON = 0.01;

export interface MemberBalance {
  personId: string;
  /** Display name only — never used to identify anyone. */
  name: string;
  /**
   * Net across the whole group.
   * > 0 → this person is owed money.  < 0 → this person owes money.
   */
  net: number;
  /**
   * Net between this person and the viewer.
   * > 0 → they owe the viewer.  < 0 → the viewer owes them.
   */
  netWithViewer: number;
  /** False when they appear only in older bills and are no longer a member. */
  isCurrentMember: boolean;
  isViewer: boolean;
}

export interface GroupBalances {
  members: MemberBalance[];
  /** The viewer's own net across the group (> 0 → owed money). */
  viewerNet: number;
  /** Sum of every outstanding settlement row in the group. */
  totalOutstanding: number;
  linkedBillCount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Bills started from this reusable group, newest first. */
export function getLinkedBills(
  group: Pick<ContactGroup, "id">,
  billGroups: BillGroup[]
): BillGroup[] {
  return billGroups
    .filter((bg) => bg.contactGroupId === group.id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/**
 * Aggregate outstanding obligations from a group's linked bills.
 *
 * People are matched by id throughout. Someone removed from the group still
 * appears while they owe or are owed money — dropping them would hide a real
 * debt — flagged with isCurrentMember: false. Someone added after older bills
 * simply shows a zero balance.
 */
export function computeGroupBalances(
  group: ContactGroup,
  billGroups: BillGroup[],
  viewerId?: string
): GroupBalances {
  const linked = getLinkedBills(group, billGroups);

  // Resolve the viewer by id only, never by name. The group's own
  // current-user member is the fallback when no auth uid was supplied.
  const resolvedViewerId =
    viewerId ?? group.members.find((m) => m.isCurrentUser)?.id;

  const net: Record<string, number> = {};
  const netWithViewer: Record<string, number> = {};
  const names: Record<string, string> = {};
  let totalOutstanding = 0;

  const seen = (id: string) => {
    if (!(id in net)) {
      net[id] = 0;
      netWithViewer[id] = 0;
    }
  };

  // Names: current membership wins; otherwise the newest bill that mentions them.
  linked.forEach((bg) => {
    bg.participants.forEach((p) => {
      if (!(p.id in names)) names[p.id] = p.name;
    });
  });
  group.members.forEach((m) => {
    names[m.id] = m.name;
  });

  linked.forEach((bg) => {
    bg.settlements.forEach((tx) => {
      // Paid rows remain in the bill's history but no longer count here.
      if (tx.status === "paid") return;
      if (tx.fromUserId === tx.toUserId) return;
      if (!tx.amount) return;

      seen(tx.fromUserId);
      seen(tx.toUserId);

      // fromUserId owes toUserId
      net[tx.fromUserId] -= tx.amount;
      net[tx.toUserId] += tx.amount;
      totalOutstanding += tx.amount;

      if (resolvedViewerId) {
        if (tx.fromUserId === resolvedViewerId) {
          netWithViewer[tx.toUserId] -= tx.amount;
        } else if (tx.toUserId === resolvedViewerId) {
          netWithViewer[tx.fromUserId] += tx.amount;
        }
      }
    });
  });

  // Everyone currently in the group is listed, even at zero.
  const currentMemberIds = new Set(group.members.map((m) => m.id));
  currentMemberIds.forEach(seen);

  const members: MemberBalance[] = Object.keys(net).map((personId) => {
    const rawNet = round2(net[personId]);
    const rawWithViewer = round2(netWithViewer[personId] ?? 0);
    return {
      personId,
      name: names[personId] ?? "Unknown",
      net: Math.abs(rawNet) < EPSILON ? 0 : rawNet,
      netWithViewer: Math.abs(rawWithViewer) < EPSILON ? 0 : rawWithViewer,
      isCurrentMember: currentMemberIds.has(personId),
      isViewer: personId === resolvedViewerId,
    };
  });

  // Outstanding first, then current members, then alphabetically — stable and
  // puts what needs attention at the top.
  members.sort((a, b) => {
    const aOut = a.netWithViewer !== 0 || a.net !== 0 ? 0 : 1;
    const bOut = b.netWithViewer !== 0 || b.net !== 0 ? 0 : 1;
    if (aOut !== bOut) return aOut - bOut;
    if (a.isCurrentMember !== b.isCurrentMember) return a.isCurrentMember ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const viewer = members.find((m) => m.isViewer);

  return {
    members,
    viewerNet: viewer?.net ?? 0,
    totalOutstanding: round2(totalOutstanding),
    linkedBillCount: linked.length,
  };
}

/**
 * Plain-language line for one member, written from the viewer's perspective.
 * Kept here so the wording is testable and consistent wherever it is shown.
 */
export function describeBalance(balance: MemberBalance): string {
  if (balance.isViewer) {
    if (balance.net > 0) return `You are owed ₹${balance.net.toFixed(2)} overall`;
    if (balance.net < 0) return `You owe ₹${Math.abs(balance.net).toFixed(2)} overall`;
    return "You're settled up";
  }
  if (balance.netWithViewer > 0) {
    return `${balance.name} owes you ₹${balance.netWithViewer.toFixed(2)}`;
  }
  if (balance.netWithViewer < 0) {
    return `You owe ₹${Math.abs(balance.netWithViewer).toFixed(2)}`;
  }
  // No direct obligation with the viewer, but they may still owe someone else.
  if (balance.net > 0) return `Is owed ₹${balance.net.toFixed(2)} in this group`;
  if (balance.net < 0) return `Owes ₹${Math.abs(balance.net).toFixed(2)} in this group`;
  return "Settled up";
}
