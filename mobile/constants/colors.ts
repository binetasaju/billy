// ---------------------------------------------------------------------------
// constants/colors.ts — Billy's colour theme (indigo + mint, iOS system colours)
//
// The single source of truth for colours. Screens import `C` and use these
// tokens instead of hex codes, so the whole app can be re-themed here.
// ---------------------------------------------------------------------------

export const C = {
  // Brand — iOS systemIndigo family
  primary: "#5856D6",        // buttons, links, active tab, selected
  primaryDark: "#3C3AB8",    // dark cards (balance / summary)
  primarySoft: "#EEEEFC",    // icon circles, light highlights
  primaryMuted: "#7D7AFF",   // secondary accents / info icons

  // Text — iOS label colours
  ink: "#1C1C1E",            // label: headings and main text
  text: "#3A3A3C",           // body text
  textMuted: "#8E8E93",      // secondaryLabel (systemGray)
  textSubtle: "#AEAEB2",     // tertiaryLabel, placeholders (systemGray2)

  // Surfaces — iOS grouped backgrounds
  bg: "#F2F2F7",             // systemGroupedBackground
  surface: "#FFFFFF",        // secondarySystemGroupedBackground (cards)
  surfaceAlt: "#EFEFF4",     // fills, pressed rows
  border: "#E5E5EA",         // systemGray5
  borderStrong: "#D1D1D6",   // systemGray4
  separator: "#C6C6C8",      // hairline separators

  // Money / status — iOS system colours
  success: "#34C759",        // systemGreen — owed to you, paid, settled
  successDark: "#248A3D",    // green text on light backgrounds
  successSoft: "#E9F9EE",
  danger: "#FF3B30",         // systemRed — you owe, delete, errors
  dangerDark: "#D70015",
  dangerSoft: "#FFEBEA",
  warning: "#FF9500",        // systemOrange — pending, check this
  warningDark: "#C93400",
  warningSoft: "#FFF4E5",

  // Glass (glassmorphism) — translucent white over the glow background
  glass: "rgba(255,255,255,0.60)",       // cards, lists
  glassStrong: "rgba(255,255,255,0.80)", // inputs, chips, secondary buttons
  glassBorder: "rgba(255,255,255,0.90)", // bright edge that sells the glass
  glassBase: "#ECEEFB",                  // screen base under the glows
  glowIndigo: "#6366F1",
  glowViolet: "#A78BFA",
  glowMint: "#34D399",

  // On dark cards
  onDark: "#FFFFFF",
  onDarkMuted: "#D4D3F7",
  onDarkLine: "rgba(255,255,255,0.18)",

  white: "#FFFFFF",
} as const;
