import { View, Text, StyleSheet, ScrollView, Pressable, Modal, ToastAndroid, Platform, Share, ActivityIndicator, Linking, useWindowDimensions } from "react-native";
import { appAlert } from "@/components/ui/AppAlert";
// Glass background behind every screen (see components/ui/glass.tsx)
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useState, useMemo, useRef } from "react";
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
import { MemberAvatar } from "@/components/ui/MemberAvatar";
import { T } from "@/constants/typography";
import { QrCode } from "@/components/ui/QrCode";
import { rupeesExact } from "../../utils/formatRupees";

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

  // "Not on Billy yet" chip → small pop-up anchored under it (WhatsApp / Invite)
  const [inviteMenu, setInviteMenu] = useState<{
    name: string;
    message: string;
    waLink: string | null;
    x: number;
    y: number;
  } | null>(null);
  const inviteChipRefs = useRef<Record<string, View | null>>({});
  const { width: screenW } = useWindowDimensions();

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

  const creatorName = group.participants.find((p) => p.id === group.createdBy)?.name || "User";
  const createdOn = new Date(group.createdAt).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
  const paidCount = group.settlements.filter((t) => t.status === "paid").length;
  const paidPct = group.settlements.length ? Math.round((paidCount / group.settlements.length) * 100) : 0;
  const outstanding = group.settlements
    .filter((t) => t.status === "pending")
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <SafeAreaView style={s.safeArea}>
      <View style={s.header}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [s.iconBtn, pressed && s.pressedBtn]}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={C.ink} />
        </Pressable>
        <View style={s.headerActions}>
          {canEdit && (
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && s.pressedBtn]}
              onPress={handleEditBill}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Edit bill"
            >
              <Ionicons name="create-outline" size={19} color={C.ink} />
            </Pressable>
          )}
          {group.status !== "closed" && (
            <Pressable
              style={({ pressed }) => [s.iconBtn, pressed && s.pressedBtn]}
              onPress={() => setShowReportModal(true)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel="Report a problem with this bill"
            >
              <Ionicons name="flag-outline" size={18} color={C.ink} />
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero: what, who, when, how much, how far along ── */}
        <View style={s.hero}>
          <View style={s.heroTop}>
            <View style={s.heroTitleWrap}>
              <Text style={s.heroTitle}>{group.title}</Text>
              <Text style={s.heroMeta}>
                {creatorName} · {createdOn}
              </Text>
            </View>
            <StatusBadge status={group.status} size="sm" />
          </View>

          <Text style={s.heroCaption}>Total</Text>
          <Text style={s.heroAmount}>{rupeesExact(group.totalAmount)}</Text>
          <Text style={s.heroSub}>
            Split between {group.participants.length} {group.participants.length === 1 ? "person" : "people"}
          </Text>

          {group.settlements.length > 0 && (
            <View style={s.progressWrap}>
              <View style={s.progressTrack}>
                <View style={[s.progressFill, { width: `${paidPct}%` as any }]} />
              </View>
              <View style={s.progressRow}>
                <Text style={s.progressText}>
                  {group.status === "closed"
                    ? `Closed${group.closedAt ? ` ${new Date(group.closedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`
                    : paidCount === group.settlements.length
                    ? "Everyone has paid 🎉"
                    : `${paidCount} of ${group.settlements.length} paid`}
                </Text>
                {group.status === "closed" ? (
                  <Text style={s.progressText}>{paidCount} of {group.settlements.length} had paid</Text>
                ) : outstanding > 0 ? (
                  <Text style={s.progressPending}>{rupeesExact(outstanding)} pending</Text>
                ) : null}
              </View>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [s.heroShare, pressed && s.pressedBtn]}
            onPress={handleShareBill}
            accessibilityRole="button"
            accessibilityLabel={notJoinedIds.size ? "Share bill link to everyone" : "Share bill"}
          >
            <Ionicons name="share-social-outline" size={16} color={C.ink} />
            <Text style={s.heroShareText}>{notJoinedIds.size ? "Share link to everyone" : "Share bill"}</Text>
          </Pressable>
        </View>

        {/* ── Closed bill ── */}
        {group.status === "closed" && (
          <View style={s.closedCard}>
            <View style={s.closedHead}>
              <View style={s.closedIcon}>
                <Ionicons name="lock-closed" size={14} color={C.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.closedTitle}>This bill is closed</Text>
                <Text style={s.closedText}>It was closed because of a mistake. Start a new bill with the correct details.</Text>
              </View>
            </View>
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
        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>People</Text>
          <Text style={s.sectionCount}>{group.participants.length}</Text>
        </View>
        {notJoinedIds.size > 0 && (
          <View style={s.hintBanner}>
            <Ionicons name="person-add-outline" size={14} color={C.primary} />
            <Text style={s.hintText}>
              {notJoinedIds.size === 1 ? "1 person hasn’t" : `${notJoinedIds.size} people haven’t`} joined yet — send
              them the link to see their share and pay.
            </Text>
          </View>
        )}

        <View style={s.listCard}>
          {group.participants.map((p) => {
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
            const whoLabel = isMe ? "Your" : `${p.name}'s`;

            return (
              <View key={p.id} style={s.personCard}>
                {/* Top: avatar · name + status · share. Tap to see their items. */}
                <Pressable
                  style={({ pressed }) => [s.personTop, pressed && s.pressedRow]}
                  onPress={() => handleShowItems(p.id, whoLabel)}
                  accessibilityRole="button"
                  accessibilityLabel={`Review ${isMe ? "your" : `${p.name}'s`} items`}
                >
                  <MemberAvatar name={p.name} color={p.color} authUid={p.authUid} isMe={isMe} size={40} style={s.avatarGap} />

                  <View style={s.personBody}>
                    {/* Name gets the full width on its own line — same size for everyone, never "…" */}
                    <Text style={s.personName}>{isMe ? "You" : p.name}</Text>

                    {/* Second line: status (left) · amount + Billy box (right) */}
                    <View style={s.personLine2}>
                      <View style={s.statusLine}>
                        {tx ? (
                          <>
                            <Text style={s.personStatus}>
                              {isMe ? `You owe ${counterpart?.name ?? "them"}` : "Owes you"}
                            </Text>
                            <View
                              style={[
                                s.statusPill,
                                isPaid ? s.pillPaid : isCancelled ? s.pillCancelled : s.pillPending,
                              ]}
                            >
                              <Text
                                style={[
                                  s.statusPillText,
                                  isPaid ? s.pillPaidText : isCancelled ? s.pillCancelledText : s.pillPendingText,
                                ]}
                              >
                                {isPaid
                                  ? `Paid${paidVia}${tx.paidAt ? ` · ${new Date(tx.paidAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}`
                                  : isCancelled
                                  ? "Cancelled"
                                  : "Pending"}
                              </Text>
                            </View>
                          </>
                        ) : (
                          <Text style={s.personStatus}>
                            {isPayer ? "Paid the bill" : isMe ? "Your share" : "Share of the bill"}
                          </Text>
                        )}
                      </View>
                      <View style={s.shareCol}>
                        <Text style={s.personShare}>{rupeesExact(share)}</Text>
                        <View style={s.itemsLink}>
                          <Ionicons name="receipt-outline" size={11} color={C.textMuted} />
                          <Text style={s.itemsLinkText}>Items</Text>
                        </View>
                      </View>
                      {/* Billy status box, right of the amount:
                          green "On Billy" when they've joined · amber "Not on Billy yet?" dropdown otherwise */}
                      {group.inCloud && (isMe || !!p.authUid) && (
                        <View style={[s.billyBox, s.billyBoxOn]} accessibilityLabel={`${isMe ? "You are" : `${p.name} is`} on Billy`}>
                          <Text style={[s.billyBoxText, s.billyBoxOnText]}>On{"\n"}Billy</Text>
                          <Ionicons name="checkmark-circle" size={13} color={C.statusSettledText} />
                        </View>
                      )}
                      {notJoinedIds.has(p.id) && group.inviteCode && (
                        <Pressable
                          ref={(r) => { inviteChipRefs.current[p.id] = r; }}
                          style={({ pressed }) => [s.billyBox, s.billyBoxOff, pressed && s.pressedBtn]}
                          onPress={() => {
                            const message = buildPersonInviteMessage({
                              name: p.name,
                              billTitle: group.title,
                              share: group.settlements.find((t) => t.fromUserId === p.id)?.amount,
                              link: billLink(group.id, group.inviteCode!),
                            });
                            const waLink = whatsappChatLink(p.phone, message);
                            const chip = inviteChipRefs.current[p.id];
                            if (!chip) return;
                            chip.measureInWindow((x, y, w, h) =>
                              setInviteMenu({ name: p.name, message, waLink, x: x + w, y: y + h + 6 })
                            );
                          }}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityLabel={`${p.name} is not on Billy yet. Invite them`}
                        >
                          <Text style={[s.billyBoxText, s.billyBoxOffText]}>Not on{"\n"}Billy yet?</Text>
                          <Ionicons name="chevron-down" size={11} color={C.statusActiveText} />
                        </Pressable>
                      )}
                    </View>
                  </View>
                </Pressable>

                {/* Actions: only while a payment is pending */}
                {tx && isPending && (
                  <View style={s.actionsRow}>
                    {!isMe && myUpiOk && (
                      <Pressable
                        style={({ pressed }) => [s.btnGhost, pressed && s.pressedBtn]}
                        onPress={() => handleShowQrClick(tx, p)}
                        accessibilityRole="button"
                        accessibilityLabel={`Show a UPI QR code for ${p.name} to pay ₹${tx.amount.toFixed(2)}`}
                      >
                        <Ionicons name="qr-code-outline" size={15} color={C.ink} />
                        <Text style={s.btnGhostText}>Show QR</Text>
                      </Pressable>
                    )}
                    {!isMe && (
                      <Pressable
                        style={({ pressed }) => [s.btnSolid, pressed && s.pressedBtn]}
                        onPress={() => handleMarkReceivedClick(tx, p)}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ₹${tx.amount.toFixed(2)} from ${p.name} as received`}
                      >
                        <Ionicons name="checkmark-done" size={15} color={C.white} />
                        <Text style={s.btnSolidText}>Received</Text>
                      </Pressable>
                    )}
                    {/* Paid another way (cash, bank transfer…) — next to UPI Pay */}
                    {isMe && receiverHasUpi && (
                      <Pressable
                        style={({ pressed }) => [s.btnGhost, pressed && s.pressedBtn]}
                        onPress={() => handleMarkPaidOtherClick(tx, counterpart)}
                        accessibilityRole="button"
                        accessibilityLabel={`Mark ₹${tx.amount.toFixed(2)} as paid another way`}
                      >
                        <Ionicons name="checkmark-done" size={15} color={C.ink} />
                        <Text style={s.btnGhostText}>Mark paid</Text>
                      </Pressable>
                    )}
                    {isMe && (
                      <Pressable
                        style={({ pressed }) => [s.btnSolid, pressed && s.pressedBtn]}
                        onPress={() => receiverHasUpi ? handlePayClick(tx, counterpart) : handleMarkPaidOtherClick(tx, counterpart)}
                        accessibilityRole="button"
                        accessibilityLabel={receiverHasUpi ? `Pay ₹${tx.amount.toFixed(2)} with UPI` : "Mark as paid"}
                      >
                        <Ionicons name={receiverHasUpi ? "flash" : "checkmark-done"} size={15} color={C.white} />
                        <Text style={s.btnSolidText}>
                          {receiverHasUpi ? `Pay ${rupeesExact(tx.amount)}` : "Mark paid"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}

                {/* You owe someone with no UPI ID on file */}
                {tx && isPending && isMe && !receiverHasUpi && (
                  <View style={s.noteRow}>
                    <Ionicons name="information-circle-outline" size={14} color={C.warningDark} />
                    <Text style={s.noteText}>
                      No UPI ID for {counterpart?.name ?? "this person"} — pay them directly, then tap Mark paid.
                    </Text>
                  </View>
                )}

              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ── Invite pop-up (anchored under the "Not on Billy yet" chip) ── */}
      <Modal visible={!!inviteMenu} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setInviteMenu(null)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setInviteMenu(null)} accessibilityLabel="Close">
          {inviteMenu && (
            <View
              onStartShouldSetResponder={() => true}
              style={[
                s.popover,
                { top: inviteMenu.y, left: Math.max(16, Math.min(inviteMenu.x - POPOVER_W, screenW - POPOVER_W - 16)) },
              ]}
            >
              <Text style={s.popoverTitle}>Invite {inviteMenu.name}</Text>
              {inviteMenu.waLink && (
                <Pressable
                  style={({ pressed }) => [s.popoverRow, pressed && s.popoverRowPressed]}
                  onPress={() => {
                    const link = inviteMenu.waLink!;
                    setInviteMenu(null);
                    Linking.openURL(link).catch(() =>
                      appAlert.alert("WhatsApp not available", "Use Send invite link to share it with another app.")
                    );
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Invite ${inviteMenu.name} on WhatsApp`}
                >
                  <View style={[s.popoverIcon, { backgroundColor: "#25D366" }]}>
                    <Ionicons name="logo-whatsapp" size={15} color={C.white} />
                  </View>
                  <Text style={s.popoverRowText}>WhatsApp</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [s.popoverRow, pressed && s.popoverRowPressed]}
                onPress={() => {
                  const message = inviteMenu.message;
                  setInviteMenu(null);
                  void Share.share({ message }).catch(() => {});
                }}
                accessibilityRole="button"
                accessibilityLabel={`Send ${inviteMenu.name} their invite link`}
              >
                <View style={[s.popoverIcon, { backgroundColor: C.primarySoft }]}>
                  <Ionicons name="paper-plane-outline" size={14} color={C.primary} />
                </View>
                <Text style={s.popoverRowText}>Send invite link</Text>
              </Pressable>
            </View>
          )}
        </Pressable>
      </Modal>

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
                Confirm you paid ₹{payOtherTx.amount.toFixed(2)} to {payOtherTx.receiverName} (cash, bank transfer or any other way). This can&apos;t be undone.
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

const POPOVER_W = 210;

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.border,
  },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  pressedBtn: { opacity: 0.7 },
  pressedRow: { opacity: 0.6 },

  scroll: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 48 },

  // Hero card — black, like Home
  hero: { backgroundColor: C.primaryDark, borderRadius: 28, padding: 22, marginBottom: 28 },
  heroTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 26 },
  heroTitleWrap: { flex: 1 },
  heroTitle: { ...T.title2, color: C.onDark, letterSpacing: 0 },
  heroMeta: { ...T.footnote, color: C.onDarkMuted, marginTop: 4 },
  heroCaption: { ...T.caption, color: C.onDarkMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  heroAmount: {
    fontSize: 34, lineHeight: 40, fontWeight: "800", color: C.onDark, letterSpacing: -1,
    marginTop: 4, fontVariant: ["tabular-nums"],
  },
  heroSub: { ...T.footnote, color: C.onDarkMuted, marginTop: 4 },
  progressWrap: { marginTop: 20, gap: 8 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: C.onDarkLine, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: "#34D399" },
  progressRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  progressText: { ...T.footnote, color: C.onDarkMuted, fontWeight: "500" },
  progressPending: { ...T.footnote, color: "#FCD34D", fontWeight: "600", fontVariant: ["tabular-nums"] },
  heroShare: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 22, height: 46, borderRadius: 23, backgroundColor: C.white,
  },
  heroShareText: { ...T.headline, color: C.ink, letterSpacing: 0 },

  // Closed bill
  closedCard: {
    backgroundColor: C.glass, borderRadius: 20, padding: 16, marginBottom: 28, gap: 14,
    borderWidth: 1, borderColor: C.glassBorder,
  },
  closedHead: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  closedIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surfaceAlt, alignItems: "center", justifyContent: "center" },
  closedTitle: { ...T.headline, color: C.ink },
  closedText: { ...T.footnote, color: C.textMuted, marginTop: 3, lineHeight: 17 },
  mainBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.primary, height: 46, borderRadius: 23,
  },
  mainBtnText: { ...T.headline, color: C.white, letterSpacing: 0 },

  // People
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, paddingHorizontal: 4 },
  sectionTitle: { ...T.title3, color: C.ink, letterSpacing: 0 },
  sectionCount: {
    ...T.caption, fontWeight: "700", color: C.textMuted, backgroundColor: C.surfaceAlt,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: "hidden",
  },
  hintBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: C.primarySoft, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  hintText: { flex: 1, ...T.footnote, color: C.primary, lineHeight: 17 },

  // One soft card per person, with breathing room between them
  listCard: { gap: 10 },
  personCard: {
    backgroundColor: C.glass, borderRadius: 20, borderWidth: 1, borderColor: C.glassBorder,
    paddingHorizontal: 16, paddingVertical: 16,
  },
  personTop: { flexDirection: "row", alignItems: "flex-start" },
  avatarGap: { marginRight: 12 },
  personBody: { flex: 1, minWidth: 0 },
  personName: { ...T.callout, fontWeight: "600", color: C.ink },
  personLine2: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  statusLine: { flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 6, rowGap: 4 },
  personStatus: { ...T.footnote, color: C.textMuted, flexShrink: 1 },
  statusPill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, flexShrink: 0 },
  statusPillText: { fontSize: 10.5, lineHeight: 14, fontWeight: "700" },
  pillPending: { backgroundColor: C.statusActiveBg },
  pillPendingText: { color: C.statusActiveText },
  pillPaid: { backgroundColor: C.statusSettledBg },
  pillPaidText: { color: C.statusSettledText },
  pillCancelled: { backgroundColor: C.surfaceAlt },
  pillCancelledText: { color: C.textMuted },
  shareCol: { alignItems: "flex-end", marginLeft: 12 },
  personShare: { ...T.callout, fontWeight: "700", color: C.ink, fontVariant: ["tabular-nums"] },
  itemsLink: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4 },
  itemsLinkText: { ...T.caption, color: C.textMuted },

  // Pending payment buttons — equal width, under the name
  actionsRow: { flexDirection: "row", gap: 8, marginTop: 14, marginLeft: 52 },
  btnSolid: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 38, borderRadius: 19, backgroundColor: C.primary,
  },
  btnSolidText: { color: C.white, fontSize: 13, fontWeight: "700" },
  btnGhost: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    height: 38, borderRadius: 19, backgroundColor: C.glassStrong, borderWidth: 1, borderColor: C.borderStrong,
  },
  btnGhostText: { color: C.ink, fontSize: 13, fontWeight: "600" },

  noteRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 10, marginLeft: 52,
    backgroundColor: C.warningSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  noteText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: C.statusActiveText },

  // Billy status box — two short lines, fixed width so amounts line up
  billyBox: {
    width: 72, marginLeft: 12, paddingVertical: 6, paddingHorizontal: 6,
    borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4,
  },
  billyBoxText: { fontSize: 10, lineHeight: 12, fontWeight: "700", textAlign: "center" },
  billyBoxOn: { backgroundColor: C.statusSettledBg, borderColor: "#A7D7C0" },
  billyBoxOnText: { color: C.statusSettledText },
  billyBoxOff: { backgroundColor: C.statusActiveBg, borderColor: "#FCD9A0" },
  billyBoxOffText: { color: C.statusActiveText },
  popover: {
    position: "absolute", width: POPOVER_W, backgroundColor: C.surface, borderRadius: 16, padding: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 20, elevation: 10,
  },
  popoverTitle: { ...T.caption, color: C.textMuted, fontWeight: "600", paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4 },
  popoverRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 8, paddingVertical: 8, borderRadius: 10 },
  popoverRowPressed: { backgroundColor: C.surfaceAlt },
  popoverIcon: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  popoverRowText: { ...T.subhead, fontWeight: "600", color: C.ink },

  qrWrap: { alignItems: "center", marginTop: 16, gap: 10 },
  qrUpiId: { fontSize: 13, fontWeight: "600", color: C.textMuted },
  reportEditBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12 },

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
