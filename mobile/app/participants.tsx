import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SafeAreaView,
  FlatList,
  Alert,
  Modal,
  TextInput,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { billStore } from "../services/billStore";
import type { Person } from "../types/bill";
import ContactPickerModal, { ContactData } from "../components/ContactPickerModal";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#10B981",
  "#06B6D4", "#3B82F6", "#8B5CF6", "#EC4899",
];

export default function ParticipantsScreen() {
  const router = useRouter();
  const [participants, setParticipants] = useState<Person[]>([]);
  const [payerId, setPayerId] = useState<string | null>(null);
  const [isModalVisible, setModalVisible] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Person | null>(null);
  const [editName, setEditName] = useState("");
  const [removeState, setRemoveState] = useState<{
    visible: boolean;
    person: Person | null;
    title: string;
    message: string;
    isPayer: boolean;
    items: any[];
  }>({ visible: false, person: null, title: "", message: "", isPayer: false, items: [] });

  useEffect(() => {
    const store = billStore.get();
    if (!store) {
      router.replace("/");
      return;
    }
    setParticipants(store.participants);
    setPayerId(store.payerId);
  }, []);

  const handleAddContacts = (newContacts: ContactData[]) => {
    const updatedParticipants = [...participants];

    newContacts.forEach((c) => {
      const newPerson: Person = {
        id: c.id,
        name: c.name,
        phone: c.phone,
        color: COLORS[updatedParticipants.length % COLORS.length],
        itemIds: [],
      };
      billStore.addParticipant(newPerson);
      updatedParticipants.push(newPerson);
    });

    setParticipants(updatedParticipants);
    setModalVisible(false);
  };

  const handleRemoveParticipant = (person: Person) => {
    const store = billStore.get();
    if (!store) return;

    if (participants.length <= 2) {
      Alert.alert("Cannot remove", "A bill must have at least 2 participants.");
      return;
    }

    const isPayer = store.payerId === person.id;

    if (isPayer) {
      setRemoveState({
        visible: true,
        person,
        isPayer: true,
        items: [],
        title: "Remove Payer",
        message: `${person.name} is currently marked as the bill payer.\n\nRemoving ${person.name} will require selecting a new payer before continuing.`,
      });
      return;
    }

    if (person.itemIds.length > 0) {
      const items = person.itemIds
        .map((id) => store.bill.items?.find((it: any) => it.id === id))
        .filter(Boolean);

      setRemoveState({
        visible: true,
        person,
        isPayer: false,
        items,
        title: "Remove Participant",
        message: `${person.name} has ${person.itemIds.length} assigned item${
          person.itemIds.length !== 1 ? "s" : ""
        }.\n\nRemoving ${person.name} will unassign these items:`,
      });
    } else {
      setRemoveState({
        visible: true,
        person,
        isPayer: false,
        items: [],
        title: `Remove ${person.name}?`,
        message: "Are you sure you want to remove them from this bill?",
      });
    }
  };

  const confirmRemoveModal = () => {
    if (!removeState.person) return;
    confirmRemove(removeState.person.id, removeState.isPayer);
    setRemoveState((prev) => ({ ...prev, visible: false }));
    if (removeState.isPayer) {
      router.replace("/who-paid" as any);
    }
  };

  const confirmRemove = (id: string, clearPayer = false) => {
    const store = billStore.get();
    if (!store) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = store.participants.filter((p) => p.id !== id);

    store.participants = updated;

    if (clearPayer) {
      store.payerId = null;
      setPayerId(null);
    }

    setParticipants(updated);
  };

  const handleEditName = (person: Person) => {
    setEditingParticipant(person);
    setEditName(person.name);
  };

  const saveEditName = () => {
    if (!editingParticipant) return;
    const name = editName.trim();
    if (!name) {
      Alert.alert("Invalid Name", "Please enter a valid name.");
      return;
    }

    const store = billStore.get();
    if (!store) return;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = participants.map((p) =>
      p.id === editingParticipant.id ? { ...p, name } : p
    );

    store.participants = updated;
    setParticipants(updated);
    setEditingParticipant(null);
  };

  const handleContinue = () => {
    if (!payerId) {
      Alert.alert("No Payer Selected", "Please select who paid the bill before continuing.");
      return;
    }
    
    // Save the selected payer to the store before continuing
    billStore.updatePayer(payerId);
    
    router.push("/choose-split-method" as any);
  };

  const canRemove = participants.length > 2;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Participants</Text>
          <Text style={styles.subtitle}>Who's sharing this bill?</Text>
        </View>

        <FlatList
          data={participants}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <Pressable
                  onPress={() => canRemove && handleRemoveParticipant(item)}
                  hitSlop={12}
                  disabled={!canRemove}
                >
                  <Ionicons
                    name="checkbox"
                    size={24}
                    color={canRemove ? "#111827" : "#D1D5DB"}
                  />
                </Pressable>
                <View style={[styles.avatar, { backgroundColor: item.color }]}>
                  <Text style={styles.avatarText}>
                    {item.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.nameContainer}>
                  <Text style={styles.nameText}>{item.name}</Text>
                  {item.phone && <Text style={styles.phoneText}>{item.phone}</Text>}
                </View>
              </View>
              <View style={styles.rowRight}>
                <Pressable
                  onPress={() => handleEditName(item)}
                  style={styles.actionBtn}
                >
                  <Ionicons name="pencil" size={20} color="#9CA3AF" />
                </Pressable>
                <Pressable
                  onPress={() => canRemove && handleRemoveParticipant(item)}
                  style={[styles.actionBtn, !canRemove && styles.actionBtnDisabled]}
                  disabled={!canRemove}
                >
                  <Ionicons name="close" size={24} color={canRemove ? "#9CA3AF" : "#D1D5DB"} />
                </Pressable>
              </View>
            </View>
          )}
          ListFooterComponent={
            <Pressable
              style={styles.addBtn}
              onPress={() => setModalVisible(true)}
            >
              <Ionicons name="person-add" size={18} color="#111827" />
              <Text style={styles.addBtnText}>Add From Contacts</Text>
            </Pressable>
          }
        />

        <View style={styles.footer}>
          {!canRemove && (
            <Text style={styles.minParticipantsHint}>⚠️ Minimum 2 participants required to split a bill.</Text>
          )}
          {payerId === null && (
            <Text style={styles.noPayerHint}>Please select who paid the bill.</Text>
          )}
          <Pressable
            style={[styles.continueBtn, !payerId && styles.continueBtnDisabled]}
            onPress={handleContinue}
          >
            <Text style={styles.continueBtnText}>Continue to Split →</Text>
          </Pressable>
        </View>
      </View>

      <ContactPickerModal
        visible={isModalVisible}
        onClose={() => setModalVisible(false)}
        onAddContacts={handleAddContacts}
        existingParticipantIds={participants.map((p) => p.id)}
        existingPhones={participants.map((p) => p.phone || "").filter(Boolean)}
      />

      {payerId === null && (
        <View style={styles.noPayerBanner}>
          <Ionicons name="warning-outline" size={16} color="#92400E" />
          <Text style={styles.noPayerBannerText}>
            No payer selected. Please go back and select who paid.
          </Text>
        </View>
      )}

      <Modal visible={!!editingParticipant} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Name</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              onSubmitEditing={saveEditName}
            />
            <View style={styles.modalActions}>
              <Pressable
                style={styles.modalCancelBtn}
                onPress={() => setEditingParticipant(null)}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalSaveBtn} onPress={saveEditName}>
                <Text style={styles.modalSaveBtnText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={removeState.visible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.removeModalBackdrop}>
          <View style={styles.removeModalCard}>
            <View style={styles.removeModalIconWrap}>
              <Ionicons name="warning" size={28} color="#D97706" />
            </View>
            <Text style={styles.removeModalTitle}>{removeState.title}</Text>
            <Text style={styles.removeModalSubtitle}>{removeState.message}</Text>
            
            {removeState.items && removeState.items.length > 0 && (
              <View style={styles.removeModalItemList}>
                {removeState.items.map((it: any) => (
                  <View key={it.id} style={styles.removeModalItemRow}>
                    <View style={styles.removeModalItemDot} />
                    <Text style={styles.removeModalItemName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.removeModalItemPrice}>₹{(it.price || 0).toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.removeModalActions}>
              <Pressable
                style={styles.removeModalBtnSecondary}
                onPress={() => setRemoveState(prev => ({ ...prev, visible: false }))}
              >
                <Text style={styles.removeModalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={styles.removeModalBtnPrimary}
                onPress={confirmRemoveModal}
              >
                <Text style={styles.removeModalBtnPrimaryText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  container: { flex: 1, paddingHorizontal: 16 },
  header: { marginTop: 24, marginBottom: 16 },
  title: { fontSize: 28, fontWeight: "700", color: "#111827", letterSpacing: -0.5 },
  subtitle: { fontSize: 16, color: "#6B7280", marginTop: 4 },
  listContent: { paddingBottom: 100 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  nameText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  phoneText: { fontSize: 13, color: "#6B7280", marginTop: 2 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 16 },
  actionBtn: { padding: 4 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#E5E7EB",
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  addBtnText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  footer: {
    paddingVertical: 10,
    backgroundColor: "#F9FAFB",
    borderTopWidth: 1,
    borderColor: "#E5E7EB",
  },
  continueBtn: {
    backgroundColor: "#111827",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  continueBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  continueBtnDisabled: { backgroundColor: "#9CA3AF" },
  noPayerHint: { textAlign: "center", fontSize: 13, color: "#EF4444", marginBottom: 6 },
  minParticipantsHint: { textAlign: "center", fontSize: 13, color: "#D97706", marginBottom: 6, fontWeight: "500" },
  actionBtnDisabled: { opacity: 0.4 },
  noPayerBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  noPayerBannerText: { flex: 1, fontSize: 13, color: "#92400E", fontWeight: "500" },
  nameContainer: { flex: 1 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#111827",
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  modalCancelBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7280",
  },
  modalSaveBtn: {
    backgroundColor: "#111827",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  modalSaveBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  
  // Remove Modal specific styling
  removeModalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 },
  removeModalCard: { width: "100%", backgroundColor: "#fff", borderRadius: 24, paddingHorizontal: 24, paddingTop: 28, paddingBottom: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 20 },
  removeModalIconWrap: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#FEF3C7", alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 16 },
  removeModalTitle: { fontSize: 20, fontWeight: "700", color: "#111827", textAlign: "center", marginBottom: 8, letterSpacing: -0.3 },
  removeModalSubtitle: { fontSize: 14, color: "#6B7280", textAlign: "center", lineHeight: 20, marginBottom: 20 },
  removeModalItemList: { backgroundColor: "#F9FAFB", borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden", marginBottom: 24 },
  removeModalItemRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderColor: "#F3F4F6", gap: 10 },
  removeModalItemDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#D97706" },
  removeModalItemName: { flex: 1, fontSize: 14, color: "#111827", fontWeight: "500" },
  removeModalItemPrice: { fontSize: 14, fontWeight: "700", color: "#374151" },
  removeModalActions: { flexDirection: "row", gap: 12 },
  removeModalBtnSecondary: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: "#E5E7EB", alignItems: "center" },
  removeModalBtnSecondaryText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  removeModalBtnPrimary: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: "#EF4444", alignItems: "center" },
  removeModalBtnPrimaryText: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
