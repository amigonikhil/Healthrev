import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { api } from "@/lib/api";
import { WEB_URL } from "@/lib/env";
import { errorText } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, Head, Note, Screen, Txt } from "@/ui";

function KV({ k, v }: { k: string; v: string }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityLabel={`${k}: ${v}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, minHeight: 28, alignItems: "center" }}>
      <Txt color={c.muted}>{k}</Txt>
      <Txt w="semibold" style={{ flexShrink: 1, textAlign: "right" }}>{v}</Txt>
    </View>
  );
}

export default function Settings() {
  const { c } = useTheme();
  const { me, refresh, signOut } = useSession();
  const [busy, setBusy] = useState<"sample" | "out" | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: "info" | "warn" } | null>(null);
  const p = me?.profile;
  if (!p) return null;

  async function sample() {
    setBusy("sample"); setMsg(null);
    try {
      const r = me?.hasSampleData ? await api.sample.clear() : await api.sample.load();
      await refresh();
      setMsg({ text: r.message, tone: "info" });
    } catch (e) {
      setMsg({ text: errorText(e), tone: "warn" });
    } finally {
      setBusy(null);
    }
  }

  function confirmSignOut() {
    Alert.alert("Log out?", "You'll need a new code to sign in again.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: async () => { setBusy("out"); await signOut(); } },
    ]);
  }

  return (
    <Screen>
      <Head title="Settings" />
      <Card>
        <Txt v="h2" accessibilityRole="header">Profile</Txt>
        <KV k="Name" v={p.name} />
        <KV k="Handle" v={p.handle ?? "—"} />
        <KV k="Email" v={p.email ?? "—"} />
        <KV k="Phone" v={p.phone ?? "—"} />
      </Card>
      <Card>
        <Txt v="h2" accessibilityRole="header">Tax and bank</Txt>
        <KV k="PAN" v={p.pan_masked ?? "—"} />
        <KV k="GSTIN" v={p.gstin ?? "Not registered"} />
        <KV k="Udyam" v={p.udyam_no ?? "—"} />
        <KV k="Bank" v={p.bank_account_last4 ? `${(p.bank_name ?? "").replace(/ Bank$/, "")} ••${p.bank_account_last4}` : "—"} />
        <KV k="Invoice prefix" v={p.invoice_prefix} />
      </Card>
      <Card>
        <Txt v="h2" accessibilityRole="header">Sample data</Txt>
        <Txt color={c.muted}>Sample deals are marked &quot;Sample&quot; and never mix with your real ones. Clearing removes only them.</Txt>
        <Button
          title={me?.hasSampleData ? "Clear sample data" : "Load sample data"} kind="secondary"
          busy={busy === "sample"} onPress={sample}
        />
        {msg ? <Note tone={msg.tone}>{msg.text}</Note> : null}
      </Card>
      <Button title="About & data safety" kind="secondary" onPress={() => void Linking.openURL(`${WEB_URL}/about`)} accessibilityHint="Opens in your browser" />
      <Button title="Log out" kind="secondary" busy={busy === "out"} onPress={confirmSignOut} />
      <Txt v="small" color={c.muted} style={{ textAlign: "center" }}>PAN and bank numbers are encrypted.</Txt>
    </Screen>
  );
}
