// ---------------------------------------------------------------------------
// components/ui/OtpBubbles.tsx — verification code shown as one bubble per digit
//
// A single hidden TextInput holds the code, so typing, backspace, paste and
// SMS autofill all work normally; the bubbles only display it. Tapping any
// bubble focuses the input.
// ---------------------------------------------------------------------------

import { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { C } from "@/constants/colors";

export function OtpBubbles({
  value,
  onChange,
  onComplete,
  length = 6,
  error = false,
  autoFocus = true,
}: {
  value: string;
  onChange: (code: string) => void;
  /** Called once all digits are entered. */
  onComplete?: (code: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);

  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, "").slice(0, length);
    onChange(digits);
    if (digits.length === length) onComplete?.(digits);
  };

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={s.row}
      accessibilityRole="none"
      accessibilityLabel={`Verification code, ${value.length} of ${length} digits entered`}
    >
      {Array.from({ length }, (_, i) => {
        const digit = value[i] ?? "";
        const isActive = i === Math.min(value.length, length - 1) && value.length < length;
        return (
          <View
            key={i}
            style={[
              s.bubble,
              digit !== "" && s.bubbleFilled,
              isActive && s.bubbleActive,
              error && s.bubbleError,
            ]}
          >
            <Text style={[s.digit, digit !== "" && s.digitFilled]}>{digit}</Text>
          </View>
        );
      })}

      {/* Hidden input that actually receives the keystrokes / autofill. */}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        caretHidden
        style={s.hiddenInput}
      />
    </Pressable>
  );
}

const s = StyleSheet.create({
  // Bubbles share the row equally, so all six always fit inside the card.
  row: { flexDirection: "row", justifyContent: "center", gap: 8, width: "100%" },
  bubble: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  bubbleFilled: { borderColor: C.primary, backgroundColor: C.primarySoft },
  bubbleActive: { borderColor: C.primary, borderWidth: 2 },
  bubbleError: { borderColor: C.danger, backgroundColor: C.dangerSoft },
  // includeFontPadding/textAlignVertical: keep the digit exactly centred on Android.
  digit: {
    fontSize: 17,
    lineHeight: 20,
    fontWeight: "700",
    color: C.textSubtle,
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
  digitFilled: { color: C.ink },
  hiddenInput: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
