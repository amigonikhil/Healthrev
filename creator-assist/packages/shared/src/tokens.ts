// Bold Creator design tokens for the native apps. Same values as the CSS variables in
// apps/web/src/app/globals.css (the web's source of truth); keep the two in step.
// See DESIGN.md for how each is used.

export type ColorScheme = "light" | "dark";

const light = {
  // surfaces
  bg: "#F6F4EE", surface: "#FFFFFF", surface2: "#EFECE4", surface3: "#E3DFD5", outer: "#E9E6DE",
  line: "#E4E0D6", field: "#CFC9BC",
  // text
  text: "#111111", text2: "#2E2E2E", muted: "#5A5A5A", placeholder: "#636363",
  // brand
  primary: "#FF4D4D", onPrimary: "#111111", primaryInk: "#C41E1E",
  accent: "#FFD60A", accentSoft: "#FFE45C", onAccent: "#111111", accentInk: "#7A5C00",
  // status stickers: fills are the same in both themes; text on them is always #111
  stOver: "#FF4D4D", stInfo: "#7DD3FC", stOk: "#86EFAC", stNew: "#C4B5FD", stInk: "#111111",
  stMuteBg: "#E7E3DA", stMuteText: "#111111", stMuteLine: "#B9B3A6",
  // tinted message blocks and timeline dots
  infoBg: "#E0F2FE", infoText: "#0C4A6E", warnBg: "#FFE4E1", warnText: "#A11B1B", okBg: "#DCFCE7", okText: "#14532D",
  dotOk: "#15803D", dotInfo: "#0369A1", dotWarn: "#C41E1E", dotMute: "#8A8A8A",
  // inverse (toasts) and tab bar
  inverseBg: "#111111", inverseText: "#FFFFFF", navBg: "#111111", navText: "#D4D4D4",
  scrim: "rgba(17,17,17,0.55)",
  /** Card border: a hairline in light mode, none in dark. */
  cardBorder: "#E4E0D6",
};

export type Palette = typeof light;

const dark: Palette = {
  ...light,
  bg: "#111111", surface: "#1C1C1C", surface2: "#1E1E1E", surface3: "#2E2E2E", outer: "#000000",
  line: "#2A2A2A", field: "#3A3A3A",
  text: "#FFFFFF", text2: "#D4D4D4", muted: "#BDBDBD", placeholder: "#A3A3A3",
  primaryInk: "#FF6B6B", accentInk: "#FFD60A",
  stMuteBg: "#333333", stMuteText: "#F5F5F5", stMuteLine: "#555555",
  infoBg: "rgba(125,211,252,0.12)", infoText: "#7DD3FC", warnBg: "rgba(255,77,77,0.14)", warnText: "#FF8A80", okBg: "rgba(134,239,172,0.12)", okText: "#86EFAC",
  dotOk: "#86EFAC", dotInfo: "#7DD3FC", dotWarn: "#FF4D4D", dotMute: "#8A8A8A",
  inverseBg: "#F5F5F5", inverseText: "#111111", navBg: "#1E1E1E", navText: "#D4D4D4",
  scrim: "rgba(0,0,0,0.6)",
  cardBorder: "transparent",
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

/** Font sizes in points (= CSS px). Letter-spacing is in points for each size (CSS uses em). */
export const type = {
  family: "SpaceGrotesk",
  hero: 54, h1: 34, h1Sub: 26, tile: 28, h2: 22, amount: 19, body: 15, chip: 14, small: 13, sticker: 12, tab: 11,
  tracking: (size: number, kind: "tight" | "snug" | "caps") => size * { tight: -0.03, snug: -0.02, caps: 0.04 }[kind],
} as const;

export const radius = { card: 24, button: 24, input: 16, avatar: 16, tab: 18, pill: 999 } as const;

export const space = { 1: 4, 2: 6, 3: 8, 4: 10, 5: 12, 6: 16, 7: 20, 8: 24 } as const;

/** Minimum tap target: 44pt on iOS, 48dp on Android. */
export const tapTarget = { ios: 44, android: 48 } as const;

/** The "pop" sticker shadow: a hard 2×3 offset in #111, no blur. */
export const popShadow = { color: "#111111", offset: { width: 2, height: 3 }, opacity: 1, radius: 0 } as const;

/** Status chip fill + text for a deal tone ("over" | "info" | "ok" | "mute"). */
export const toneColors = (p: Palette, tone: "over" | "info" | "ok" | "mute") =>
  tone === "mute" ? { bg: p.stMuteBg, text: p.stMuteText } : { bg: { over: p.stOver, info: p.stInfo, ok: p.stOk }[tone], text: p.stInk };
