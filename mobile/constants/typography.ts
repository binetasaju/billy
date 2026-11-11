// ---------------------------------------------------------------------------
// constants/typography.ts — iOS-style text styles (Apple HIG type scale)
//
// Spread into StyleSheet entries:  title: { ...T.largeTitle, color: C.ink }
// ---------------------------------------------------------------------------
import type { TextStyle } from "react-native";

export const T = {
  largeTitle: { fontSize: 26, fontWeight: "700", letterSpacing: 0.37, lineHeight: 34 },
  title1: { fontSize: 22, fontWeight: "700", letterSpacing: 0.36, lineHeight: 29 },
  title2: { fontSize: 17, fontWeight: "700", letterSpacing: 0.35, lineHeight: 23 },
  title3: { fontSize: 16, fontWeight: "600", letterSpacing: 0.38, lineHeight: 20 },
  headline: { fontSize: 14, fontWeight: "600", letterSpacing: -0.41, lineHeight: 18 },
  body: { fontSize: 14, fontWeight: "400", letterSpacing: -0.41, lineHeight: 18 },
  callout: { fontSize: 14, fontWeight: "400", letterSpacing: -0.32, lineHeight: 17 },
  subhead: { fontSize: 13, fontWeight: "400", letterSpacing: -0.24, lineHeight: 17 },
  footnote: { fontSize: 12, fontWeight: "400", letterSpacing: -0.08, lineHeight: 15 },
  caption: { fontSize: 11, fontWeight: "400", letterSpacing: 0, lineHeight: 13 },
} satisfies Record<string, TextStyle>;
