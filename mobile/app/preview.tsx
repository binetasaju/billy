import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function PreviewScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router = useRouter();

  const handleRetake = () => {
    // Go back to home so the user can take another photo
    router.back();
  };

  const handleContinue = () => {
    // Pass the URI forward to the OCR screen
    router.push({
      pathname: "/ocr",
      params: { uri },
    });
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <Text style={styles.title}>Preview Bill</Text>
      <Text style={styles.subtitle}>
        Make sure the bill is clear and fully visible
      </Text>

      {/* Bill image */}
      <View style={styles.imageContainer}>
        {uri ? (
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>No image selected</Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleRetake}
          style={({ pressed }) => [
            styles.button,
            styles.buttonSecondary,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonTextSecondary}>Retake</Text>
        </Pressable>

        <Pressable
          onPress={handleContinue}
          style={({ pressed }) => [
            styles.button,
            styles.buttonPrimary,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonTextPrimary}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

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
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 24,
  },
  imageContainer: {
    flex: 1,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
    marginBottom: 24,
  },
  image: {
    flex: 1,
    width: "100%",
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: {
    color: "#9CA3AF",
    fontSize: 16,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonPrimary: {
    backgroundColor: "#000000",
  },
  buttonSecondary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonTextPrimary: {
    color: "#FFFFFF",
    fontWeight: "600",
    fontSize: 16,
  },
  buttonTextSecondary: {
    color: "#111827",
    fontWeight: "600",
    fontSize: 16,
  },
});
