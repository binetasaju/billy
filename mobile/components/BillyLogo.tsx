// Billy's logo: the white cat-and-$ mark on a rounded green tile.
import { View, StyleSheet, type ViewStyle, type StyleProp } from "react-native";
import { Image } from "expo-image";
import { C } from "@/constants/colors";

const MARK = require("../assets/images/billy-mark.png");

export function BillyLogo({ size = 64, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[s.tile, { width: size, height: size, borderRadius: size * 0.28 }, style]}
      accessibilityRole="image"
      accessibilityLabel="Billy logo"
    >
      <Image source={MARK} style={{ width: size * 0.72, height: size * 0.72 }} contentFit="contain" accessible={false} />
    </View>
  );
}

const s = StyleSheet.create({
  tile: { backgroundColor: C.brand, alignItems: "center", justifyContent: "center" },
});
