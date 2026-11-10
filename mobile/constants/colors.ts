// ---------------------------------------------------------------------------
// constants/colors.ts — Billy's colour theme: emerald green, black & white, glass
//
// The single source of truth for colours. Screens import `C` and use these
// tokens instead of hex codes, so the whole app can be re-themed here.
// ---------------------------------------------------------------------------

export const C = {
  // Brand — emerald green, black & white
  primary: "#065F46",        // deep emerald — buttons, active tab, links, selected
  primaryDark: "#0A0A0A",    // black — dark cards (login / summary)
  primarySoft: "#E3F0EA",    // light emerald highlights
  primaryMuted: "#047857",   // emerald accents / info icons

  // Text — black & greys
  ink: "#0A0A0A",            // headings and main text
  text: "#262626",           // body text
  textMuted: "#737373",      // secondary text
  textSubtle: "#A3A3A3",     // hints, placeholders, disabled

  // Surfaces
  bg: "#F4F6F5",             // plain backgrounds (inputs etc.)
  surface: "#FFFFFF",
  surfaceAlt: "#EEF1EF",
  border: "#E5E7E6",
  borderStrong: "#D4D8D6",
  separator: "#D4D4D4",

  // Money / status
  success: "#059669",        // owed to you, paid, settled
  successDark: "#065F46",    // green text on light backgrounds
  successSoft: "#E3F0EA",
  danger: "#E11D48",         // you owe, delete, errors
  dangerDark: "#BE123C",
  dangerSoft: "#FFF1F2",
  warning: "#F59E0B",        // pending, check this
  warningDark: "#B45309",
  warningSoft: "#FFFBEB",

  // Glass (glassmorphism) — translucent white over a soft emerald glow
  glass: "rgba(255,255,255,0.62)",       // cards, lists
  glassStrong: "rgba(255,255,255,0.82)", // inputs, chips, secondary buttons
  glassBorder: "rgba(255,255,255,0.95)", // bright edge that sells the glass
  glassBase: "#F1F5F3",                  // screen base under the glows
  glowPrimary: "#047857",                // deep emerald
  glowSecondary: "#10B981",              // emerald
  glowTertiary: "#D1D5DB",               // soft grey

  // On dark (black) cards
  onDark: "#FFFFFF",
  onDarkMuted: "#A3A3A3",
  onDarkLine: "rgba(255,255,255,0.14)",

  white: "#FFFFFF",
} as const;
