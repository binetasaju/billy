import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Modal, ToastAndroid, Platform, Alert } from "react-native";
import { useState, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { groupStore } from "../../services/groupStore";
import { useGroups } from "../../hooks/useGroups";
import { authStore } from "../../services/authStore";
import { openUpiPayment } from "../../services/upi";
import { calculateSettlement } from "../../services/calculateSettlement";
import type { Person, BillItem } from "../../types/bill";

/** One row of a person's share breakdown. */
interface BreakdownLine {
  key: string;
  name: string;
  amount: number;
  note?: string;
}

export default function GroupDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [activeTx, setActiveTx] = useState<{
    from: string;
    to: string;
    amount: number;
    receiverName: string;
    receiverUpiId?: string;
  } | null>(null);

  // Payer-side "Mark as Paid" state (used when the receiver has no UPI ID)
  const [payOtherTx, setPayOtherTx] = useState<{
    from: string;
    to: string;
    amount: number;
    receiverName: string;
  } | null>(null);

  // Payee-side "Mark as Received" state
  const [receiveTx, setReceiveTx] = useState<{
    from: string;
    to: string;
    amount: number;
    payerName: string;
  } | null>(null);

  // Item breakdown modal state
  const [itemsModal, setItemsModal] = useState<{
    visible: boolean;
    personName: string;
    lines: BreakdownLine[];
    itemsTotal: number;
    chargesShare: number;
    total: number;
  } | null>(null);

  // Report error modal
  const [showReportModal, setShowReportModal] = useState(false);

  // Subscribed read of the same store — the screen repaints as soon as a
  // settlement is marked paid, without leaving and reopening it.
  const { groups } = useGroups();
  const group = useMemo(() => groups.find((g) => g.id === id), [groups, id]);
  const currentUser = authStore.get().user;
  const isCreator = currentUser?.uid === group?.createdBy;

  // ── Build a person's share breakdown ───────────────────────────────────────
  // Shared items are divided by the number of people who claimed them, and the
  // charge share comes from the existing settlement engine run over the stored
  // bill snapshot — so this works for the payer too, who has no settlement row.
  // Stored settlement amounts are never altered here; they stay authoritative
  // for what is owed.
  const getPersonBreakdown = (personId: string) => {
    const participants = group?.participants ?? [];
    const allItems = (group?.billSnapshot?.items ?? []) as BillItem[];
    const person = participants.find((p) => p.id === personId);

    // How many people claimed each item
    const sharers: Record<string, number> = {};
    participants.forEach((p) =>
      p.itemIds.forEach((itemId) => {
        sharers[itemId] = (sharers[itemId] ?? 0) + 1;
      })
    );

    // A group with no item assignments at all was an equal split.
    const isItemwise = participants.some((p) => p.itemIds.length > 0);

    const lines: BreakdownLine[] = [];

    if (isItemwise) {
      (person?.itemIds ?? []).forEach((itemId) => {
        const it = allItems.find((i) => i.id === itemId);
        if (!it) return;
        const shareCount = sharers[itemId] || 1;
        const fullPrice = it.price ?? it.amount ?? 0;
        lines.push({
          key: itemId,
          name: it.name,
          amount: fullPrice / shareCount,
          note: shareCount > 1 ? `shared by ${shareCount} · ₹${fullPrice.toFixed(2)}` : undefined,
        });
      });

      // Items nobody claimed are split equally across everyone.
      const unassigned = allItems.filter((it) => !sharers[it.id]);
      if (unassigned.length > 0 && participants.length > 0) {
        const unassignedTotal = unassigned.reduce((sum, it) => sum + (it.price ?? it.amount ?? 0), 0);
        lines.push({
          key: "__unassigned",
          name: `Unassigned item${unassigned.length !== 1 ? "s" : ""} (${unassigned.length})`,
          amount: unassignedTotal / participants.length,
          note: "split equally",
        });
      }
    } else if (allItems.length > 0 && participants.length > 0) {
      const itemsSum = allItems.reduce((sum, it) => sum + (it.price ?? it.amount ?? 0), 0);
      lines.push({
        key: "__equal",
        name: `Equal share of ${allItems.length} item${allItems.length !== 1 ? "s" : ""}`,
        amount: itemsSum / participants.length,
        note: `split between ${participants.length}`,
      });
    }

    // Charges: reuse the engine rather than re-deriving proportions here.
    // payerId only affects who-owes-whom, which this breakdown does not use.
    const bill = group?.billSnapshot;
    const gstAmount = bill?.gst ?? 0;
    const serviceCharge = bill?.serviceCharge ?? 0;
    const totalCharges = (bill?.charges ?? []).reduce((sum, c) => sum + c.amount, 0);
    const pt = calculateSettlement({
      payerId: "",
      splitMethod: isItemwise ? "itemwise" : "equal",
      participants,
      items: allItems,
      gstAmount,
      serviceCharge,
      additionalCharges: totalCharges - gstAmount - serviceCharge,
    }).participantTotals.find((t) => t.personId === personId);

    const itemsTotal = pt?.itemsTotal ?? lines.reduce((sum, l) => sum + l.amount, 0);
    const chargesShare = pt
      ? pt.taxShare + pt.serviceChargeShare + pt.additionalChargesShare
      : 0;

    // Use the engine's total so the modal is internally consistent
    // (lines + charges = total). It is derived from the same snapshot the
    // stored settlement was built from, so the two agree; the stored amount is
    // the fallback and remains what the settlement row itself displays.
    const tx = group?.settlements.find((t) => t.fromUserId === personId);
    const total = pt?.total ?? tx?.amount ?? itemsTotal + chargesShare;

    return { lines, itemsTotal, chargesShare, total };
  };

  const handleShowItems = (personId: string, personName: string) => {
    const { lines, itemsTotal, chargesShare, total } = getPersonBreakdown(personId);
    setItemsModal({ visible: true, personName, lines, itemsTotal, chargesShare, total });
  };

  const handlePayClick = async (tx: any, receiver: Person | undefined) => {
    // The Pay action is only rendered when the receiver has a UPI ID; this is
    // just a safety net, and it stays silent rather than dead-ending.
    if (!receiver?.upiId) return;
    setActiveTx({
      from: tx.fromUserId,
      to: tx.toUserId,
      amount: tx.amount,
      receiverName: receiver.name,
      receiverUpiId: receiver.upiId,
    });
    await openUpiPayment({
      upiId: receiver.upiId,
      receiverName: receiver.name,
      amount: tx.amount,
      note: `Billy split for ${group?.title}`,
    });
  };

  const handleMarkPaid = async (success: boolean) => {
    if (success && activeTx && group) {
      await groupStore.markSettlementPaid(group.id, activeTx.from, activeTx.to, "upi");
      if (Platform.OS === "android") {
        ToastAndroid.show("🎉 Payment marked as completed.", ToastAndroid.SHORT);
      } else {
        Alert.alert("Success", "🎉 Payment marked as completed.");
      }
    }
    setActiveTx(null);
  };

  // ── Payer-side settle without UPI ────────────────────────────────────────
  // Only the person who owes may mark their own settlement as paid.
  const handleMarkPaidOtherClick = (tx: any, receiver: Person | undefined) => {
    if (tx.fromUserId !== currentUser?.uid) return;
    setPayOtherTx({
      from: tx.fromUserId,
      to: tx.toUserId,
      amount: tx.amount,
      receiverName: receiver?.name ?? "this person",
    });
  };

  const handleConfirmPaidOther = async (method: "cash" | "other") => {
    if (!payOtherTx || !group || payOtherTx.from !== currentUser?.uid) {
      setPayOtherTx(null);
      return;
    }
    await groupStore.markSettlementPaid(group.id, payOtherTx.from, payOtherTx.to, method);
    const label = method === "cash" ? "Cash" : "Payment";
    if (Platform.OS === "android") {
      ToastAndroid.show(`${label} payment marked as completed.`, ToastAndroid.SHORT);
    } else {
      Alert.alert("Marked as Paid", `${label} payment marked as completed.`);
    }
    setPayOtherTx(null);
  };

  // ── Payee-side confirmation ────────────────────────────────────────────────
  // Only the receiver of a settlement may mark it as received.
  const handleMarkReceivedClick = (tx: any, sender: Person | undefined) => {
    if (tx.toUserId !== currentUser?.uid) return;
    setReceiveTx({
      from: tx.fromUserId,
      to: tx.toUserId,
      amount: tx.amount,
      payerName: sender?.name ?? "This person",
    });
  };

  const handleConfirmReceived = async (method: "upi" | "cash" | "other") => {
    // Re-check ownership at confirm time — never mark another pair's settlement.
    if (!receiveTx || !group || receiveTx.to !== currentUser?.uid) {
      setReceiveTx(null);
      return;
    }
    await groupStore.markSettlementPaid(group.id, receiveTx.from, receiveTx.to, method);
    const label = method === "cash" ? "Cash" : method === "upi" ? "UPI" : "Payment";
    if (Platform.OS === "android") {
      ToastAndroid.show(`${label} payment marked as received.`, ToastAndroid.SHORT);
    } else {
      Alert.alert("Marked as Received", `${label} payment marked as received.`);
    }
    setReceiveTx(null);
  };

  const handleCopyUpiId = async () => {
    if (activeTx?.receiverUpiId) {
      await Clipboard.setStringAsync(activeTx.receiverUpiId);
      if (Platform.OS === "android") {
        ToastAndroid.show("UPI ID copied to clipboard.", ToastAndroid.SHORT);
      } else {
        Alert.alert("Copied", "UPI ID copied to clipboard.");
      }
    }
  };

  const handleDeleteAndRescan = async () => {
    if (!group) return;
    await groupStore.deleteGroup(group.id);
    setShowReportModal(false);
    router.replace("/(tabs)" as any);
  };

  if (!group) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </Pressable>
        </View>
        <View style={s.emptyState}>
          <Text style={s.errorText}>Group not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </Pressable>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable style={s.reportBtn} onPress={() => setShowReportModal(true)}>
            <Ionicons name="flag-outline" size={15} color="#EF4444" />
            <Text style={s.reportBtnText}>Report Error</Text>
          </Pressable>
          <View style={[s.statusBadge, group.status === "settled" && s.statusBadgeSettled]}>
            <Text style={[s.statusText, group.status === "settled" && s.statusTextSettled]}>
              {group.status.charAt(0).toUpperCase() + group.status.slice(1)}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title}>{group.title}</Text>
        <Text style={s.subtitle}>
          Created by {group.participants.find((p) => p.id === group.createdBy)?.name || "User"}
        </Text>
        <Text style={s.date}>
          {new Date(group.createdAt).toLocaleDateString(undefined, {
            day: "numeric", month: "short", year: "numeric",
          })}
        </Text>

        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Bill Amount</Text>
          <Text style={s.summaryValue}>₹{group.totalAmount.toFixed(2)}</Text>
          <Text style={s.summarySubtext}>{group.participants.length} Participants</Text>
        </View>

        <Text style={s.sectionTitle}>Settlements ({group.settlements.length})</Text>
        <View style={s.listCard}>
          {group.settlements.length === 0 ? (
            <Text style={s.emptyTransactions}>No pending settlements.</Text>
          ) : (
            group.settlements.map((tx, idx) => {
              const isCurrentUserFrom = tx.fromUserId === currentUser?.uid;
              const isCurrentUserTo = tx.toUserId === currentUser?.uid;

              const personFromObj = group.participants.find((p) => p.id === tx.fromUserId);
              const personToObj = group.participants.find((p) => p.id === tx.toUserId);

              let personFrom = personFromObj?.name || "Someone";
              let personTo = personToObj?.name || "Someone";

              if (isCurrentUserFrom) personFrom = "You";
              if (isCurrentUserTo) personTo = "You";

              const isPaid = tx.status === "paid";
              const receiverHasUpi = !!personToObj?.upiId;
              const paidVia =
                tx.paymentMethod === "cash" ? " in cash"
                : tx.paymentMethod === "upi" ? " via UPI"
                : tx.paymentMethod === "other" ? " via another method"
                : "";

              return (
                <View key={idx} style={[s.txRow, idx < group.settlements.length - 1 && s.txBorder]}>
                  <View style={s.txMain}>
                    <View style={s.txIconWrap}>
                      <Ionicons
                        name={isPaid ? "checkmark-circle" : (isCurrentUserFrom ? "arrow-up" : isCurrentUserTo ? "arrow-down" : "swap-horizontal")}
                        size={18}
                        color={isPaid ? "#10B981" : (isCurrentUserFrom ? "#EF4444" : isCurrentUserTo ? "#10B981" : "#6B7280")}
                      />
                    </View>
                    <View style={s.txTextContent}>
                      <Text style={s.txText}>
                        <Text style={s.txName}>{personFrom}</Text>{" "}
                        {personFrom === "You" ? "owe" : "owes"}{" "}
                        <Text style={s.txName}>{personTo}</Text>
                      </Text>
                      {isPaid ? (
                        <Text style={s.txPaidStatus}>
                          ✓ Paid{paidVia}{tx.paidAt ? ` on ${new Date(tx.paidAt).toLocaleDateString()}` : ""}
                        </Text>
                      ) : (
                        <Text style={s.txPendingStatus}>Pending</Text>
                      )}
                    </View>
                    <Text style={s.txAmount}>₹{tx.amount.toFixed(2)}</Text>
                  </View>

                  {/* No UPI ID on file for the receiver — state the fact and
                      offer the non-UPI paths instead of dead-ending. */}
                  {!isPaid && isCurrentUserFrom && !receiverHasUpi && (
                    <View style={s.upiMissingRow}>
                      <Ionicons name="information-circle-outline" size={15} color="#92400E" />
                      <Text style={s.upiMissingText}>
                        UPI ID not available for {personToObj?.name ?? "this person"}
                      </Text>
                    </View>
                  )}

                  {/* Actions: the item breakdown stays available once paid,
                      so a settled bill can still be inspected from History. */}
                  <View style={s.txActions}>
                      {/* Info icon — always visible to all participants */}
                      <Pressable
                        style={s.infoBtn}
                        onPress={() => handleShowItems(
                          tx.fromUserId,
                          isCurrentUserFrom ? "Your" : `${personFromObj?.name ?? "Their"}'s`
                        )}
                      >
                        <Ionicons name="receipt-outline" size={17} color="#3B82F6" />
                        <Text style={s.infoBtnText}>Items</Text>
                      </Pressable>

                      {!isPaid && (isCurrentUserFrom ? (
                        receiverHasUpi ? (
                          <Pressable style={s.payBtn} onPress={() => handlePayClick(tx, personToObj)}>
                            <Text style={s.payBtnText}>Pay ₹{tx.amount.toFixed(2)}</Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            style={s.markPaidBtn}
                            onPress={() => handleMarkPaidOtherClick(tx, personToObj)}
                          >
                            <Text style={s.markPaidBtnText}>Mark as Paid</Text>
                          </Pressable>
                        )
                      ) : isCurrentUserTo ? (
                        <Pressable
                          style={s.receivedBtn}
                          onPress={() => handleMarkReceivedClick(tx, personFromObj)}
                        >
                          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
                          <Text style={s.receivedBtnText}>Mark as Received</Text>
                        </Pressable>
                      ) : (
                        <View style={s.waitingBadge}>
                          <Text style={s.waitingText}>Waiting for payment</Text>
                        </View>
                      ))}
                  </View>
                </View>
              );
            })
          )}
        </View>

        <Text style={s.sectionTitle}>Participants ({group.participants.length})</Text>
        <View style={s.listCard}>
          {group.participants.map((p, idx) => (
            <Pressable
              key={p.id}
              style={({ pressed }) => [
                s.participantRow,
                idx < group.participants.length - 1 && s.txBorder,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => handleShowItems(p.id, p.isCurrentUser ? "Your" : `${p.name}'s`)}
              accessibilityRole="button"
              accessibilityLabel={`View ${p.name}'s share breakdown`}
            >
              <View style={[s.avatar, { backgroundColor: p.color }]}>
                <Text style={s.avatarText}>{p.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={s.participantInfo}>
                <Text style={s.participantName}>{p.isCurrentUser ? "You" : p.name}</Text>
                {p.phone ? <Text style={s.participantPhone}>{p.phone}</Text> : null}
                {p.upiId ? (
                  <View style={s.upiRow}>
                    <Ionicons name="logo-google" size={11} color="#6B7280" />
                    <Text style={s.participantUpi}>{p.upiId}</Text>
                  </View>
                ) : null}
              </View>
              <Ionicons name="receipt-outline" size={17} color="#3B82F6" />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* ── Item Breakdown Modal ── */}
      <Modal visible={!!itemsModal?.visible} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={s.modalIconWrap}>
                <Ionicons name="receipt-outline" size={24} color="#3B82F6" />
              </View>
              <Text style={s.modalTitle}>{itemsModal?.personName} Items</Text>
              <Text style={s.modalSubtitle}>Breakdown of what they ordered</Text>
            </View>

            <View style={s.itemBreakdownList}>
              {(itemsModal?.lines ?? []).map((line, i) => (
                <View key={line.key} style={[s.itemBreakdownRow, i < (itemsModal?.lines.length ?? 0) - 1 && s.itemBreakdownBorder]}>
                  <View style={s.itemBreakdownInfo}>
                    <Text style={s.itemBreakdownName} numberOfLines={1}>{line.name}</Text>
                    {line.note ? <Text style={s.itemBreakdownNote}>{line.note}</Text> : null}
                  </View>
                  <Text style={s.itemBreakdownPrice}>₹{line.amount.toFixed(2)}</Text>
                </View>
              ))}
              {(itemsModal?.lines.length ?? 0) === 0 && (
                <Text style={s.noItemsText}>No specific items found</Text>
              )}
            </View>

            {/* Items subtotal */}
            <View style={s.itemBreakdownRow}>
              <Text style={[s.itemBreakdownName, { color: "#6B7280" }]}>Items subtotal</Text>
              <Text style={[s.itemBreakdownPrice, { color: "#6B7280" }]}>
                ₹{(itemsModal?.itemsTotal ?? 0).toFixed(2)}
              </Text>
            </View>

            {/* Charges + Total */}
            {Math.abs(itemsModal?.chargesShare ?? 0) >= 0.01 && (
              <View style={s.itemBreakdownRow}>
                <Text style={[s.itemBreakdownName, { color: "#6B7280" }]}>Taxes & Charges</Text>
                <Text style={[s.itemBreakdownPrice, { color: "#6B7280" }]}>+₹{itemsModal!.chargesShare.toFixed(2)}</Text>
              </View>
            )}
            <View style={s.itemBreakdownTotal}>
              <Text style={s.itemBreakdownTotalLabel}>Total to Pay</Text>
              <Text style={s.itemBreakdownTotalValue}>₹{itemsModal?.total.toFixed(2)}</Text>
            </View>

            <Pressable style={s.modalBtnClose} onPress={() => setItemsModal(null)}>
              <Text style={s.modalBtnCloseText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* ── Report Error Modal ── */}
      <Modal visible={showReportModal} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={[s.modalIconWrap, { backgroundColor: "#FEF2F2" }]}>
                <Ionicons name="warning-outline" size={24} color="#EF4444" />
              </View>
              <Text style={s.modalTitle}>Report Bill Error</Text>
              <Text style={s.modalSubtitle}>
                {isCreator
                  ? "Found a mistake? You can delete this group and rescan the corrected bill."
                  : "Found a mistake in the bill? The bill creator can delete and rescan it with the correct details."}
              </Text>
            </View>

            <View style={{ gap: 12, marginTop: 8 }}>
              {isCreator ? (
                <Pressable
                  style={s.reportDeleteBtn}
                  onPress={() => {
                    setShowReportModal(false);
                    Alert.alert(
                      "Delete & Rescan",
                      "This will permanently delete this group and all settlement data. Everyone will need to rescan the corrected bill.\n\nAre you sure?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete Group",
                          style: "destructive",
                          onPress: handleDeleteAndRescan,
                        },
                      ]
                    );
                  }}
                >
                  <Ionicons name="trash-outline" size={16} color="#fff" />
                  <Text style={s.reportDeleteBtnText}>Delete &amp; Rescan Bill</Text>
                </Pressable>
              ) : (
                <>
                  <View style={s.reportedBanner}>
                    <Ionicons name="checkmark-circle" size={18} color="#059669" />
                    <Text style={s.reportedBannerText}>
                      Error noted. The bill creator will be able to delete and rescan.
                    </Text>
                  </View>
                  <View style={s.creatorOnlyNote}>
                    <Ionicons name="lock-closed-outline" size={14} color="#6B7280" />
                    <Text style={s.creatorOnlyNoteText}>
                      Only the bill creator can delete and repost this bill.
                    </Text>
                  </View>
                </>
              )}
              <Pressable style={s.modalBtnCancel} onPress={() => setShowReportModal(false)}>
                <Text style={s.modalBtnCancelText}>{isCreator ? "Cancel" : "Close"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>


      {/* ── Mark as Paid Modal (payer side, no UPI ID available) ── */}
      <Modal visible={!!payOtherTx} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Mark as Paid</Text>
            {payOtherTx && (
              <Text style={s.modalSubtitle}>
                How did you pay {payOtherTx.receiverName} ₹{payOtherTx.amount.toFixed(2)}?
              </Text>
            )}
            <View style={{ gap: 12, marginTop: 24 }}>
              <Pressable style={s.modalBtnSuccess} onPress={() => handleConfirmPaidOther("cash")}>
                <Text style={s.modalBtnSuccessText}>Paid in cash</Text>
              </Pressable>
              <Pressable style={s.modalBtnMethod} onPress={() => handleConfirmPaidOther("other")}>
                <Text style={s.modalBtnMethodText}>Paid another way</Text>
              </Pressable>
              <Pressable style={s.modalBtnCancel} onPress={() => setPayOtherTx(null)}>
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Mark as Received Modal (payee side) ── */}
      <Modal visible={!!receiveTx} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Mark as Received</Text>
            {receiveTx && (
              <Text style={s.modalSubtitle}>
                How did {receiveTx.payerName} pay you ₹{receiveTx.amount.toFixed(2)}?
              </Text>
            )}
            <View style={{ gap: 12, marginTop: 24 }}>
              <Pressable style={s.modalBtnSuccess} onPress={() => handleConfirmReceived("upi")}>
                <Text style={s.modalBtnSuccessText}>UPI received</Text>
              </Pressable>
              <Pressable style={s.modalBtnMethod} onPress={() => handleConfirmReceived("cash")}>
                <Text style={s.modalBtnMethodText}>Cash received</Text>
              </Pressable>
              <Pressable style={s.modalBtnMethod} onPress={() => handleConfirmReceived("other")}>
                <Text style={s.modalBtnMethodText}>Other</Text>
              </Pressable>
              <Pressable style={s.modalBtnCancel} onPress={() => setReceiveTx(null)}>
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Payment Confirmation Modal ── */}
      <Modal visible={!!activeTx} transparent animationType="fade">
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Did payment complete?</Text>
            {activeTx && (
              <Text style={s.modalSubtitle}>
                ₹{activeTx.amount.toFixed(2)} → {activeTx.receiverName}
              </Text>
            )}
            <View style={{ gap: 12, marginTop: 24 }}>
              <Pressable style={s.modalBtnSuccess} onPress={() => handleMarkPaid(true)}>
                <Text style={s.modalBtnSuccessText}>✓ Payment Successful</Text>
              </Pressable>
              <Pressable style={s.modalBtnFail} onPress={() => handleMarkPaid(false)}>
                <Text style={s.modalBtnFailText}>Payment Failed</Text>
              </Pressable>
              {activeTx?.receiverUpiId && (
                <Pressable style={s.modalBtnCopyUpi} onPress={handleCopyUpiId}>
                  <Ionicons name="copy-outline" size={15} color="#374151" />
                  <Text style={s.modalBtnCopyUpiText}>Copy UPI ID</Text>
                </Pressable>
              )}
              <Pressable style={s.modalBtnCancel} onPress={() => handleMarkPaid(false)}>
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  statusBadge: { backgroundColor: "#FEF2F2", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  statusBadgeSettled: { backgroundColor: "#ECFDF5" },
  statusText: { color: "#EF4444", fontSize: 13, fontWeight: "600" },
  statusTextSettled: { color: "#10B981" },

  reportBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#FEF2F2", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    borderWidth: 1, borderColor: "#FECACA",
  },
  reportBtnText: { color: "#EF4444", fontSize: 13, fontWeight: "600" },

  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  title: { fontSize: 32, fontWeight: "800", color: "#111827", letterSpacing: -0.5, marginTop: 16, marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#4B5563", fontWeight: "500", marginBottom: 2 },
  date: { fontSize: 15, color: "#6B7280", marginBottom: 32 },

  summaryCard: { backgroundColor: "#111827", borderRadius: 20, padding: 24, marginBottom: 32, alignItems: "center" },
  summaryLabel: { fontSize: 14, color: "#9CA3AF", fontWeight: "500", marginBottom: 8 },
  summaryValue: { fontSize: 36, color: "#ffffff", fontWeight: "800", letterSpacing: -1 },
  summarySubtext: { fontSize: 14, color: "#9CA3AF", marginTop: 8 },

  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 16 },
  listCard: { backgroundColor: "#ffffff", borderRadius: 20, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 32, overflow: "hidden" },
  emptyTransactions: { padding: 20, color: "#6B7280", textAlign: "center" },

  txRow: { paddingHorizontal: 20, paddingVertical: 16 },
  txMain: { flexDirection: "row", alignItems: "center" },
  txBorder: { borderBottomWidth: 1, borderColor: "#F3F4F6" },
  txIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#F9FAFB", alignItems: "center", justifyContent: "center", marginRight: 12 },
  txTextContent: { flex: 1 },
  txText: { fontSize: 15, color: "#4B5563" },
  txName: { fontWeight: "600", color: "#111827" },
  txPaidStatus: { fontSize: 12, color: "#10B981", fontWeight: "600", marginTop: 2 },
  txPendingStatus: { fontSize: 12, color: "#9CA3AF", fontWeight: "500", marginTop: 2 },
  txAmount: { fontSize: 16, fontWeight: "700", color: "#111827" },

  // Actions row below transaction info
  txActions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  infoBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#EFF6FF", paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE",
  },
  infoBtnText: { color: "#3B82F6", fontWeight: "600", fontSize: 13 },
  payBtn: { flex: 1, backgroundColor: "#111827", paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  payBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  waitingBadge: { flex: 1, backgroundColor: "#F3F4F6", paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  upiMissingRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: "#FFFBEB", borderWidth: 1, borderColor: "#FDE68A",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 10,
  },
  upiMissingText: { flex: 1, fontSize: 12, fontWeight: "500", color: "#92400E" },
  markPaidBtn: { flex: 1, backgroundColor: "#111827", paddingVertical: 11, borderRadius: 10, alignItems: "center" },
  markPaidBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  receivedBtn: { flex: 1, flexDirection: "row", gap: 6, backgroundColor: "#10B981", paddingVertical: 11, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  receivedBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  waitingText: { color: "#6B7280", fontWeight: "500", fontSize: 13 },

  participantRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: "#ffffff", fontSize: 14, fontWeight: "700" },
  participantInfo: { flex: 1 },
  participantName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  participantPhone: { fontSize: 13, color: "#6B7280", marginTop: 1 },
  upiRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  participantUpi: { fontSize: 12, color: "#9CA3AF", fontStyle: "italic" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: "#EF4444", fontSize: 16 },

  // Modals shared
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 20 },
  modalHeader: { alignItems: "center", marginBottom: 20 },
  modalIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#EFF6FF", alignItems: "center", justifyContent: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 4 },
  modalSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20 },

  // Item breakdown modal
  itemBreakdownList: {
    backgroundColor: "#F9FAFB", borderRadius: 12,
    borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden", marginBottom: 4,
  },
  itemBreakdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11 },
  itemBreakdownBorder: { borderBottomWidth: 1, borderColor: "#F3F4F6" },
  itemBreakdownInfo: { flex: 1, paddingRight: 12 },
  itemBreakdownNote: { fontSize: 11, color: "#6B7280", marginTop: 2 },
  itemBreakdownName: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "500", paddingRight: 12 },
  itemBreakdownPrice: { fontSize: 14, fontWeight: "600", color: "#111827" },
  noItemsText: { padding: 14, color: "#9CA3AF", fontSize: 14, textAlign: "center" },
  itemBreakdownTotal: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  itemBreakdownTotalLabel: { fontSize: 14, fontWeight: "700", color: "#9CA3AF" },
  itemBreakdownTotalValue: { fontSize: 18, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.3 },
  modalBtnClose: { backgroundColor: "#F3F4F6", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnCloseText: { color: "#374151", fontWeight: "600", fontSize: 15 },

  // Report error modal
  reportDeleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: "#EF4444", paddingVertical: 14, borderRadius: 12,
  },
  reportDeleteBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  reportedBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#ECFDF5", borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#A7F3D0",
  },
  reportedBannerText: { flex: 1, fontSize: 14, color: "#065F46", fontWeight: "500", lineHeight: 20 },
  creatorOnlyNote: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "#F9FAFB", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  creatorOnlyNoteText: { flex: 1, fontSize: 13, color: "#6B7280", lineHeight: 18 },

  // Payment modal
  modalBtnSuccess: { backgroundColor: "#10B981", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnSuccessText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  modalBtnFail: { backgroundColor: "#FEF2F2", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnFailText: { color: "#EF4444", fontWeight: "600", fontSize: 15 },
  modalBtnCopyUpi: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#F3F4F6", paddingVertical: 14, borderRadius: 12 },
  modalBtnCopyUpiText: { color: "#374151", fontWeight: "600", fontSize: 14 },
  modalBtnMethod: { backgroundColor: "#F3F4F6", paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 1, borderColor: "#E5E7EB" },
  modalBtnMethodText: { fontSize: 15, fontWeight: "700", color: "#374151" },
  modalBtnCancel: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
});
