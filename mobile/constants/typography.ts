// ---------------------------------------------------------------------------
// constants/typography.ts — iOS-style text styles (Apple HIG type scale)
//
// Spread into StyleSheet entries:  title: { ...T.largeTitle, color: C.ink }
// ---------------------------------------------------------------------------
import type { TextStyle } from "react-native";

export const T = {
  largeTitle: { fontSize: 34, fontWeight: "700", letterSpacing: 0.37, lineHeight: 41 },
  title1: { fontSize: 28, fontWeight: "700", letterSpacing: 0.36, lineHeight: 34 },
  title2: { fontSize: 22, fontWeight: "700", letterSpacing: 0.35, lineHeight: 28 },
  title3: { fontSize: 20, fontWeight: "600", letterSpacing: 0.38, lineHeight: 25 },
  headline: { fontSize: 17, fontWeight: "600", letterSpacing: -0.41, lineHeight: 22 },
  body: { fontSize: 17, fontWeight: "400", letterSpacing: -0.41, lineHeight: 22 },
  callout: { fontSize: 16, fontWeight: "400", letterSpacing: -0.32, lineHeight: 21 },
  subhead: { fontSize: 15, fontWeight: "400", letterSpacing: -0.24, lineHeight: 20 },
  footnote: { fontSize: 13, fontWeight: "400", letterSpacing: -0.08, lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: "400", letterSpacing: 0, lineHeight: 16 },
} satisfies Record<string, TextStyle>;
