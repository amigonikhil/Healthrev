import NetInfo from "@react-native-community/netinfo";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme";
import { Txt } from "@/ui";

/** True while the phone has no internet (unknown counts as online, so nothing flashes at launch). */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => NetInfo.addEventListener((s) => setOffline(s.isConnected === false || s.isInternetReachable === false)), []);
  return offline;
}

/** A strip at the top of every screen while offline. Screens keep what they last loaded. */
export function OfflineBanner() {
  const offline = useOffline();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (!offline) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 4, paddingBottom: 8, paddingHorizontal: 16, backgroundColor: c.inverseBg }}>
      <Txt v="small" w="bold" color={c.inverseText} style={{ textAlign: "center" }}>You&apos;re offline. Showing what was last loaded.</Txt>
    </View>
  );
}
