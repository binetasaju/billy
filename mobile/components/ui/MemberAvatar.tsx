// ---------------------------------------------------------------------------
// components/ui/MemberAvatar.tsx — a person's round avatar
//
// Shows their Billy profile photo when they have a Billy account (authUid) —
// your own photo for "you" — otherwise the first letter on their colour.
// ---------------------------------------------------------------------------
import { View, StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { UserAvatar } from "./UserAvatar";
import { useAuth } from "../../hooks/useAuth";
import { useProfilePhoto } from "../../services/profilePhotos";
import { C } from "@/constants/colors";

export function MemberAvatar({
  name,
  color,
  authUid,
  isMe,
  size,
  ring = 0,
  style,
  textStyle,
}: {
  name: string;
  color?: string;
  /** Their Billy account, if any. */
  authUid?: string;
  /** This is the signed-in user (uses their own photo). */
  isMe?: boolean;
  size: number;
  /** White ring width (for overlapping avatars). */
  ring?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const { user } = useAuth();
  const theirPhoto = useProfilePhoto(isMe ? undefined : authUid);
  const photoUrl = isMe ? user?.photoUrl : theirPhoto;
  const inner = size - ring * 2;
  return (
    <View
      style={[
        s.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? C.textSubtle },
        ring > 0 && { borderWidth: ring, borderColor: C.white },
        style,
      ]}
    >
      <UserAvatar
        photoUrl={photoUrl}
        name={name}
        size={inner}
        textStyle={[s.initial, { fontSize: Math.max(11, Math.round(size * 0.36)) }, textStyle]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  circle: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initial: { color: C.white, fontWeight: "700" },
});
