// ---------------------------------------------------------------------------
// app/index.tsx
//
// Home screen. Both camera and gallery go directly to /preview.
// No crop step here — editing is available on the preview screen.
// ---------------------------------------------------------------------------

import { Alert } from "react-native";
import { View, Text, Pressable, StyleSheet, SafeAreaView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();

  const handleScanBill = () => {
    Alert.alert(
      "Add Bill",
      "Choose how you want to add the bill",
      [
        { text: "Take Photo",          onPress: handleCameraPress },
        { text: "Choose From Gallery", onPress: handleGalleryPress },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  // ── Camera ─────────────────────────────────────────────────────────────────
  const handleCameraPress = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false, // editing available on preview screen
      quality: 0.85,
    });

    if (!result.canceled) {
      router.push({ pathname: "/preview", params: { uri: result.assets[0].uri } });
    }
  };

  // ── Gallery ────────────────────────────────────────────────────────────────
  const handleGalleryPress = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: false, // editing available on preview screen
      quality: 0.85,
    });

    if (!result.canceled) {
      router.push({ pathname: "/preview", params: { uri: result.assets[0].uri } });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Billy</Text>
        <Text style={styles.subtitle}>Every Bill Matters</Text>

        <Pressable
          onPress={handleScanBill}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Scan Bill</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F9FAFB" },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  title: {
    fontSize: 42,
    fontWeight: "bold",
    marginBottom: 8,
    color: "#111827",
    letterSpacing: -1,
  },
  subtitle: {
    color: "#6B7280",
    marginBottom: 48,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#000000",
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: "100%",
    maxWidth: 240,
    alignItems: "center",
  },
  buttonPressed: { opacity: 0.75 },
  buttonText: {
    color: "white",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
  },
});