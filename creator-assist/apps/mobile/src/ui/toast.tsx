import { radius } from "@creator-assist/shared/tokens";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Txt } from "./index";

const Ctx = createContext<(msg: string) => void>(() => {});

/** Short confirmations ("Sent to arjun@voltra.in"), read out by VoiceOver / TalkBack too. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const [msg, setMsg] = useState<string | null>(null);
  const fade = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((m: string) => {
    setMsg(m);
    AccessibilityInfo.announceForAccessibility(m);
    Animated.timing(fade, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => Animated.timing(fade, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null)), 3500);
  }, [fade]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <Animated.View pointerEvents="none" style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 96, opacity: fade, alignItems: "center" }}>
          <View style={{ backgroundColor: c.inverseBg, borderRadius: radius.input, paddingVertical: 12, paddingHorizontal: 16, maxWidth: 480 }}>
            <Txt w="semibold" color={c.inverseText}>{msg}</Txt>
          </View>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
