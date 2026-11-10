// ---------------------------------------------------------------------------
// constants/colors.ts — Billy's colour theme ("indigo + mint")
//
// The single source of truth for colours. Screens import `C` and use these
// tokens instead of hex codes, so the whole app can be re-themed here.
// ---------------------------------------------------------------------------

export const C = {
  // Brand
  primary: "#4F46E5",        // indigo — buttons, links, active tab, selected
  primaryDark: "#3730A3",    // dark cards (balance / summary)
  primarySoft: "#EEF2FF",    // icon circles, light highlights
  primaryMuted: "#6366F1",   // secondary accents / info icons

  // Text
  ink: "#1E1B4B",            // headings and main text
  text: "#334155",           // body text
  textMuted: "#64748B",      // secondary text
  textSubtle: "#94A3B8",     // hints, placeholders, disabled

  // Surfaces
  bg: "#F5F6FB",             // screen background
  surface: "#FFFFFF",        // cards
  surfaceAlt: "#EEF0F8",     // subtle fills, pressed rows
  border: "#E4E6F0",
  borderStrong: "#CBD0E0",

  // Money / status
  success: "#10B981",        // owed to you, paid, settled
  successDark: "#047857",    // green text on light backgrounds
  successSoft: "#ECFDF5",
  danger: "#F43F5E",         // you owe, delete, errors
  dangerDark: "#BE123C",
  dangerSoft: "#FFF1F2",
  warning: "#F59E0B",        // pending, check this
  warningDark: "#B45309",
  warningSoft: "#FFFBEB",

  // On dark cards
  onDark: "#FFFFFF",
  onDarkMuted: "#C7D2FE",
  onDarkLine: "rgba(255,255,255,0.15)",

  white: "#FFFFFF",
} as const;
