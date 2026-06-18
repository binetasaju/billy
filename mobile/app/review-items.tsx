// ---------------------------------------------------------------------------
// app/review-items.tsx
//
// Review screen: shows extracted bill items, correct totals, and a tappable
// bill image that opens a full-screen pinch/zoom/pan viewer.
//
// Amount logic:
//   itemsTotal  = bill.subtotal  (from parser)  OR  sum(item.price) as fallback
//   gstTotal    = sum(bill.taxes[].amount)       OR  bill.gst as fallback
//   grandTotal  = bill.total     (from parser)   OR  itemsTotal + gstTotal + ...
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, Pressable, FlatList, StyleSheet,
  Alert, StatusBar, Dimensions, TextInput, Modal,
} from "react-native";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { billStore } from "../services/billStore";
import { nanoid } from "../utils/nanoid";
import type { BillItem, ParsedBill } from "../types/bill";
import BillImagePanel from "../components/BillImagePanel";
import FullScreenViewer from "../components/FullScreenViewer";

const { height: SH } = Dimensions.get("window");
const IMAGE_PANEL_H = SH * 0.38;

// ---------------------------------------------------------------------------
// Edit item modal
// ---------------------------------------------------------------------------
function EditItemModal({
  item, visible, onSave, onCancel,
}: {
  item: BillItem | null;
  visible: boolean;
  onSave: (id: string, name: string, price: number) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");

  useEffect(() => {
    if (item) { setName(item.name); setPrice(String(item.price)); }
  }, [item]);

  const save = () => {
    const p = parseFloat(price);
    if (!name.trim()) { Alert.alert("Error", "Item name cannot be empty."); return; }
    if (isNaN(p) || p < 0) { Alert.alert("Error", "Enter a valid price."); return; }
    onSave(item!.id, name.trim(), p);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit Item</Text>
          <Text style={styles.modalLabel}>Item name</Text>
          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chicken Biryani"
            returnKeyType="next"
          />
          <Text style={styles.modalLabel}>Price (₹)</Text>
          <TextInput
            style={styles.modalInput}
            value={price}
            onChangeText={setPrice}
            placeholder="0.00"
            keyboardType="decimal-pad"
            returnKeyType="done"
          />
          <View style={styles.modalActions}>
            <Pressable onPress={onCancel} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} style={styles.modalSaveBtn}>
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Item row
// ---------------------------------------------------------------------------
function ItemRow({
  item, onEdit, onDelete,
}: {
  item: BillItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const confidence = item.confidence ?? 1;
  const lowConf = confidence < 0.8;

  return (
    <View style={[styles.itemRow, lowConf && styles.itemRowLowConf]}>
      {/* Name + meta */}
      <View style={styles.itemInfo}>
        <View style={styles.itemNameRow}>
          <Text style={styles.itemName}>{item.name}</Text>
          {lowConf && (
            <View style={styles.confBadge}>
              <Text style={styles.confBadgeText}>⚠ {Math.round(confidence * 100)}%</Text>
            </View>
          )}
        </View>
        <Text style={styles.itemMeta}>
          {item.quantity && item.quantity !== 1 ? `×${item.quantity}  ` : ""}
          ₹{item.price.toFixed(2)}
        </Text>
        {item.modifiers && item.modifiers.length > 0 && (
          <View style={styles.modifiersContainer}>
            {item.modifiers.map((mod, i) => (
              <View key={i} style={styles.modifierRow}>
                <Text style={styles.modifierItem}>• {mod.name}</Text>
                <Text style={styles.modifierPrice}>₹{mod.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.itemActions}>
        <Pressable onPress={onEdit} style={styles.actionBtn} hitSlop={8}>
          <Text style={styles.actionBtnText}>✎</Text>
        </Pressable>
        <Pressable onPress={onDelete} style={[styles.actionBtn, styles.deleteActionBtn]} hitSlop={8}>
          <Text style={[styles.actionBtnText, { color: "#EF4444" }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function ReviewItemsScreen() {
  const router = useRouter();
  const [bill, setBill] = useState<ParsedBill | null>(null);
  const [items, setItems] = useState<BillItem[]>([]);
  const [imageUri, setImageUri] = useState<string>("");
  const [editTarget, setEditTarget] = useState<BillItem | null>(null);
  const [parseError, setParseError] = useState<string>("");
  const [viewerOpen, setViewerOpen] = useState(false);
  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    const stored = billStore.get();
    if (!stored) { setParseError("No bill data. Please go back and scan again."); return; }
    setBill(stored.bill);
    setImageUri(stored.imageUri ?? "");
    setItems(stored.bill.items as BillItem[]);
    console.log("[Review] bill.imageUri:", stored.imageUri);
  }, []);

  // ── Edit ──────────────────────────────────────────────────────────────────
  const handleSaveEdit = (id: string, name: string, price: number) => {
    setItems((prev) => prev.map((it) =>
      it.id === id ? { ...it, name, price, amount: price } : it
    ));
    setEditTarget(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    Alert.alert("Remove Item", "Remove this item from the bill?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        setItems((prev) => prev.filter((it) => it.id !== id));
      }},
    ]);
  };

  // ── Add item ──────────────────────────────────────────────────────────────
  const handleAddItem = () => {
    const newItem: BillItem = {
      id: nanoid(), name: "New Item", quantity: 1,
      amount: 0, price: 0, confidence: 1,
    };
    setItems((prev) => [...prev, newItem]);
    setEditTarget(newItem);
  };

  // ── Totals — read directly from parser output, never computed ────────────
  //
  // All three values come straight from ParsedBill (set by parseBill.ts).
  // We do NOT sum item.price — that would pick up rows the parser tagged
  // as items but that are actually totals/subtotals on the receipt.
  //
  //   itemsTotal  = bill.subtotal  (pre-tax food/drink sum)
  //   gstTotal    = bill.gst       (total tax, as extracted)
  //   grandTotal  = bill.total     (final payable amount)

  const itemsTotal: number  = bill?.subtotal ?? 0;
  const gstTotal: number    = bill?.gst      ?? 0;
  const sc: number          = bill?.serviceCharge ?? 0;
  const tip: number         = bill?.tip      ?? 0;
  const discount: number    = bill?.discount ?? 0;
  const grandTotal: number  = bill?.total    ?? 0;

  const expectedTotal = itemsTotal + gstTotal + sc + tip - discount;
  if (bill && Math.abs(expectedTotal - grandTotal) > 1) {
    console.warn("[Summary] Total mismatch");
  }

  const lowConfCount = items.filter((it) => (it.confidence ?? 1) < 0.8).length;

  if (parseError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Review Items</Text>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{parseError}</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.container}>

        {/* ── Bill image thumbnail (tap to expand) ── */}
        {imageUri ? (
          <BillImagePanel
            uri={imageUri}
            height={IMAGE_PANEL_H}
            onTap={() => setViewerOpen(true)}
          />
        ) : (
          <View style={{ height: IMAGE_PANEL_H, justifyContent: "center", alignItems: "center", backgroundColor: "#E5E7EB" }}>
            <Text style={{ color: "#9CA3AF" }}>No bill image available</Text>
          </View>
        )}

        {/* ── Header ── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Review Items</Text>
            {bill?.restaurant ? <Text style={styles.restaurantName}>{bill.restaurant}</Text> : null}
            {bill?.date || bill?.billNumber ? (
              <Text style={styles.subtitle}>
                {[bill.billNumber && `#${bill.billNumber}`, bill.date].filter(Boolean).join("  ·  ")}
              </Text>
            ) : null}
          </View>
          {lowConfCount > 0 && (
            <View style={styles.warningBadge}>
              <Text style={styles.warningBadgeText}>⚠ {lowConfCount} low confidence</Text>
            </View>
          )}
        </View>

        {/* ── Item list ── */}
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(it) => it.id}
          style={styles.list}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              onEdit={() => setEditTarget(item)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          ListFooterComponent={
            <Pressable onPress={handleAddItem} style={styles.addBtn}>
              <Text style={styles.addBtnText}>+ Add Item Manually</Text>
            </Pressable>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>No items. Add them manually or rescan.</Text>
          }
        />

        {/* ── Totals ── */}
        <View style={styles.totalsBox}>
          {itemsTotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Items</Text>
              <Text style={styles.totalValue}>₹{itemsTotal.toFixed(2)}</Text>
            </View>
          )}
          {gstTotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST / Tax</Text>
              <Text style={styles.totalValue}>₹{gstTotal.toFixed(2)}</Text>
            </View>
          )}
          {sc > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Service Charge</Text>
              <Text style={styles.totalValue}>₹{sc.toFixed(2)}</Text>
            </View>
          )}
          {tip > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Tip</Text>
              <Text style={styles.totalValue}>₹{tip.toFixed(2)}</Text>
            </View>
          )}
          {discount > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={styles.totalValue}>-₹{discount.toFixed(2)}</Text>
            </View>
          )}
          <View style={[styles.totalRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>₹{grandTotal.toFixed(2)}</Text>
          </View>
        </View>

        {/* ── Continue ── */}
        <Pressable
          onPress={() => router.push("/split")}
          style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.continueBtnText}>Continue to Split →</Text>
        </Pressable>

      </View>

      {/* ── Edit modal ── */}
      <EditItemModal
        item={editTarget}
        visible={!!editTarget}
        onSave={handleSaveEdit}
        onCancel={() => setEditTarget(null)}
      />

      {/* ── Full-screen image viewer ── */}
      <FullScreenViewer
        uri={imageUri}
        visible={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },

  headerRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start",
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6,
  },
  title: { fontSize: 22, fontWeight: "700", color: "#111827", letterSpacing: -0.5 },
  restaurantName: { fontSize: 15, fontWeight: "600", color: "#1D4ED8", marginTop: 1 },
  subtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },
  warningBadge: {
    backgroundColor: "#FEF3C7", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#FDE68A",
  },
  warningBadgeText: { fontSize: 11, color: "#92400E", fontWeight: "600" },

  list: { flex: 1, paddingHorizontal: 16 },

  itemRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: "#E5E7EB",
  },
  itemRowLowConf: { borderColor: "#FECACA" },

  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  itemName: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  confBadge: {
    backgroundColor: "#FEE2E2", borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
    marginTop: 2,
  },
  confBadgeText: { fontSize: 10, color: "#991B1B", fontWeight: "600" },
  itemMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  modifiersContainer: { marginTop: 6, marginLeft: 2, gap: 2 },
  modifierRow: { flexDirection: "row", justifyContent: "space-between" },
  modifierItem: { fontSize: 11, color: "#6B7280", flex: 1, paddingRight: 8 },
  modifierPrice: { fontSize: 11, color: "#6B7280" },

  itemActions: { flexDirection: "row", gap: 6 },
  actionBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center",
  },
  deleteActionBtn: { backgroundColor: "#FEF2F2" },
  actionBtnText: { fontSize: 14, color: "#374151" },

  addBtn: {
    margin: 4, marginBottom: 16, padding: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: "#D1D5DB", borderStyle: "dashed", alignItems: "center",
  },
  addBtnText: { color: "#6B7280", fontWeight: "500", fontSize: 14 },
  emptyText: { textAlign: "center", color: "#9CA3AF", marginTop: 32, fontSize: 14 },

  totalsBox: {
    backgroundColor: "#fff", marginHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: "#E5E7EB", padding: 14, marginBottom: 12, gap: 6,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { fontSize: 13, color: "#6B7280" },
  totalValue: { fontSize: 13, color: "#374151" },
  grandRow: { borderTopWidth: 1, borderTopColor: "#E5E7EB", paddingTop: 8, marginTop: 4 },
  grandLabel: { fontSize: 16, fontWeight: "700", color: "#111827" },
  grandValue: { fontSize: 16, fontWeight: "700", color: "#111827" },

  continueBtn: {
    backgroundColor: "#111827", marginHorizontal: 16, marginBottom: 24,
    paddingVertical: 16, borderRadius: 12, alignItems: "center",
  },
  continueBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },

  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 40,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: "#111827", marginBottom: 20 },
  modalLabel: { fontSize: 13, color: "#6B7280", marginBottom: 6 },
  modalInput: {
    borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 10,
    padding: 12, fontSize: 15, color: "#111827", marginBottom: 16,
  },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 4 },
  modalCancelBtn: {
    flex: 1, padding: 14, borderRadius: 12, borderWidth: 1,
    borderColor: "#E5E7EB", alignItems: "center",
  },
  modalCancelText: { color: "#374151", fontWeight: "600" },
  modalSaveBtn: {
    flex: 1, padding: 14, borderRadius: 12,
    backgroundColor: "#111827", alignItems: "center",
  },
  modalSaveText: { color: "#fff", fontWeight: "600" },

  errorBox: {
    backgroundColor: "#FEF2F2", borderRadius: 12, padding: 16, margin: 24,
    borderWidth: 1, borderColor: "#FECACA",
  },
  errorText: { fontSize: 14, color: "#B91C1C", marginBottom: 12 },
  backBtn: {
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#FECACA",
    borderRadius: 10, paddingVertical: 10, alignItems: "center",
  },
  backBtnText: { color: "#991B1B", fontWeight: "600", fontSize: 14 },
});
