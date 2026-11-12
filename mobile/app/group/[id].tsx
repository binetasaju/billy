import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ToastAndroid, Platform, Share, ActivityIndicator, Linking } from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useState, useMemo } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { groupStore } from "../../services/groupStore";
import { billStore } from "../../services/billStore";
import { canEditBill, payerOf } from "../../services/billEditing";
import { useGroups } from "../../hooks/useGroups";
import { authStore } from "../../services/authStore";
import {
  billLink,
  buildBillShareMessage,
  buildUpiUri,
  buildPersonInviteMessage,
  isValidUpiId,
  openUpiPayment,
  whatsappChatLink,
} from "../../services/upi";
import { upiIntent } from "../../modules/upi-intent";
import { parseUpiResponse } from "../../services/upiResult";
import { calculateSettlement } from "../../services/calculateSettlement";
import type { Person, BillItem } from "../../types/bill";
import { C } from "@/constants/colors";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { T } from "@/constants/typography";
import { QrCode } from "@/components/ui/QrCode";

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

  // Payee-side "Show QR" — the person who owes scans it with any UPI app
  const [qrTx, setQrTx] = useState<{
    from: string;
    to: string;
    amount: number;
    payerName: string;
    uri: string;
    upiId: string;
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
  const { groups, isLoading: groupsLoading } = useGroups();
  const group = useMemo(() => groups.find((g) => g.id === id), [groups, id]);
  const currentUser = authStore.get().user;
  // Shows the "scan to pay" QR when you are owed money and have a valid UPI ID.
  const myUpiOk = !!currentUser?.upiId && isValidUpiId(currentUser.upiId);
  const isCreator = currentUser?.uid === group?.createdBy;
  // Creator can edit until the first payment is marked.
  const canEdit = canEditBill(group, currentUser?.uid);
  // A mistake found after someone paid: the creator can close the bill.
  const canClose =
    isCreator && group?.status === "active" && !!group?.settlements.some((t) => t.status === "paid");

  const handleEditBill = () => {
    if (!group || !canEdit) return;
    billStore.loadForEdit(group);
    // "Split an Amount" bills have no receipt to review — edit the amounts directly.
    router.push((group.splitMethod === "custom" ? "/custom-split" : "/review-items") as any);
  };

  // ── Build a person's share breakdown ───────────────────────────────────────
  // Shared items are divided by the number of people who claimed them, and the
  // charge share comes from the existing settlement engine run over the stored
  // bill snapshot — so this works for the payer too, who has no settlement row.
  // Stored settlement amounts are never altered here; they stay authoritative
  // for what is owed.
  const getPersonBreakdown = (personId: string) => {
    // Custom-amount bills: the agreed amount IS the breakdown.
    if (group?.splitMethod === "custom") {
      const amount = group.customAmounts?.[personId] ?? 0;
      return {
        lines: [{ key: "__custom", name: "Agreed amount", amount, note: "custom split" }] as BreakdownLine[],
        itemsTotal: amount,
        chargesShare: 0,
        total: amount,
      };
    }

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
    const pending = {
      from: tx.fromUserId,
      to: tx.toUserId,
      amount: tx.amount,
      receiverName: receiver.name,
      receiverUpiId: receiver.upiId,
    };

    // Android with the UpiIntent module: open the UPI app for a result and
    // mark the payment ourselves when it reports SUCCESS.
    if (upiIntent && group) {
      const url = buildUpiUri({ upiId: receiver.upiId, receiverName: receiver.name, amount: tx.amount, note: `Billy split for ${group.title}` });
      try {
        const reply = await upiIntent.pay(url, "Pay with");
        if (!reply.launched) {
          await Clipboard.setStringAsync(receiver.upiId);
          appAlert.alert("No UPI app found", `Install GPay, PhonePe or Paytm. ${receiver.name}'s UPI ID has been copied.`);
          return;
        }
        const result = parseUpiResponse(reply.response);
        if (result.outcome === "success") {
          await groupStore.markSettlementPaid(group.id, tx.fromUserId, tx.toUserId, "upi", result.reference);
          if (Platform.OS === "android") ToastAndroid.show("✓ Paid via UPI", ToastAndroid.SHORT);
          return;
        }
        if (result.outcome === "failure") {
          appAlert.alert("Payment didn\u2019t go through", "The UPI app reported a failure. Nothing was marked as paid — you can try again.");
          return;
        }
      } catch (e) {
        console.warn("[UPI] intent failed:", e);
      }
      // No clear answer from the UPI app → ask (the existing pop-up).
      setActiveTx(pending);
      return;
    }

    setActiveTx(pending);
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
        appAlert.alert("Success", "🎉 Payment marked as completed.");
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

  // Payer confirms once — no payment-method question.
  const handleConfirmPaidOther = async () => {
    if (!payOtherTx || !group || payOtherTx.from !== currentUser?.uid) {
      setPayOtherTx(null);
      return;
    }
    await groupStore.markSettlementPaid(group.id, payOtherTx.from, payOtherTx.to);
    if (Platform.OS === "android") {
      ToastAndroid.show("Marked as paid.", ToastAndroid.SHORT);
    } else {
      appAlert.alert("Marked as paid", "The payment is marked as paid.");
    }
    setPayOtherTx(null);
  };

  // ── Share the whole bill (one message for the group chat) ─────────────────
  const handleShareBill = async () => {
    if (!group) return;
    const me = authStore.get().user;
    const payerId = payerOf(group);
    const payer = group.participants.find((p) => p.id === payerId);
    const payerIsMe = payerId === me?.uid;
    const nameOf = (id: string) => group.participants.find((p) => p.id === id)?.name ?? "Someone";
    const payerUpiId = payerIsMe ? me?.upiId : payer?.upiId;
    const message = buildBillShareMessage({
      title: group.title,
      date: new Date(group.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      total: group.totalAmount,
      payerName: payer?.name ?? (payerIsMe ? me?.name ?? "me" : "the payer"),
      payerUpiId,
      rows: group.settlements.map((t) => ({ name: nameOf(t.fromUserId), amount: t.amount, status: t.status })),
      closed: group.status === "closed",
      link: billLink(group.id, group.inCloud ? group.inviteCode : undefined),
    });
    try {
      await Share.share({ message });
    } catch (err) {
      console.error("[Group] Share failed:", err);
    }
    if (payerIsMe && (!me?.upiId || !isValidUpiId(me.upiId))) {
      appAlert.alert("Tip", "Add your UPI ID in Profile so shared bills tell friends where to pay you.");
    }
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

  // Payee shows a UPI QR with the exact amount (in person, any UPI app).
  const handleShowQrClick = (tx: any, sender: Person | undefined) => {
    if (tx.toUserId !== currentUser?.uid || !group) return;
    const upiId = currentUser?.upiId?.trim();
    if (!upiId || !isValidUpiId(upiId)) return;
    const uri = buildUpiUri({
      upiId,
      receiverName: currentUser?.name || "Billy user",
      amount: tx.amount,
      note: `Billy split for ${group.title}`,
    });
    setQrTx({ from: tx.fromUserId, to: tx.toUserId, amount: tx.amount, payerName: sender?.name ?? "They", uri, upiId });
  };

  // From the QR pop-up: once the money has arrived, mark it received.
  const handleQrReceived = () => {
    if (!qrTx) return;
    const { from, to, amount, payerName } = qrTx;
    setQrTx(null);
    setReceiveTx({ from, to, amount, payerName });
  };

  // Payee confirms once — no payment-method question.
  const handleConfirmReceived = async () => {
    // Re-check ownership at confirm time — never mark another pair's settlement.
    if (!receiveTx || !group || receiveTx.to !== currentUser?.uid) {
      setReceiveTx(null);
      return;
    }
    await groupStore.markSettlementPaid(group.id, receiveTx.from, receiveTx.to);
    if (Platform.OS === "android") {
      ToastAndroid.show("Marked as received.", ToastAndroid.SHORT);
    } else {
      appAlert.alert("Marked as received", "The payment is marked as received.");
    }
    setReceiveTx(null);
  };

  const handleCopyUpiId = async () => {
    if (activeTx?.receiverUpiId) {
      await Clipboard.setStringAsync(activeTx.receiverUpiId);
      if (Platform.OS === "android") {
        ToastAndroid.show("UPI ID copied to clipboard.", ToastAndroid.SHORT);
      } else {
        appAlert.alert("Copied", "UPI ID copied to clipboard.");
      }
    }
  };

  const handleCloseBill = async () => {
    if (!group) return;
    const closed = await groupStore.closeBill(group.id, currentUser?.uid);
    if (closed && Platform.OS === "android") ToastAndroid.show("Bill closed.", ToastAndroid.SHORT);
  };

  const handleDeleteAndRescan = async () => {
    if (!group) return;
    await groupStore.deleteGroup(group.id);
    setShowReportModal(false);
    router.replace("/(tabs)" as any);
  };

  // Still reading saved bills (e.g. opened straight from a shared link).
  if (!group && groupsLoading) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={[s.emptyState, { flex: 1, justifyContent: "center" }]}>
          <ActivityIndicator color={C.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!group) {
    return (
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={24} color={C.ink} />
          </Pressable>
        </View>
        <View style={s.emptyState}>
          <Text style={s.errorText}>Bill not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Who paid the restaurant (everyone's settlement points at them).
  const payerId = payerOf(group);

  // People who haven't joined this bill in Billy yet (they get an invite line in their row).
  const notJoinedIds = new Set(
    group.inCloud && group.status !== "closed"
      ? group.participants.filter((p) => !p.authUid && p.id !== currentUser?.uid).map((p) => p.id)
      : []
  );

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={C.ink} />
        </Pressable>
        {/* Minimal: round icon buttons that match the back button */}
        <View style={s.headerActions}>
          {canEdit && (
            <Pressable
              style={({ pressed }) => [s.backBtn, pressed && s.pressedBtn]}
              onPress={handleEditBill}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Edit bill"
            >
              <Ionicons name="create-outline" size={20} color={C.ink} />
            </Pressable>
          )}
          {group.status !== "closed" && (
            <Pressable
              style={({ pressed }) => [s.backBtn, pressed && s.pressedBtn]}
              onPress={() => setShowReportModal(true)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Report a problem with this bill"
            >
              <Ionicons name="flag-outline" size={19} color={C.ink} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.title}>{group.title}</Text>
        <Text style={s.subtitle}>
          Created by {group.participants.find((p) => p.id === group.createdBy)?.name || "User"}
        </Text>
        <View style={s.dateRow}>
          <Text style={s.date}>
            {new Date(group.createdAt).toLocaleDateString(undefined, {
              day: "numeric", month: "short", year: "numeric",
            })}
          </Text>
          <StatusBadge status={group.status} size="sm" />
        </View>

        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Bill Amount</Text>
          <Text style={s.summaryValue}>₹{group.totalAmount.toFixed(2)}</Text>
          <Text style={s.summarySubtext}>{group.participants.length} Participants</Text>
          {group.settlements.length > 0 && (() => {
            const paidCount = group.settlements.filter((t) => t.status === "paid").length;
            const pct = Math.round((paidCount / group.settlements.length) * 100);
            const outstanding = group.settlements
              .filter((t) => t.status === "pending")
              .reduce((sum, t) => sum + t.amount, 0);
            return (
              <View style={s.progressWrap}>
                <View style={s.progressTrack}>
                  <View style={[s.progressFill, { width: `${pct}%` as any }]} />
                </View>
                <Text style={s.progressText}>
                  {group.status === "closed"
                    ? `Closed${group.closedAt ? ` on ${new Date(group.closedAt).toLocaleDateString()}` : ""} · ${paidCount} of ${group.settlements.length} had paid`
                    : paidCount === group.settlements.length
                    ? "Everyone has paid 🎉"
                    : `${paidCount} of ${group.settlements.length} paid · ₹${outstanding.toFixed(2)} pending`}
                </Text>
              </View>
            );
          })()}
        </View>

        {/* ── Share: one button (invites per person are in their People row) ── */}
        <Pressable
          style={({ pressed }) => [s.shareBillBtn, pressed && s.pressedBtn]}
          onPress={handleShareBill}
          accessibilityRole="button"
          accessibilityLabel={notJoinedIds.size ? "Share bill link to everyone" : "Share bill"}
        >
          <Ionicons name="share-social-outline" size={17} color={C.primary} />
          <Text style={s.shareBillText}>{notJoinedIds.size ? "Share link to everyone" : "Share bill"}</Text>
        </Pressable>

        {/* ── Closed bill ── */}
        {group.status === "closed" && (
          <View style={s.closedCard}>
            <View style={s.closedHead}>
              <Ionicons name="lock-closed" size={16} color={C.textMuted} />
              <Text style={s.closedTitle}>This bill is closed</Text>
            </View>
            <Text style={s.closedText}>It was closed because of a mistake. Start a new bill with the correct details.</Text>
            <Pressable
              style={({ pressed }) => [s.mainBtn, pressed && s.pressedBtn]}
              onPress={() => router.replace("/(tabs)" as any)}
              accessibilityRole="button"
            >
              <Ionicons name="add" size={17} color={C.white} />
              <Text style={s.mainBtnText}>Start a new bill</Text>
            </Pressable>
          </View>
        )}

        {/* ── People: who had what + their share + payments that involve you ── */}
        <Text style={[s.sectionTitle, notJoinedIds.size > 0 && { marginBottom: 4 }]}>People ({group.participants.length})</Text>
        {notJoinedIds.size > 0 && (
          <Text style={s.sectionHint}>
            {notJoinedIds.size === 1 ? "1 person hasn’t" : `${notJoinedIds.size} people haven’t`} joined yet. Send them
            the link to see their share and pay.
          </Text>
        )}
        <View style={s.listCard}>
          {group.participants.map((p, idx) => {
            const me = currentUser?.uid;
            const isMe = p.id === me;
            const isPayer = p.id === payerId;
            const b = getPersonBreakdown(p.id);
            const share = group.customAmounts?.[p.id] ?? b.total;

            // The payment on this row, only when it involves you:
            //   your own row → what you owe the payer; someone else's row → what they owe you.
            const tx = isMe
              ? group.settlements.find((t) => t.fromUserId === me)
              : group.settlements.find((t) => t.fromUserId === p.id && t.toUserId === me);
            const isPending = tx?.status === "pending";
            const isPaid = tx?.status === "paid";
            const isCancelled = tx?.status === "cancelled";
            const counterpart = tx ? group.participants.find((x) => x.id === (isMe ? tx.toUserId : tx.fromUserId)) : undefined;
            const receiverHasUpi = isMe && !!counterpart?.upiId;
            const paidVia =
              tx?.paymentMethod === "cash" ? " in cash"
              : tx?.paymentMethod === "upi" ? " via UPI"
              : "";

            return (
              <View key={p.id} style={[s.personRow, idx < group.participants.length - 1 && s.txBorder]}>
                {/* Two lines: name … share  /  status … buttons. Nothing is cut off. */}
                <View style={[s.whoAvatar, s.personAvatar, { backgroundColor: p.color ?? C.textSubtle }]}>
                  <Text style={s.whoAvatarText}>{p.name.charAt(0).toUpperCase()}</Text>
                </View>

                <View style={s.personBody}>
                  <View style={s.personLine}>
                    <Text style={[s.personName, s.txName]}>{isMe ? "You" : p.name}</Text>
                    <Text style={s.personShare}>₹{share.toFixed(2)}</Text>
                  </View>

                  <View style={[s.personLine, s.personLineBottom]}>
                    <Text style={s.personStatus}>
                      {tx ? (
                        <>
                          {isMe ? `You owe ${counterpart?.name ?? "them"} · ` : "Owes you · "}
                          {isPaid ? (
                            <Text style={s.txPaidStatus}>
                              ✓ Paid{paidVia}{tx.paidAt ? ` ${new Date(tx.paidAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
                            </Text>
                          ) : isCancelled ? (
                            <Text style={s.txCancelledStatus}>Cancelled</Text>
                          ) : (
                            <Text style={s.txPendingStatus}>Pending</Text>
                          )}
                        </>
                      ) : isPayer ? (
                        "Paid the bill"
                      ) : isMe ? (
                        "Your share"
                      ) : (
                        "Share of the bill"
                      )}
                    </Text>

                    <View style={s.personActions}>
                      <Pressable
                        style={({ pressed }) => [s.itemsIconBtn, pressed && s.pressedBtn]}
                        onPress={() => handleShowItems(p.id, isMe ? "Your" : `${p.name}'s`)}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Review ${isMe ? "your" : `${p.name}'s`} items`}
                      >
                        <Ionicons name="receipt-outline" size={16} color={C.primary} />
                      </Pressable>

                      {tx && isPending && !isMe && myUpiOk && (
                        <Pressable
                          style={({ pressed }) => [s.itemsIconBtn, pressed && s.pressedBtn]}
                          onPress={() => handleShowQrClick(tx, p)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={`Show a UPI QR code for ${p.name} to pay ₹${tx.amount.toFixed(2)}`}
                        >
                          <Ionicons name="qr-code-outline" size={16} color={C.primary} />
                        </Pressable>
                      )}
                      {tx && isPending && !isMe && (
                        <Pressable
                          style={({ pressed }) => [s.actionPill, pressed && s.pressedBtn]}
                          onPress={() => handleMarkReceivedClick(tx, p)}
                          accessibilityRole="button"
                          accessibilityLabel={`Mark ₹${tx.amount.toFixed(2)} from ${p.name} as received`}
                        >
                          <Ionicons name="checkmark-done" size={14} color={C.white} />
                          <Text style={s.actionPillText}>Received</Text>
                        </Pressable>
                      )}
                      {tx && isPending && isMe && (
                        <Pressable
                          style={({ pressed }) => [s.actionPill, pressed && s.pressedBtn]}
                          onPress={() => receiverHasUpi ? handlePayClick(tx, counterpart) : handleMarkPaidOtherClick(tx, counterpart)}
                          accessibilityRole="button"
                          accessibilityLabel={receiverHasUpi ? `Pay ₹${tx.amount.toFixed(2)} with UPI` : "Mark as paid"}
                        >
                          <Ionicons name={receiverHasUpi ? "flash" : "checkmark-done"} size={14} color={C.white} />
                          <Text style={s.actionPillText}>{receiverHasUpi ? "Pay" : "Mark paid"}</Text>
                        </Pressable>
                      )}
                    </View>
                  </View>

                  {/* You owe someone with no UPI ID on file */}
                  {tx && isPending && isMe && !receiverHasUpi && (
                    <View style={s.upiMissingRow}>
                      <Ionicons name="information-circle-outline" size={15} color="#92400E" />
                      <Text style={s.upiMissingText}>
                        No UPI ID for {counterpart?.name ?? "this person"} — pay them directly, then tap Mark paid
                      </Text>
                    </View>
                  )}

                  {/* Not in Billy yet: invite them (WhatsApp when we have their number, or any app) */}
                  {notJoinedIds.has(p.id) && group.inviteCode && (() => {
                    const message = buildPersonInviteMessage({
                      name: p.name,
                      billTitle: group.title,
                      share: group.settlements.find((t) => t.fromUserId === p.id)?.amount,
                      link: billLink(group.id, group.inviteCode),
                    });
                    const waLink = whatsappChatLink(p.phone, message);
                    return (
                      <View style={s.inviteLine}>
                        <Text style={s.inviteLineText}>Not in Billy yet</Text>
                        {waLink && (
                          <Pressable
                            style={({ pressed }) => [s.inviteChip, s.waChip, pressed && s.pressedBtn]}
                            onPress={() =>
                              Linking.openURL(waLink).catch(() =>
                                appAlert.alert("WhatsApp not available", "Use Invite to send the link with another app.")
                              )
                            }
                            hitSlop={4}
                            accessibilityRole="button"
                            accessibilityLabel={`Invite ${p.name} on WhatsApp`}
                          >
                            <Ionicons name="logo-whatsapp" size={13} color={C.white} />
                            <Text style={s.waChipText}>WhatsApp</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={({ pressed }) => [s.inviteChip, pressed && s.pressedBtn]}
                          onPress={() => void Share.share({ message }).catch(() => {})}
                          hitSlop={4}
                          accessibilityRole="button"
                          accessibilityLabel={`Send ${p.name} their invite`}
                        >
                          <Ionicons name="paper-plane-outline" size={13} color={C.primary} />
                          <Text style={s.inviteChipText}>Invite</Text>
                        </Pressable>
                      </View>
                    );
                  })()}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Item Breakdown Modal ── */}
      <Modal visible={!!itemsModal?.visible} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <View style={s.modalIconWrap}>
                <Ionicons name="receipt-outline" size={24} color={C.primaryMuted} />
              </View>
              <Text style={s.modalTitle}>{itemsModal?.personName} Items</Text>
              <Text style={s.modalSubtitle}>Breakdown of what they ordered</Text>
            </View>

            <View style={s.itemBreakdownList}>
              {(itemsModal?.lines ?? []).map((line, i) => (
                <View key={line.key} style={[s.itemBreakdownRow, i < (itemsModal?.lines.length ?? 0) - 1 && s.itemBreakdownBorder]}>
                  <View style={s.itemBreakdownInfo}>
                    <Text style={s.itemBreakdownName}>{line.name}</Text>
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
              <Text style={[s.itemBreakdownName, { color: C.textMuted }]}>Items subtotal</Text>
              <Text style={[s.itemBreakdownPrice, { color: C.textMuted }]}>
                ₹{(itemsModal?.itemsTotal ?? 0).toFixed(2)}
              </Text>
            </View>

            {/* Charges + Total */}
            {Math.abs(itemsModal?.chargesShare ?? 0) >= 0.01 && (
              <View style={s.itemBreakdownRow}>
                <Text style={[s.itemBreakdownName, { color: C.textMuted }]}>Taxes & Charges</Text>
                <Text style={[s.itemBreakdownPrice, { color: C.textMuted }]}>+₹{itemsModal!.chargesShare.toFixed(2)}</Text>
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
              <View style={[s.modalIconWrap, { backgroundColor: C.dangerSoft }]}>
                <Ionicons name="warning-outline" size={24} color={C.danger} />
              </View>
              <Text style={s.modalTitle}>Report Bill Error</Text>
              <Text style={s.modalSubtitle}>
                {canEdit
                  ? "Found a mistake? Edit the bill — everyone's share is recalculated. Editing is possible until someone pays."
                  : isCreator && canClose
                  ? "Someone has already paid, so this bill can't be edited. Close it — unpaid amounts are cancelled — then start a new bill with the correct details."
                  : isCreator
                  ? "This bill can't be edited. You can delete it and rescan the corrected bill."
                  : "Found a mistake in the bill? The bill creator can delete and rescan it with the correct details."}
              </Text>
            </View>

            <View style={{ gap: 12, marginTop: 8 }}>
              {canEdit && (
                <Pressable
                  style={s.reportEditBtn}
                  onPress={() => { setShowReportModal(false); handleEditBill(); }}
                >
                  <Ionicons name="create-outline" size={16} color="#fff" />
                  <Text style={s.reportDeleteBtnText}>Edit Bill</Text>
                </Pressable>
              )}
              {canClose && (
                <Pressable
                  style={s.reportEditBtn}
                  onPress={() => {
                    setShowReportModal(false);
                    appAlert.alert(
                      "Close this bill?",
                      "Unpaid amounts will be cancelled and nobody else can pay it. Payments already made stay recorded. Then start a new bill with the correct details.",
                      [
                        { text: "Cancel", style: "cancel" },
                        { text: "Close Bill", style: "destructive", onPress: handleCloseBill },
                      ]
                    );
                  }}
                >
                  <Ionicons name="lock-closed-outline" size={16} color="#fff" />
                  <Text style={s.reportDeleteBtnText}>Close Bill</Text>
                </Pressable>
              )}
              {isCreator ? (
                <Pressable
                  style={s.reportDeleteBtn}
                  onPress={() => {
                    setShowReportModal(false);
                    appAlert.alert(
                      "Delete & Rescan",
                      "This will permanently delete this bill and all its payment records. Everyone will need to rescan the corrected bill.\n\nAre you sure?",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete Bill",
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
                    <Ionicons name="checkmark-circle" size={18} color={C.successDark} />
                    <Text style={s.reportedBannerText}>
                      Error noted. The bill creator will be able to delete and rescan.
                    </Text>
                  </View>
                  <View style={s.creatorOnlyNote}>
                    <Ionicons name="lock-closed-outline" size={14} color={C.textMuted} />
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
            <Text style={s.modalTitle}>Mark as paid?</Text>
            {payOtherTx && (
              <Text style={s.modalSubtitle}>
                Confirm you paid ₹{payOtherTx.amount.toFixed(2)} to {payOtherTx.receiverName}. This can&apos;t be undone.
              </Text>
            )}
            <View style={{ gap: 12, marginTop: 24 }}>
              <Pressable style={s.modalBtnConfirm} onPress={handleConfirmPaidOther}>
                <Text style={s.modalBtnSuccessText}>Yes, paid</Text>
              </Pressable>
              <Pressable style={s.modalBtnCancel} onPress={() => setPayOtherTx(null)}>
                <Text style={s.modalBtnCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── UPI QR Modal (payee side) ── */}
      <Modal visible={!!qrTx} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setQrTx(null)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Scan to pay ₹{qrTx?.amount.toFixed(2)}</Text>
            {qrTx && (
              <Text style={s.modalSubtitle}>
                Ask {qrTx.payerName} to scan this with GPay, PhonePe, Paytm or any UPI app.
              </Text>
            )}
            {qrTx && (
              <View style={s.qrWrap}>
                <QrCode value={qrTx.uri} size={220} />
                <Text style={s.qrUpiId}>{qrTx.upiId}</Text>
              </View>
            )}
            <View style={{ gap: 12, marginTop: 20 }}>
              <Pressable style={s.modalBtnConfirm} onPress={handleQrReceived}>
                <Text style={s.modalBtnSuccessText}>I&apos;ve received it</Text>
              </Pressable>
              <Pressable style={s.modalBtnCancel} onPress={() => setQrTx(null)}>
                <Text style={s.modalBtnCancelText}>Close</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Mark as Received Modal (payee side) ── */}
      <Modal visible={!!receiveTx} transparent animationType="fade" statusBarTranslucent>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Mark as received?</Text>
            {receiveTx && (
              <Text style={s.modalSubtitle}>
                Confirm you received ₹{receiveTx.amount.toFixed(2)} from {receiveTx.payerName}. This can&apos;t be undone.
              </Text>
            )}
            <View style={{ gap: 12, marginTop: 24 }}>
              <Pressable style={s.modalBtnConfirm} onPress={handleConfirmReceived}>
                <Text style={s.modalBtnSuccessText}>Yes, received</Text>
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
                  <Ionicons name="copy-outline" size={15} color={C.text} />
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
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },

  reportEditBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12 },

  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  title: { ...T.largeTitle, color: C.ink, marginTop: 8, marginBottom: 4 },
  subtitle: { fontSize: 14, color: C.text, fontWeight: "500", marginBottom: 2 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 32 },
  date: { fontSize: 13, color: C.textMuted },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },

  summaryCard: { backgroundColor: C.primaryDark, borderRadius: 20, padding: 24, marginBottom: 32, alignItems: "center" },
  summaryLabel: { fontSize: 12, color: C.onDarkMuted, fontWeight: "500", marginBottom: 8 },
  summaryValue: { fontSize: 27, color: C.white, fontWeight: "800", letterSpacing: -1 },
  summarySubtext: { fontSize: 12, color: C.onDarkMuted, marginTop: 8 },
  progressWrap: { alignSelf: "stretch", marginTop: 16, gap: 8 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.onDarkLine, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: "#34D399" },
  progressText: { fontSize: 12, color: C.onDarkMuted, textAlign: "center", fontWeight: "500" },

  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.ink, marginBottom: 16 },
  listCard: { backgroundColor: C.glass, borderRadius: 20, borderWidth: 1, borderColor: C.glassBorder, marginBottom: 32, overflow: "hidden" },
  emptyTransactions: { padding: 20, color: C.textMuted, textAlign: "center" },

  txRow: { paddingHorizontal: 16, paddingVertical: 14 },
  txMain: { flexDirection: "row", alignItems: "center" },
  txBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.surfaceAlt },
  txIconWrap: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", marginRight: 12 },
  txTextContent: { flex: 1 },
  txText: { fontSize: 13, color: C.text },
  txName: { fontWeight: "600", color: C.ink },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  whoAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  whoAvatarText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  whoItems: { fontSize: 11, color: C.textMuted, marginTop: 2, lineHeight: 13 },
  whoTotal: { fontSize: 13, fontWeight: "700", color: C.ink },
  txPaidStatus: { fontSize: 11, color: C.statusSettledText, fontWeight: "600", marginTop: 2 },
  txCancelledStatus: { fontSize: 11, color: C.textMuted, fontWeight: "600", marginTop: 2 },
  closedCard: {
    backgroundColor: C.surfaceAlt, borderRadius: 16, padding: 16, marginBottom: 20, gap: 10,
    borderWidth: 1, borderColor: C.border,
  },
  closedHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  closedTitle: { fontSize: 14, fontWeight: "700", color: C.ink },
  closedText: { fontSize: 12, color: C.textMuted, lineHeight: 17 },
  txPendingStatus: { fontSize: 11, color: C.statusActiveText, fontWeight: "600", marginTop: 2 },
  txAmount: { fontSize: 14, fontWeight: "700", color: C.ink },
  personRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  personAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 12 },
  personBody: { flex: 1 },
  // Each line: text on the left (wraps), fixed-width content on the right.
  personLine: { flexDirection: "row", alignItems: "center", gap: 10 },
  personLineBottom: { marginTop: 6 },
  personName: { flex: 1, fontSize: 14, lineHeight: 19 },
  personShare: { fontSize: 14, fontWeight: "700", color: C.ink, lineHeight: 19, fontVariant: ["tabular-nums"] },
  personStatus: { flex: 1, fontSize: 12, color: C.textMuted, lineHeight: 16 },
  personActions: { flexDirection: "row", alignItems: "center", gap: 6 },
  txSub: { fontSize: 11, marginTop: 2 },
  txAmountInline: { fontSize: 12, fontWeight: "700", color: C.ink },
  itemsIconBtn: {
    width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center",
    backgroundColor: C.primarySoft,
  },
  actionPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: C.primary, paddingHorizontal: 12, height: 30, borderRadius: 15,
  },
  actionPillText: { color: C.white, fontSize: 12, fontWeight: "700" },
  qrWrap: { alignItems: "center", marginTop: 16, gap: 10 },
  qrUpiId: { fontSize: 13, fontWeight: "600", color: C.textMuted },

  // Actions row below transaction info
  txActions: { marginTop: 12, gap: 10 },
  chipRow: { flexDirection: "row", gap: 8 },
  shareBillBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    paddingVertical: 13, borderRadius: 14, marginTop: -16, marginBottom: 24,
    backgroundColor: C.primarySoft, borderWidth: 1, borderColor: C.primary,
  },
  shareBillText: { fontSize: 14, fontWeight: "700", color: C.primary },
  sectionHint: { fontSize: 12, color: C.textMuted, lineHeight: 17, marginBottom: 12 },
  // "Not in Billy yet · WhatsApp · Invite" line inside a person's row
  inviteLine: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border,
  },
  inviteLineText: { flex: 1, fontSize: 11, color: C.textMuted, fontStyle: "italic" },
  inviteChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: C.primarySoft,
  },
  inviteChipText: { color: C.primary, fontSize: 11, fontWeight: "700" },
  waChip: { backgroundColor: "#25D366" },
  waChipText: { color: C.white, fontSize: 11, fontWeight: "700" },
  chipBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.border,
  },
  chipBtnText: { color: C.primary, fontWeight: "600", fontSize: 12 },
  mainBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.primary, paddingVertical: 13, borderRadius: 14,
  },
  mainBtnText: { color: C.white, fontSize: 13, fontWeight: "600" },
  pressedBtn: { opacity: 0.75 },
  waitingRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: C.statusActiveBg, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14,
  },
  waitingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.statusActiveDot },
  upiMissingRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: C.warningSoft, borderWidth: 1, borderColor: "#FDE68A",
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginTop: 10,
  },
  upiMissingText: { flex: 1, fontSize: 11, fontWeight: "500", color: "#92400E" },
  waitingText: { color: C.statusActiveText, fontWeight: "600", fontSize: 12 },

  participantRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", marginRight: 12 },
  avatarText: { color: C.white, fontSize: 12, fontWeight: "700" },
  participantInfo: { flex: 1 },
  participantName: { fontSize: 13, fontWeight: "600", color: C.ink },
  participantPhone: { fontSize: 12, color: C.textMuted, marginTop: 1 },
  upiRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  participantUpi: { fontSize: 11, color: C.textSubtle, fontStyle: "italic" },

  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: C.danger, fontSize: 14 },

  // Modals shared
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  modalCard: { backgroundColor: "#fff", borderRadius: 24, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 6 },
  modalHeader: { alignItems: "center", marginBottom: 20 },
  modalIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.primarySoft, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: "700", color: C.ink, textAlign: "center", marginBottom: 4 },
  modalSubtitle: { fontSize: 12, color: C.textMuted, textAlign: "center", lineHeight: 17 },

  // Item breakdown modal
  itemBreakdownList: {
    backgroundColor: C.bg, borderRadius: 12,
    borderWidth: 1, borderColor: C.border, overflow: "hidden", marginBottom: 4,
  },
  itemBreakdownRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 11 },
  itemBreakdownBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.surfaceAlt },
  itemBreakdownInfo: { flex: 1, paddingRight: 12 },
  itemBreakdownNote: { fontSize: 11, color: C.textMuted, marginTop: 2 },
  itemBreakdownName: { flex: 1, fontSize: 12, color: C.ink, fontWeight: "500", paddingRight: 12 },
  itemBreakdownPrice: { fontSize: 12, fontWeight: "600", color: C.ink },
  noItemsText: { padding: 14, color: C.textSubtle, fontSize: 12, textAlign: "center" },
  itemBreakdownTotal: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: C.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16,
  },
  itemBreakdownTotalLabel: { fontSize: 12, fontWeight: "700", color: C.textSubtle },
  itemBreakdownTotalValue: { fontSize: 15, fontWeight: "800", color: C.white, letterSpacing: -0.3 },
  modalBtnClose: { backgroundColor: C.surfaceAlt, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnCloseText: { color: C.text, fontWeight: "600", fontSize: 13 },

  // Report error modal
  reportDeleteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.danger, paddingVertical: 14, borderRadius: 12,
  },
  reportDeleteBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  reportedBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: C.successSoft, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: "#A7F3D0",
  },
  reportedBannerText: { flex: 1, fontSize: 12, color: "#065F46", fontWeight: "500", lineHeight: 17 },
  creatorOnlyNote: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: C.bg, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: C.border,
  },
  creatorOnlyNoteText: { flex: 1, fontSize: 12, color: C.textMuted, lineHeight: 15 },

  // Payment modal
  modalBtnSuccess: { backgroundColor: C.success, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnConfirm: { backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnSuccessText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  modalBtnFail: { backgroundColor: C.dangerSoft, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnFailText: { color: C.danger, fontWeight: "600", fontSize: 13 },
  modalBtnCopyUpi: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: C.surfaceAlt, paddingVertical: 14, borderRadius: 12 },
  modalBtnCopyUpiText: { color: C.text, fontWeight: "600", fontSize: 12 },
  modalBtnCancel: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnCancelText: { color: C.textMuted, fontWeight: "600", fontSize: 13 },
});
