import Ionicons from "@expo/vector-icons/Ionicons";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, View } from "react-native";
import { useTheme } from "@/theme";
import { Button, Txt } from "@/ui";

const KEY = "ca_app_lock";
/** Back from the background after this long → locked again. */
const GRACE_MS = 60_000;

export type LockKind = { available: boolean; label: string };

/** What this phone offers: Face ID / Touch ID on iPhone, face or fingerprint unlock on Android. */
export async function lockKind(): Promise<LockKind> {
  if (Platform.OS === "web") return { available: false, label: "" };
  const [hw, enrolled, types] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync(), LocalAuthentication.supportedAuthenticationTypesAsync(),
  ]);
  const face = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION);
  const label = Platform.OS === "ios" ? (face ? "Face ID" : "Touch ID") : face ? "face unlock" : "fingerprint";
  return { available: hw && enrolled, label };
}

/** Is the lock switched on? Never throws (no Keychain / Keystore means no lock). */
export async function lockEnabled(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try { return (await SecureStore.getItemAsync(KEY)) === "1"; } catch { return false; }
}

const unlock = (prompt = "Unlock Creator Assist") =>
  LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: "Cancel", disableDeviceFallback: false });

/** Turning the lock on needs one successful check first, so nobody locks themselves out. */
export async function setLockEnabled(on: boolean): Promise<boolean> {
  if (on) {
    const r = await unlock("Confirm to turn on app lock");
    if (!r.success) return false;
    await SecureStore.setItemAsync(KEY, "1");
  } else {
    await SecureStore.deleteItemAsync(KEY);
  }
  return true;
}

/** Covers the app until the creator unlocks; locks again after a minute in the background. */
export function AppLock({ active }: { active: boolean }) {
  const { c } = useTheme();
  const [locked, setLocked] = useState(false);
  const away = useRef<number | null>(null);
  const trying = useRef(false);

  const tryUnlock = useCallback(async () => {
    if (trying.current) return;
    trying.current = true;
    try { if ((await unlock()).success) setLocked(false); } finally { trying.current = false; }
  }, []);

  // Cold start: lock straight away if it's switched on.
  useEffect(() => {
    if (!active) { setLocked(false); return; }
    void lockEnabled().then((on) => { if (on) { setLocked(true); void tryUnlock(); } });
  }, [active, tryUnlock]);

  useEffect(() => {
    if (!active) return;
    const sub = AppState.addEventListener("change", async (s) => {
      if (s === "background") away.current = Date.now();
      if (s === "active" && away.current && Date.now() - away.current > GRACE_MS && (await lockEnabled())) {
        setLocked(true);
        void tryUnlock();
      }
      if (s === "active") away.current = null;
    });
    return () => sub.remove();
  }, [active, tryUnlock]);

  if (!active || !locked) return null;
  return (
    <View accessibilityViewIsModal style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: c.bg, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      <Ionicons name="lock-closed" size={48} color={c.text} />
      <Txt v="h1Sub" accessibilityRole="header">Creator Assist is locked</Txt>
      <Txt color={c.muted} style={{ textAlign: "center" }}>Unlock to see your deals and payments.</Txt>
      <View style={{ alignSelf: "stretch" }}><Button title="Unlock" onPress={tryUnlock} /></View>
    </View>
  );
}
