import { palettes, type Palette } from "@creator-assist/shared/tokens";
import { useColorScheme } from "react-native";

/** Space Grotesk faces as loaded in the root layout (React Native picks a face per weight by family name). */
export const FONTS = {
  regular: "SpaceGrotesk_400Regular",
  medium: "SpaceGrotesk_500Medium",
  semibold: "SpaceGrotesk_600SemiBold",
  bold: "SpaceGrotesk_700Bold",
} as const;
export type Weight = keyof typeof FONTS;

/** Colours for the phone's current light/dark setting. */
export function useTheme(): { scheme: "light" | "dark"; c: Palette } {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return { scheme, c: palettes[scheme] };
}
