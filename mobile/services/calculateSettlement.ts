// ---------------------------------------------------------------------------
// services/calculateSettlement.ts
//
// Centralized settlement engine for Billy.
// Handles "equal" and "itemwise" splitting methods, applying proportional
// taxes and service charges, and generating peer-to-peer settlement transactions.
// ---------------------------------------------------------------------------

import type { Person, BillItem } from "../types/bill";

export interface SettlementInput {
  payerId: string;
  splitMethod: "equal" | "itemwise";
  participants: Person[]; // Using Person type from the app
  items: BillItem[];
  gstAmount?: number;
  serviceCharge?: number;
  additionalCharges?: number;
}

export interface SettlementTransaction {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface ParticipantTotal {
  personId: string;
  personName: string;
  itemsTotal: number;
  taxShare: number;
  serviceChargeShare: number;
  additionalChargesShare: number;
  total: number;
}

export interface SettlementSummary {
  settlements: SettlementTransaction[];
  participantTotals: ParticipantTotal[];
}

function roundTo2(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * calculateSettlement
 * 
 * Computes the financial breakdown and generated settlements for a bill.
 * 
 * @example
 * // Example 1: Equal Split
 * const result = calculateSettlement({
 *   payerId: "p1",
 *   splitMethod: "equal",
 *   participants: [
 *     { id: "p1", name: "Alice", itemIds: [], color: "" },
 *     { id: "p2", name: "Bob", itemIds: [], color: "" }
 *   ],
 *   items: [{ id: "i1", name: "Pizza", price: 100, amount: 100, quantity: 1, confidence: 1 }],
 *   gstAmount: 10,
 *   serviceCharge: 10
 * });
 * // Total Bill: 120. Alice = 60, Bob = 60.
 * // Bob owes Alice 60
 * // result.settlements === [{ fromUserId: "p2", toUserId: "p1", amount: 60 }]
 * 
 * @example
 * // Example 2: Item-wise Split
 * const result = calculateSettlement({
 *   payerId: "p1",
 *   splitMethod: "itemwise",
 *   participants: [
 *     { id: "p1", name: "Alice", itemIds: ["i1"], color: "" },
 *     { id: "p2", name: "Bob", itemIds: ["i1", "i2"], color: "" }
 *   ],
 *   items: [
 *     { id: "i1", name: "Pizza", price: 100, amount: 100, quantity: 1, confidence: 1 },
 *     { id: "i2", name: "Coke", price: 50, amount: 50, quantity: 1, confidence: 1 }
 *   ],
 *   gstAmount: 15,
 *   serviceCharge: 0
 * });
 * // Alice items: 50 (half pizza). Bob items: 50 + 50 = 100. Total items: 150.
 * // Alice proportion: 50/150 = 1/3. Bob proportion: 100/150 = 2/3.
 * // Alice tax: 5. Bob tax: 10.
 * // Alice total: 55. Bob total: 110.
 * // result.settlements === [{ fromUserId: "p2", toUserId: "p1", amount: 110 }]
 */
export function calculateSettlement({
  payerId,
  splitMethod,
  participants,
  items,
  gstAmount = 0,
  serviceCharge = 0,
  additionalCharges = 0,
}: SettlementInput): SettlementSummary {
  const numParticipants = participants.length;

  if (numParticipants === 0) {
    return { settlements: [], participantTotals: [] };
  }

  const itemsTotalSum = items.reduce((sum, item) => sum + item.price, 0);
  const totalBillAmount = itemsTotalSum + gstAmount + serviceCharge + additionalCharges;

  let participantTotals: ParticipantTotal[] = [];

  if (splitMethod === "equal") {
    // 1. Equal Split: Split total equally among participants.
    const exactItemsTotal = itemsTotalSum / numParticipants;
    const exactTaxShare = gstAmount / numParticipants;
    const exactServiceChargeShare = serviceCharge / numParticipants;
    const exactAdditionalChargesShare = additionalCharges / numParticipants;
    const exactTotal = totalBillAmount / numParticipants;

    let totalDistributed = 0;

    participantTotals = participants.map((p, index) => {
      let total = roundTo2(exactTotal);
      
      // 7. Ensure total money owed equals total bill amount.
      // Adjust the last person to absorb any fractional cent rounding differences
      if (index === numParticipants - 1) {
        total = roundTo2(totalBillAmount - totalDistributed);
      } else {
        totalDistributed += total;
      }

      return {
        personId: p.id,
        personName: p.name,
        itemsTotal: roundTo2(exactItemsTotal),
        taxShare: roundTo2(exactTaxShare),
        serviceChargeShare: roundTo2(exactServiceChargeShare),
        additionalChargesShare: roundTo2(exactAdditionalChargesShare),
        total,
      };
    });

  } else {
    // 2. Item-wise Split

    // Determine how many people share each item
    const itemShares: Record<string, number> = {};
    participants.forEach((p) => {
      p.itemIds.forEach((itemId) => {
        itemShares[itemId] = (itemShares[itemId] || 0) + 1;
      });
    });

    // Identify items with zero participants assigned
    const unassignedItems = items.filter(
      (item) => !itemShares[item.id] || itemShares[item.id] === 0
    );
    const unassignedTotal = unassignedItems.reduce((sum, it) => sum + it.price, 0);
    // Unassigned items are split equally among all participants
    const unassignedPerPerson = numParticipants > 0 ? unassignedTotal / numParticipants : 0;

    let totalItemsClaimedAmount = 0;

    const initialTotals = participants.map((p) => {
      let pItemsTotal = 0;
      p.itemIds.forEach((itemId) => {
        const item = items.find((i) => i.id === itemId);
        if (item && itemShares[itemId]) {
          // Split item price equally among assigned participants
          pItemsTotal += item.price / itemShares[itemId];
        }
      });
      // Add each person's equal share of unassigned items
      pItemsTotal += unassignedPerPerson;
      totalItemsClaimedAmount += pItemsTotal;
      return { personId: p.id, personName: p.name, itemsTotal: pItemsTotal };
    });

    // Now totalItemsClaimedAmount === itemsTotalSum (all items accounted for)
    const calculatedTotal = totalItemsClaimedAmount + gstAmount + serviceCharge + additionalCharges;
    let totalDistributed = 0;

    participantTotals = initialTotals.map((pt, index) => {
      // 3. GST + service charge: Distribute proportionally based on each participant's subtotal
      const proportion = totalItemsClaimedAmount > 0
        ? pt.itemsTotal / totalItemsClaimedAmount
        : 1 / numParticipants;

      const taxShare = gstAmount * proportion;
      const serviceChargeShare = serviceCharge * proportion;
      const additionalChargesShare = additionalCharges * proportion;

      let total = roundTo2(pt.itemsTotal + taxShare + serviceChargeShare + additionalChargesShare);

      // 7. Ensure total money owed equals total bill amount.
      if (index === numParticipants - 1) {
        total = roundTo2(calculatedTotal - totalDistributed);
      } else {
        totalDistributed += total;
      }

      return {
        ...pt,
        itemsTotal: roundTo2(pt.itemsTotal),
        taxShare: roundTo2(taxShare),
        serviceChargeShare: roundTo2(serviceChargeShare),
        additionalChargesShare: roundTo2(additionalChargesShare),
        total,
      };
    });
  }

  // 4. Output: generate settlements
  const settlements: SettlementTransaction[] = [];
  
  participantTotals.forEach((pt) => {
    // Everyone except payer owes the payer
    if (pt.personId !== payerId && pt.total > 0) {
      settlements.push({
        fromUserId: pt.personId,
        toUserId: payerId,
        amount: pt.total, // 6. Round values to 2 decimals (already rounded)
      });
    }
  });

  // 5. Return additional summary
  return { settlements, participantTotals };
}
