import { View, Text, StyleSheet, SafeAreaView, ScrollView, Pressable, Modal, ToastAndroid, Platform, Alert } from "react-native";
import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { groupStore } from "../../services/groupStore";
import { authStore } from "../../services/authStore";
import { openUpiPayment } from "../../services/upi";
import type { Person, BillItem } from "../../types/bill";

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

  // Item breakdown modal state
  const [itemsModal, setItemsModal] = useState<{
    visible: boolean;
    personName: string;
    items: BillItem[];
    itemsTotal: number;
    chargesShare: number;
    total: number;
  } | null>(null);

  // Report error modal
  const [showReportModal, setShowReportModal] = useState(false);

  const group = groupStore.getGroupById(id);
  const currentUser = authStore.get().user;
  const isCreator = currentUser?.uid === group?.createdBy;

  // ── Build item breakdown for a participant ──────────────────────────────────
  const getPersonItems = (personId: string) => {
    const person = group?.participants.find((p) => p.id === personId);
    const allItems = (group?.billSnapshot?.items ?? []) as BillItem[];
    const personItems = (person?.itemIds ?? [])
      .map((itemId) => allItems.find((it) => it.id === itemId))
      .filter(Boolean) as BillItem[];
    const itemsTotal = personItems.reduce((s, it) => s + (it.price ?? it.amount ?? 0), 0);

    // Find settlement for this person to get their total
    const tx = group?.settlements.find((t) => t.fromUserId === personId);
    const total = tx?.amount ?? itemsTotal;
    const chargesShare = total - itemsTotal;

    return { personItems, itemsTotal, chargesShare, total };
  };

  const handleShowItems = (personId: string, personName: string) => {
    const { personItems, itemsTotal, chargesShare, total } = getPersonItems(personId);
    setItemsModal({
      visible: true,
      personName,
      items: personItems,
      itemsTotal,
      chargesShare,
      total,
    });
  };

  const handlePayClick = async (tx: any, receiver: Person | undefined) => {
    if (!receiver?.upiId) {
      Alert.alert(
        "Cannot Pay",
        `${receiver?.name ?? "This person"} has not configured a UPI ID.`
      );
      return;
    }
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
                        <Text style={s.txPaidStatus}>✓ Paid on {new Date(tx.paidAt!).toLocaleDateString()}</Text>
                      ) : (
                        <Text style={s.txPendingStatus}>Pending</Text>
                      )}
                    </View>
                    <Text style={s.txAmount}>₹{tx.amount.toFixed(2)}</Text>
                  </View>

                  {/* Pay row: info icon + pay button side by side */}
                  {!isPaid && (
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

                      {isCurrentUserFrom ? (
                        <Pressable style={s.payBtn} onPress={() => handlePayClick(tx, personToObj)}>
                          <Text style={s.payBtnText}>Pay ₹{tx.amount.toFixed(2)}</Text>
                        </Pressable>
                      ) : (
                        <View style={s.waitingBadge}>
                          <Text style={s.waitingText}>Waiting for payment</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        <Text style={s.sectionTitle}>Participants ({group.participants.length})</Text>
        <View style={s.listCard}>
          {group.participants.map((p, idx) => (
            <View key={p.id} style={[s.participantRow, idx < group.participants.length - 1 && s.txBorder]}>
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
            </View>
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
              {(itemsModal?.items ?? []).map((it, i) => (
                <View key={it.id ?? i} style={[s.itemBreakdownRow, i < (itemsModal?.items.length ?? 0) - 1 && s.itemBreakdownBorder]}>
                  <Text style={s.itemBreakdownName} numberOfLines={1}>{it.name}</Text>
                  <Text style={s.itemBreakdownPrice}>₹{(it.price ?? it.amount ?? 0).toFixed(2)}</Text>
                </View>
              ))}
              {(itemsModal?.items.length ?? 0) === 0 && (
                <Text style={s.noItemsText}>No specific items found</Text>
              )}
            </View>

            {/* Charges + Total */}
            {(itemsModal?.chargesShare ?? 0) > 0 && (
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
  modalBtnCancel: { paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  modalBtnCancelText: { color: "#6B7280", fontWeight: "600", fontSize: 15 },
});
