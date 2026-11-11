// ---------------------------------------------------------------------------
// components/ui/UserAvatar.tsx — profile photo, or the first letter of the name
//
// Shows the account's photo (e.g. the Google profile picture) when there is
// one; falls back to the initial if there is no photo or it fails to load.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { StyleSheet, Text, type StyleProp, type TextStyle } from "react-native";
import { Image } from "expo-image";

export function UserAvatar({
  photoUrl,
  name,
  size,
  textStyle,
}: {
  photoUrl?: string;
  name?: string;
  size: number;
  textStyle?: StyleProp<TextStyle>;
}) {
  const [failed, setFailed] = useState(false);
  if (photoUrl && !failed) {
    return (
      <Image
        source={{ uri: photoUrl }}
        style={[s.photo, { width: size, height: size, borderRadius: size / 2 }]}
        contentFit="cover"
        transition={150}
        onError={() => setFailed(true)}
        accessibilityLabel={name ? `${name}'s profile photo` : "Profile photo"}
      />
    );
  }
  return <Text style={textStyle}>{(name?.trim() || "?").charAt(0).toUpperCase()}</Text>;
}

const s = StyleSheet.create({
  photo: { position: "absolute", top: 0, left: 0 },
});
