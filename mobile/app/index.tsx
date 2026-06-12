import { Alert } from "react-native";
import { View, Text, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";

export default function HomeScreen() {
  const router = useRouter();

  const handleScanBill = () => {
    Alert.alert(
      "Add Bill",
      "Choose how you want to add the bill",
      [
        { text: "Take Photo", onPress: handleCameraPress },
        { text: "Choose From Gallery", onPress: handleGalleryPress },
        { text: "Cancel", style: "cancel" },
      ]
    );
  };

  const handleCameraPress = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow camera access.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: true,
    });

    if (!result.canceled) {
      router.push({
        pathname: "/preview",
        params: { uri: result.assets[0].uri },
      });
    }
  };

  const handleGalleryPress = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert("Permission Required", "Please allow gallery access.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });

    if (!result.canceled) {
      router.push({
        pathname: "/preview",
        params: { uri: result.assets[0].uri },
      });
    }
  };

  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        backgroundColor: "#F9FAFB",
      }}
    >
      <Text
        style={{
          fontSize: 42,
          fontWeight: "bold",
          marginBottom: 8,
          color: "#111827",
          letterSpacing: -1,
        }}
      >
        Billy
      </Text>

      <Text
        style={{
          color: "#6B7280",
          marginBottom: 48,
          fontSize: 16,
        }}
      >
        Every Bill Matters
      </Text>

      <Pressable
        onPress={handleScanBill}
        style={({ pressed }) => ({
          backgroundColor: pressed ? "#1a1a1a" : "#000000",
          paddingVertical: 16,
          paddingHorizontal: 32,
          borderRadius: 12,
          width: "100%",
          maxWidth: 240,
        })}
      >
        <Text
          style={{
            color: "white",
            textAlign: "center",
            fontWeight: "600",
            fontSize: 16,
          }}
        >
          Scan Bill
        </Text>
      </Pressable>
    </View>
  );
}