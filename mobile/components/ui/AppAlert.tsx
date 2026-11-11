// ---------------------------------------------------------------------------
// components/ui/AppAlert.tsx — Billy-styled replacement for Alert.alert
//
// Usage is the same as React Native's Alert:
//   appAlert.alert("Title", "Message", [
//     { text: "Cancel", style: "cancel" },
//     { text: "Delete", style: "destructive", onPress: doDelete },
//   ]);
//
// <AppAlertHost /> is rendered once in app/_layout.tsx and shows the alerts.
// Alerts raised while one is open are queued and shown one after another.
// Unlike the Android system dialog, buttons always appear in the order given.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { C } from "@/constants/colors";
import { T } from "@/constants/typography";

export type AppAlertButton = {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
};

export type AppAlertOptions = {
  /** Tap outside / Android back closes the alert (no button callback). */
  cancelable?: boolean;
  onDismiss?: () => void;
};

type AlertRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  options?: AppAlertOptions;
};

let nextId = 1;
let queue: AlertRequest[] = [];
const listeners = new Set<(q: AlertRequest[]) => void>();
const emit = () => listeners.forEach((l) => l(queue));

export const appAlert = {
  alert(title: string, message?: string, buttons?: AppAlertButton[], options?: AppAlertOptions) {
    queue = [
      ...queue,
      {
        id: nextId++,
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: "OK" }],
        options,
      },
    ];
    emit();
  },
};

function close(id: number) {
  queue = queue.filter((a) => a.id !== id);
  emit();
}

export function AppAlertHost() {
  const [items, setItems] = useState<AlertRequest[]>(queue);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const current = items[0];
  if (!current) return null;

  const dismiss = () => {
    if (!current.options?.cancelable) return;
    close(current.id);
    current.options?.onDismiss?.();
  };

  const press = (b: AppAlertButton) => {
    close(current.id);
    // Run after closing so the callback can open the next alert or navigate.
    b.onPress?.();
  };

  // Two short buttons sit side by side; three or more stack vertically.
  const stacked = current.buttons.length > 2;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={dismiss}>
      <Pressable style={styles.backdrop} onPress={dismiss}>
        <Pressable style={styles.card} onPress={() => {}} accessibilityRole="alert">
          <Text style={styles.title}>{current.title}</Text>
          {!!current.message && <Text style={styles.message}>{current.message}</Text>}

          <View style={[styles.buttons, stacked ? styles.buttonsStacked : styles.buttonsRow]}>
            {current.buttons.map((b, i) => {
              const kind = b.style ?? "default";
              return (
                <Pressable
                  key={`${b.text}-${i}`}
                  onPress={() => press(b)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.button,
                    !stacked && styles.buttonFlex,
                    kind === "cancel" && styles.buttonCancel,
                    kind === "destructive" && styles.buttonDestructive,
                    kind === "default" && styles.buttonDefault,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      kind === "cancel" ? styles.buttonTextCancel : styles.buttonTextOnColor,
                    ]}
                    numberOfLines={1}
                  >
                    {b.text ?? "OK"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  title: { ...T.title3, color: C.ink },
  message: { ...T.body, color: C.textMuted, marginTop: 8, lineHeight: 18 },

  buttons: { marginTop: 22, gap: 10 },
  buttonsRow: { flexDirection: "row" },
  buttonsStacked: { flexDirection: "column" },

  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonFlex: { flex: 1 },
  buttonDefault: { backgroundColor: C.primary },
  buttonDestructive: { backgroundColor: C.danger },
  buttonCancel: { backgroundColor: C.surfaceAlt },
  buttonText: { ...T.body, fontWeight: "600" },
  buttonTextOnColor: { color: "#FFFFFF" },
  buttonTextCancel: { color: C.text },
  pressed: { opacity: 0.75 },
});
