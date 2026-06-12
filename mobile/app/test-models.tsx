import { useEffect, useState } from "react";
import { StyleSheet, Text, ScrollView, View, ActivityIndicator } from "react-native";

export default function TestModelsUtility() {
  const [models, setModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModels() {
      try {
        const apiKey = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
        if (!apiKey || apiKey === "your_gemini_api_key_here") {
          throw new Error("Missing or invalid EXPO_PUBLIC_GEMINI_API_KEY in .env");
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HTTP ${response.status}: ${body}`);
        }

        const data = await response.json();

        if (data.models && Array.isArray(data.models)) {
          // data.models usually has objects with { name, version, displayName, ... }
          const modelNames = data.models.map((m: any) => m.name);
          setModels(modelNames);
          console.log("Available Gemini Models:", modelNames);
        } else {
          throw new Error("Unexpected JSON format from API.");
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "An unknown error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchModels();
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Gemini Models Verification</Text>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0000ff" />
          <Text>Fetching models...</Text>
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>Error:</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && !error && models.length === 0 && (
        <Text>No models returned by the API.</Text>
      )}

      {models.map((modelName, idx) => (
        <View key={idx} style={styles.modelRow}>
          <Text style={styles.modelText}>{modelName}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    paddingTop: 64, // SafeArea padding
    paddingBottom: 40,
    backgroundColor: "#f5f5f5",
    flexGrow: 1,
  },
  header: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#333",
  },
  center: {
    alignItems: "center",
    marginTop: 40,
  },
  errorBox: {
    padding: 16,
    backgroundColor: "#ffe6e6",
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    color: "#d00000",
    fontWeight: "500",
  },
  modelRow: {
    padding: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    borderRadius: 4,
    marginBottom: 4,
  },
  modelText: {
    fontSize: 16,
    fontFamily: "monospace",
    color: "#222",
  },
});
