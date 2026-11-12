// ---------------------------------------------------------------------------
// app/import-document.tsx — reading an uploaded PDF bill
//
// Opened from Add Bill → Upload Bill (PDF) with the picked file. Shows a
// loading state, then goes to Review; on failure, offers to pick another file.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { GlassScreen as SafeAreaView } from "@/components/ui/glass";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";
import { extractBillFromPdf, pickBillDocument } from "../services/documentImport";
import { ExtractionError } from "../services/billExtraction";

export default function ImportDocumentScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ uri: string; name?: string; size?: string }>();
  const [file, setFile] = useState({ uri: params.uri, name: params.name ?? "bill.pdf", size: params.size ? Number(params.size) : null });
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (f: { uri: string; name: string; size: number | null }) => {
    setError(null);
    try {
      await extractBillFromPdf(f.uri, f.size);
      router.replace("/review-items");
    } catch (e) {
      setError(
        e instanceof ExtractionError && e.notABill
          ? "This doesn't look like a bill. Choose another PDF."
          : e instanceof Error ? e.message : "Couldn't read that PDF."
      );
    }
  }, [router]);

  useEffect(() => {
    if (!file.uri) {
      router.back();
      return;
    }
    read(file);
    // Read once per picked file.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const pickAnother = async () => {
    try {
      const picked = await pickBillDocument();
      if (!picked) return;
      if (picked.kind === "image") {
        router.replace({ pathname: "/preview", params: { uri: picked.uri } });
        return;
      }
      setFile({ uri: picked.uri, name: picked.name, size: picked.size });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open that file.");
    }
  };

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.center}>
        {error ? (
          <>
            <Ionicons name="alert-circle-outline" size={44} color={C.danger} />
            <Text style={s.title}>Couldn&apos;t read the bill</Text>
            <Text style={s.body}>{error}</Text>
            <Pressable onPress={pickAnother} style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]} accessibilityRole="button">
              <Text style={s.btnText}>Choose another file</Text>
            </Pressable>
            <Pressable onPress={() => read(file)} hitSlop={8} accessibilityRole="button">
              <Text style={s.link}>Try again</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button">
              <Text style={s.linkMuted}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Ionicons name="document-text-outline" size={44} color={C.primary} />
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={s.title}>Reading your bill…</Text>
            <Text style={s.body} numberOfLines={2}>{file.name}</Text>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
  title: { ...T.title2, color: C.ink, textAlign: "center" },
  body: { ...T.body, color: C.textMuted, textAlign: "center" },
  btn: { backgroundColor: C.primary, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, marginTop: 8 },
  btnText: { color: C.white, fontWeight: "700", fontSize: 15 },
  link: { ...T.subhead, color: C.primary, fontWeight: "600" },
  linkMuted: { ...T.subhead, color: C.textMuted },
});
