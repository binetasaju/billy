import { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { billStore } from "../services/billStore";
import type { ParsedBill, BillItem } from "../services/parseBill";

// ---------------------------------------------------------------------------
// Types — internal row with a stable ID for FlatList
// ---------------------------------------------------------------------------
type BillRow = BillItem & { id: string };

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------
export default function ReviewItemsScreen() {
  const router = useRouter();
  const [bill, setBill] = useState<ParsedBill | null>(null);
  const [items, setItems] = useState<BillRow[]>([]);
  const [parseError, setParseError] = useState<string>("");

  // ── Load from billStore on mount ──────────────────────────────────────────
  useEffect(() => {
    const stored = billStore.get();
    if (!stored) {
      setParseError("No bill data found. Please go back and scan again.");
      return;
    }
    setBill(stored);
    const rows: BillRow[] = stored.items.map((item, idx) => ({
      ...item,
      id: String(idx),
    }));
    setItems(rows);
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleDelete = (id: string) => {
    Alert.alert("Remove Item", "Remove this item from the bill?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          setItems((prev) => prev.filter((item) => item.id !== id)),
      },
    ]);
  };

  const handleAddItem = () => {
    Alert.alert("Add Item", "Manual entry — coming soon.");
  };

  const handleContinue = () => {
    router.push("/split");
  };

  // ── Derived totals ────────────────────────────────────────────────────────
  const itemsTotal = items.reduce((sum, item) => sum + item.price, 0);
  const gst = bill?.gst ?? 0;
  const serviceCharge = bill?.serviceCharge ?? 0;
  const grandTotal = itemsTotal + gst + serviceCharge;

  // ── No data state ─────────────────────────────────────────────────────────
  if (parseError) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Review Items</Text>
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{parseError}</Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.retryButtonText}>← Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.title}>Review Items</Text>
      {bill?.restaurant ? (
        <Text style={styles.restaurantName}>{bill.restaurant}</Text>
      ) : null}
      {bill?.date || bill?.billNumber ? (
        <Text style={styles.subtitle}>
          {[bill.billNumber && `Bill #${bill.billNumber}`, bill.date]
            .filter(Boolean)
            .join("  ·  ")}
        </Text>
      ) : null}

      {/* Item list */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        style={styles.list}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity != null && item.quantity !== 1
                  ? `Qty ${item.quantity}  ·  `
                  : ""}
                ₹{item.price.toFixed(2)}
              </Text>
            </View>
            <Pressable
              onPress={() => handleDelete(item.id)}
              style={({ pressed }) => [
                styles.deleteBtn,
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.deleteBtnText}>✕</Text>
            </Pressable>
          </View>
        )}
        ListFooterComponent={
          <Pressable
            onPress={handleAddItem}
            style={({ pressed }) => [
              styles.addItemButton,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.addItemText}>+ Add Item</Text>
          </Pressable>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No items found. Add them manually or go back to rescan.
          </Text>
        }
      />

      {/* Totals breakdown */}
      <View style={styles.totalsBox}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Items</Text>
          <Text style={styles.totalValue}>₹{itemsTotal.toFixed(2)}</Text>
        </View>
        {gst > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST / Tax</Text>
            <Text style={styles.totalValue}>₹{gst.toFixed(2)}</Text>
          </View>
        )}
        {serviceCharge > 0 && (
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Service Charge</Text>
            <Text style={styles.totalValue}>₹{serviceCharge.toFixed(2)}</Text>
          </View>
        )}
        <View style={[styles.totalRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total</Text>
          <Text style={styles.grandTotalValue}>₹{grandTotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* Continue */}
      <Pressable
        onPress={handleContinue}
        style={({ pressed }) => [
          styles.continueButton,
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={styles.continueButtonText}>Continue to Split</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1D4ED8",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 16,
  },
  list: { flex: 1 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  itemInfo: { flex: 1 },
  itemName: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
    marginBottom: 2,
  },
  itemMeta: { fontSize: 13, color: "#6B7280" },
  deleteBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FEF2F2",
  },
  deleteBtnText: { color: "#EF4444", fontWeight: "600", fontSize: 13 },
  addItemButton: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "#D1D5DB",
    borderStyle: "dashed",
    alignItems: "center",
    marginTop: 4,
    marginBottom: 16,
  },
  addItemText: { color: "#6B7280", fontWeight: "500", fontSize: 14 },
  emptyText: {
    textAlign: "center",
    color: "#9CA3AF",
    marginTop: 32,
    fontSize: 14,
  },

  // Totals
  totalsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    marginBottom: 14,
    gap: 6,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  totalLabel: { fontSize: 14, color: "#6B7280" },
  totalValue: { fontSize: 14, color: "#374151" },
  grandTotalRow: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 8,
    marginTop: 4,
  },
  grandTotalLabel: { fontSize: 16, fontWeight: "700", color: "#111827" },
  grandTotalValue: { fontSize: 16, fontWeight: "700", color: "#111827" },

  continueButton: {
    backgroundColor: "#000000",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  continueButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },

  // Error state
  errorBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    marginTop: 20,
  },
  errorText: { fontSize: 14, color: "#B91C1C", marginBottom: 12 },
  retryButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  retryButtonText: { color: "#991B1B", fontWeight: "600", fontSize: 14 },
});
