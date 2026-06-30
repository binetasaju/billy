import React, { useState, useEffect, useMemo } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Linking,
} from "react-native";
import * as Contacts from "expo-contacts";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber";

export interface ContactData {
  id: string;
  name: string;
  phone?: string;
}

interface ContactPickerModalProps {
  visible: boolean;
  onClose: () => void;
  onAddContacts: (contacts: ContactData[]) => void;
  existingParticipantIds: string[];
  existingPhones: string[];
  singleSelection?: boolean;
}

export default function ContactPickerModal({
  visible,
  onClose,
  onAddContacts,
  existingParticipantIds,
  existingPhones,
  singleSelection = false,
}: ContactPickerModalProps) {
  const insets = useSafeAreaInsets();
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [contacts, setContacts] = useState<ContactData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible) {
      checkPermissionAndLoad();
    } else {
      // Reset state when closed
      setSearchQuery("");
      setSelectedIds(new Set());
    }
  }, [visible]);

  const checkPermissionAndLoad = async () => {
    const { status } = await Contacts.getPermissionsAsync();
    if (status === "granted") {
      setHasPermission(true);
      loadContacts();
    } else {
      const { status: newStatus } = await Contacts.requestPermissionsAsync();
      setHasPermission(newStatus === "granted");
      if (newStatus === "granted") {
        loadContacts();
      }
    }
  };

  const loadContacts = async () => {
    setLoading(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
        sort: Contacts.SortTypes.FirstName,
      });

      const formattedContacts: ContactData[] = [];
      const seenIds = new Set<string>();
      const seenPhones = new Set<string>();

      for (const c of data) {
        // Skip contacts with no name, blank names, or the literal string "null"
        if (!c.name) continue;
        if (c.name.trim() === "" || c.name.trim().toLowerCase() === "null") continue;
        
        const name = c.name.trim();
        const id = c.id || name;
        const phone = normalizePhoneNumber(c.phoneNumbers?.[0]?.number);

        // Skip exact ID duplicates
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        // Skip phone duplicates
        if (phone) {
          if (seenPhones.has(phone)) continue;
          seenPhones.add(phone);
        }

        formattedContacts.push({
          id,
          name,
          phone,
        });
      }
      setContacts(formattedContacts);
    } catch (err) {
      console.error("Failed to load contacts", err);
    } finally {
      setLoading(false);
    }
  };

  const openSettings = () => {
    Linking.openSettings();
  };

  const handleToggleSelect = (contact: ContactData) => {
    if (singleSelection) {
      onAddContacts([contact]);
      onClose();
      return;
    }

    const newSet = new Set(selectedIds);
    if (newSet.has(contact.id)) {
      newSet.delete(contact.id);
    } else {
      newSet.add(contact.id);
    }
    setSelectedIds(newSet);
  };

  const handleAdd = () => {
    const selectedContacts = contacts.filter((c) => selectedIds.has(c.id));
    onAddContacts(selectedContacts);
    onClose();
  };

  const existingIdsSet = useMemo(
    () => new Set(existingParticipantIds),
    [existingParticipantIds]
  );
  
  const existingPhonesSet = useMemo(
    () => {
      const set = new Set<string>();
      existingPhones.forEach(p => {
        const norm = normalizePhoneNumber(p);
        if (norm) set.add(norm);
      });
      return set;
    },
    [existingPhones]
  );

  const filteredContacts = useMemo(() => {
    if (!searchQuery) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
    );
  }, [contacts, searchQuery]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header — paddingTop uses safe area inset so content clears the status bar */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.title}>Contacts</Text>
          {singleSelection ? (
            <View style={styles.headerBtn} />
          ) : (
            <Pressable
              onPress={handleAdd}
              style={[styles.headerBtn, selectedIds.size === 0 && styles.headerBtnDisabled]}
              disabled={selectedIds.size === 0}
            >
              <Text style={[styles.headerBtnText, styles.headerBtnAdd]}>
                Add {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
              </Text>
            </Pressable>
          )}
        </View>

        {/* Permission Denied State */}
        {hasPermission === false ? (
          <View style={styles.centerContainer}>
            <Ionicons name="people-circle-outline" size={64} color="#9CA3AF" />
            <Text style={styles.errorText}>
              Contacts access is required to quickly add participants.
            </Text>
            <Pressable style={styles.grantBtn} onPress={openSettings}>
              <Text style={styles.grantBtnText}>Grant Permission</Text>
            </Pressable>
          </View>
        ) : (
          /* Contacts List State */
          <>
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={20} color="#9CA3AF" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search contacts..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
            </View>

            {loading ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#111827" />
              </View>
            ) : (
              <FlatList
                data={filteredContacts}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={20}
                renderItem={({ item }) => {
                  const normalizedPhone = normalizePhoneNumber(item.phone);
                  const isExisting = Boolean(
                    existingIdsSet.has(item.id) ||
                    (normalizedPhone && existingPhonesSet.has(normalizedPhone))
                  );
                    
                  const isSelected = selectedIds.has(item.id);

                  return (
                    <Pressable
                      style={[styles.contactRow, isExisting && styles.contactRowDisabled]}
                      onPress={() => !isExisting && handleToggleSelect(item)}
                      disabled={isExisting}
                    >
                      <View style={styles.contactAvatar}>
                        <Text style={styles.contactAvatarText}>
                          {item.name.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.contactInfo}>
                        <Text style={[styles.contactName, isExisting && styles.textDisabled]}>
                          {item.name}
                        </Text>
                        {item.phone && (
                          <Text style={[styles.contactPhone, isExisting && styles.textDisabled]}>
                            {item.phone}
                          </Text>
                        )}
                      </View>
                      <View style={styles.checkboxContainer}>
                        {isExisting ? (
                          <Text style={styles.addedText}>Added</Text>
                        ) : (
                          !singleSelection && (
                            <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                              {isSelected && <Ionicons name="checkmark" size={16} color="#FFF" />}
                            </View>
                          )
                        )}
                      </View>
                    </Pressable>
                  );
                }}
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    // paddingTop is set inline via useSafeAreaInsets() — do not hardcode here
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFF",
  },
  title: { fontSize: 18, fontWeight: "600", color: "#111827" },
  headerBtn: { padding: 4 },
  headerBtnDisabled: { opacity: 0.5 },
  headerBtnText: { fontSize: 16, color: "#4B5563" },
  headerBtnAdd: { color: "#1D4ED8", fontWeight: "600" },
  centerContainer: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  errorText: { fontSize: 16, color: "#4B5563", textAlign: "center", marginTop: 16, marginBottom: 24 },
  grantBtn: { backgroundColor: "#111827", paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  grantBtnText: { color: "#FFF", fontSize: 16, fontWeight: "600" },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E5E7EB",
    margin: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    height: 40,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 16, color: "#111827" },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
    backgroundColor: "#FFF",
  },
  contactRowDisabled: { backgroundColor: "#F9FAFB" },
  contactAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  contactAvatarText: { fontSize: 16, fontWeight: "600", color: "#4B5563" },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: "500", color: "#111827" },
  contactPhone: { fontSize: 14, color: "#6B7280", marginTop: 2 },
  textDisabled: { color: "#9CA3AF" },
  checkboxContainer: { paddingLeft: 12 },
  addedText: { fontSize: 14, color: "#9CA3AF", fontWeight: "500" },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: { backgroundColor: "#1D4ED8", borderColor: "#1D4ED8" },
});
