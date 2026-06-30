import { useEffect } from "react";
import { View, Text, StyleSheet, SafeAreaView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { optimizeReceipt } from "../services/optimizer";

export default function OptimizingScreen() {
  const { uri } = useLocalSearchParams<{ uri: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!uri) {
      router.replace("/");
      return;
    }

    async function process() {
      try {
        const croppedUri = await optimizeReceipt(uri as string);
        router.replace({ pathname: "/preview", params: { uri: croppedUri } });
      } catch (err) {
        console.error("Optimization failed:", err);
        // On failure, just pass the original image
        router.replace({ pathname: "/preview", params: { uri } });
      }
    }

    process();
  }, [uri]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#111827" />
        <Text style={styles.text}>Optimizing receipt...</Text>
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
  text: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: "600",
    color: "#374151",
  },
});
