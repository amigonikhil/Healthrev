import { PUSH_KINDS, type PushKind } from "@creator-assist/shared/types";
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { api } from "@/lib/api";
import { pushState, turnOffPush, turnOnPush, type PushState } from "@/lib/push";
import { errorText } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, Note, SubScreen, Toggle, Txt, useToast } from "@/ui";

/** Push on this phone, and which notifications to get (saved to the account, so every phone follows them). */
export default function NotificationSettings() {
  const { c } = useTheme();
  const { me, refresh } = useSession();
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Partial<Record<PushKind, boolean>>>(me?.profile?.push_prefs ?? {});
  useEffect(() => { void pushState().then(setState); }, []);

  async function turnOn() {
    setBusy(true);
    try { setState(await turnOnPush()); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true);
    try { await turnOffPush(); setState("off"); } finally { setBusy(false); }
  }
  async function setKind(kind: PushKind, on: boolean) {
    const next = { ...prefs, [kind]: on };
    setPrefs(next);
    try { await api.push.prefs(next); await refresh(); } catch (e) { setPrefs(prefs); toast(errorText(e)); }
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Notifications" }} />
      <Card>
        <Txt v="h2" accessibilityRole="header">On this phone</Txt>
        {state === "unavailable" && <Note>Notifications need the store version of the app on a phone.</Note>}
        {state === "denied" && (<>
          <Note tone="warn">Notifications are blocked for Creator Assist in your phone&apos;s settings.</Note>
          <Button title="Open phone settings" kind="secondary" onPress={() => void Linking.openSettings()} />
        </>)}
        {state === "off" && <Button title="Turn on notifications" busy={busy} onPress={turnOn} />}
        {state === "on" && (<>
          <Txt color={c.muted}>Notifications are on.</Txt>
          <Button title="Turn off on this phone" kind="secondary" busy={busy} onPress={turnOff} />
        </>)}
      </Card>
      <Card>
        <Txt v="h2" accessibilityRole="header">Tell me about</Txt>
        {PUSH_KINDS.map((k) => (
          <Toggle key={k.kind} label={k.label} hint={k.detail} value={prefs[k.kind] !== false} onChange={(v) => setKind(k.kind, v)} />
        ))}
        <Txt v="small" color={c.muted}>Sent between 9 AM and 9 PM. Sample deals never send notifications.</Txt>
      </Card>
    </SubScreen>
  );
}
