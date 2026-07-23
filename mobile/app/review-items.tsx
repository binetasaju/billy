// ---------------------------------------------------------------------------
// app/review-items.tsx
//
// Review screen: shows extracted bill items, correct totals, and a
// zoomable bill image panel (Level 1) that opens a full-screen viewer (Level 2).
//
// Amount logic:
//   itemsTotal  = bill.subtotal  (from parser)
//   charges[]   = individual tax/charge lines in receipt order
//   grandTotal  = bill.total     (from parser)
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import {
  View, Text, Pressable, FlatList, StyleSheet,
  Alert, StatusBar, Dimensions, TextInput, Modal,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { billStore } from "../services/billStore";
import { useBillStore } from "../hooks/useBillStore";
import { nanoid } from "../utils/nanoid";
import type { BillItem, ParsedBill, ChargeInfo } from "../types/bill";
import BillImagePanel from "../components/BillImagePanel";
import FullScreenViewer from "../components/FullScreenViewer";

const { height: SH } = Dimensions.get("window");
// 42% gives enough vertical room to read the bill inline before going fullscreen
const IMAGE_PANEL_H = SH * 0.42;

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
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior="padding"
      >
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Edit title modal
// ---------------------------------------------------------------------------
function EditTitleModal({
  visible, currentName, onSave, onCancel,
}: {
  visible: boolean;
  currentName: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");

  // Pre-fill every time the modal opens
  useEffect(() => {
    if (visible) setDraft(currentName);
  }, [visible, currentName]);

  const save = () => {
    const trimmed = draft.trim();
    if (!trimmed) { Alert.alert("Error", "Title cannot be empty."); return; }
    onSave(trimmed);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={styles.modalBackdrop}
        behavior="padding"
      >
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit Bill Title</Text>
          <Text style={styles.modalLabel}>Restaurant / bill name</Text>
          <TextInput
            style={styles.modalInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="e.g. Plan B Café"
            returnKeyType="done"
            onSubmitEditing={save}
            autoFocus
            selectTextOnFocus
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Remove item modal
// ---------------------------------------------------------------------------
function RemoveItemModal({
  item, visible, onConfirm, onCancel,
}: {
  item: BillItem | null;
  visible: boolean;
  onConfirm: (id: string) => void;
  onCancel: () => void;
}) {
  if (!item) return null;
  
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Remove Item</Text>
          <Text style={{ fontSize: 15, color: "#374151", marginBottom: 20 }}>
            Are you sure you want to remove <Text style={{ fontWeight: "600" }}>{item.name}</Text> (₹{(item.price || 0).toFixed(2)}) from this bill?
          </Text>
          
          <View style={styles.modalActions}>
            <Pressable onPress={onCancel} style={styles.modalCancelBtn}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={() => onConfirm(item.id)} style={[styles.modalSaveBtn, { backgroundColor: "#EF4444" }]}>
              <Text style={styles.modalSaveText}>Remove</Text>
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
  const hasChildren  = Array.isArray(item.children)  && item.children.length  > 0;
  const hasModifiers = Array.isArray(item.modifiers)  && item.modifiers.length > 0;

  return (
    <View style={styles.itemRow}>
      {/* Name + meta */}
      <View style={styles.itemInfo}>
        <View style={styles.itemNameRow}>
          <Text style={styles.itemName}>{item.name}</Text>
        </View>
        <Text style={styles.itemMeta}>
          {item.quantity && item.quantity !== 1 ? `×${item.quantity}  ` : ""}
          ₹{item.price.toFixed(2)}
        </Text>

        {/* Unpricey child items (combo/platter sub-selections) */}
        {hasChildren && (
          <View style={styles.childrenContainer}>
            <Text style={styles.childrenLabel}>Includes:</Text>
            {(item.children as string[]).map((child, i) => (
              <Text key={i} style={styles.childItem}>• {child}</Text>
            ))}
          </View>
        )}

        {/* Priced add-on modifiers */}
        {hasModifiers && (
          <View style={styles.modifiersContainer}>
            {item.modifiers!.map((mod, i) => (
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
  const storeState = useBillStore();
  const bill = storeState?.bill;
  const items = bill?.items ?? [];
  const imageUri = storeState?.imageUri ?? "";
  
  const [editTarget, setEditTarget] = useState<BillItem | null>(null);
  const [removeTarget, setRemoveTarget] = useState<BillItem | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [chargesExpanded, setChargesExpanded] = useState(false);
  const [titleModalVisible, setTitleModalVisible] = useState(false);
  const listRef = useRef<FlatList>(null);

  // Derived state
  const restaurantName = bill?.restaurant?.trim() || "Untitled Bill";
  const isFallback = restaurantName === "Extracted Locally";

  // ── Edit title ────────────────────────────────────────────────────────────
  const handleSaveTitle = (name: string) => {
    billStore.updateRestaurantName(name);
    setTitleModalVisible(false);
  };

  // ── Edit item ─────────────────────────────────────────────────────────────
  const handleSaveEdit = (id: string, name: string, price: number) => {
    billStore.editItem(id, { name, price });
    setEditTarget(null);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    const item = items.find((it) => it.id === id);
    if (item) setRemoveTarget(item);
  };

  const confirmDelete = (id: string) => {
    billStore.removeItem(id);
    setRemoveTarget(null);
  };

  // ── Add item ──────────────────────────────────────────────────────────────
  const handleAddItem = () => {
    const newItem: BillItem = {
      id: nanoid(), name: "New Item", quantity: 1,
      amount: 0, price: 0, confidence: 1,
    };
    billStore.addItem(newItem);
    setEditTarget(newItem);
  };

  // Read totals directly from parser output (now reactive)
  const itemsTotal: number = bill?.subtotal ?? 0;
  const grandTotal: number = bill?.total    ?? 0;
  const charges: ChargeInfo[] = bill?.charges ?? [];

  // Keep internally for conditional hint — never shown as a number
  const hasSuspiciousItems = items.some((it) => (it.confidence ?? 1) < 0.8);

  if (!storeState) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Review Items</Text>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>No bill data. Please go back and scan again.</Text>
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
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Review Items</Text>

            {/* Editable restaurant / bill title */}
            <Pressable
              onPress={() => setTitleModalVisible(true)}
              style={styles.titleEditRow}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Edit bill title"
            >
              <Text style={styles.restaurantName} numberOfLines={0}>
                {restaurantName}
              </Text>
              <View style={styles.pencilIcon}>
                <Text style={styles.pencilText}>✎</Text>
              </View>
            </Pressable>

            <Text style={styles.subtitle}>Tap any item to edit if needed.</Text>
          </View>
        </View>


        {/* ── Generic verification hint (non-fallback low-confidence items) ── */}
        {!isFallback && hasSuspiciousItems && (
          <View style={styles.verificationHint}>
            <Text style={styles.verificationHintText}>Some items may need verification.</Text>
          </View>
        )}

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

        {/* ── Totals (collapsible charges) ── */}
        <View style={styles.totalsBox}>

          {/* Items subtotal */}
          {itemsTotal > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Items Total</Text>
              <Text style={styles.totalValue}>₹{itemsTotal.toFixed(2)}</Text>
            </View>
          )}

          {/* Taxes & Charges — collapsible */}
          {charges.length > 0 && (
            <>
              <Pressable
                onPress={() => setChargesExpanded((v) => !v)}
                style={styles.chargesToggleRow}
              >
                <Text style={styles.chargesToggleLabel}>
                  Taxes & Charges ({charges.length})
                </Text>
                <Text style={styles.chargesToggleChevron}>
                  {chargesExpanded ? "▴" : "▾"}
                </Text>
              </Pressable>

              {chargesExpanded && (
                <View style={styles.chargesDetail}>
                  {charges.map((charge, i) => (
                    <View key={i} style={styles.totalRow}>
                      <Text style={styles.totalLabel}>{charge.name}</Text>
                      <Text
                        style={[
                          styles.totalValue,
                          charge.amount < 0 && styles.totalValueDiscount,
                        ]}
                      >
                        {charge.amount < 0
                          ? `-₹${Math.abs(charge.amount).toFixed(2)}`
                          : `₹${charge.amount.toFixed(2)}`}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          {/* Grand total */}
          <View style={[styles.totalRow, styles.grandRow]}>
            <Text style={styles.grandLabel}>Total</Text>
            <Text style={styles.grandValue}>₹{grandTotal.toFixed(2)}</Text>
          </View>

        </View>

        {/* ── Continue ── */}
        <Pressable
          onPress={() => router.push("/participants")}
          style={({ pressed }) => [
            styles.continueBtn, 
            (pressed || items.length === 0) && { opacity: 0.8 },
            items.length === 0 && { backgroundColor: "#9CA3AF" }
          ]}
          disabled={items.length === 0}
        >
          <Text style={styles.continueBtnText}>
            {items.length === 0 ? "Add items to continue" : "Continue to Split →"}
          </Text>
        </Pressable>

      </View>

      {/* ── Edit title modal ── */}
      <EditTitleModal
        visible={titleModalVisible}
        currentName={restaurantName}
        onSave={handleSaveTitle}
        onCancel={() => setTitleModalVisible(false)}
      />

      {/* ── Edit item modal ── */}
      <EditItemModal
        item={editTarget}
        visible={!!editTarget}
        onSave={handleSaveEdit}
        onCancel={() => setEditTarget(null)}
      />

      {/* ── Remove item modal ── */}
      <RemoveItemModal
        item={removeTarget}
        visible={!!removeTarget}
        onConfirm={confirmDelete}
        onCancel={() => setRemoveTarget(null)}
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

  titleEditRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 3,
    gap: 6,
    flexWrap: "wrap",
  },
  restaurantName: {
    fontSize: 15, fontWeight: "600", color: "#1D4ED8",
    flexShrink: 1, flexWrap: "wrap",
  },
  pencilIcon: {
    width: 22, height: 22, borderRadius: 6,
    backgroundColor: "#EFF6FF",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "#BFDBFE",
  },
  pencilText: { fontSize: 12, color: "#3B82F6", lineHeight: 14 },

  subtitle: { fontSize: 12, color: "#9CA3AF", marginTop: 1 },
  verificationHint: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: "#FFFBEB", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "#FDE68A",
  },
  verificationHintText: { fontSize: 13, color: "#92400E", fontWeight: "500" },

  fallbackWarning: {
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: "#FFF7ED", borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: "#FDBA74",
  },
  fallbackWarningTitle: { fontSize: 13, fontWeight: "700", color: "#C2410C", marginBottom: 3 },
  fallbackWarningText: { fontSize: 12, color: "#9A3412", lineHeight: 18 },


  list: { flex: 1, paddingHorizontal: 16 },

  itemRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: "#fff",
    borderRadius: 12, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: "#E5E7EB",
  },

  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  itemName: { fontSize: 14, fontWeight: "500", color: "#111827", flex: 1 },
  itemMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },

  childrenContainer: {
    marginTop: 6, marginLeft: 0,
    backgroundColor: "#F9FAFB", borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
    borderLeftWidth: 2, borderLeftColor: "#D1D5DB",
  },
  childrenLabel: { fontSize: 10, fontWeight: "600", color: "#9CA3AF", marginBottom: 3, letterSpacing: 0.3 },
  childItem: { fontSize: 12, color: "#6B7280", lineHeight: 18 },

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
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  totalLabel: { fontSize: 13, color: "#6B7280" },
  totalValue: { fontSize: 13, color: "#374151" },
  totalValueDiscount: { color: "#16A34A" },
  chargesToggleRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 4,
  },
  chargesToggleLabel: { fontSize: 13, color: "#374151", fontWeight: "500" },
  chargesToggleChevron: { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  chargesDetail: { gap: 5, paddingTop: 4, paddingBottom: 2 },
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
