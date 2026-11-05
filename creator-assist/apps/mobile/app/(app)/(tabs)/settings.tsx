import { everyLabel, everyHours } from "@creator-assist/shared/reminder-schedule";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Linking } from "react-native";
import { api } from "@/lib/api";
import { lockEnabled, lockKind, setLockEnabled, type LockKind } from "@/lib/app-lock";
import { downloadAndShare, openWeb } from "@/lib/links";
import { errorText } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, Field, Head, KV, ListItem, Note, Screen, Sheet, Toggle, Txt, useToast } from "@/ui";

const LANG_LABEL = { en: "English", te: "Telugu-English", hi: "Hinglish" } as const;

export default function Settings() {
  const { c } = useTheme();
  const { me, config, refresh, signOut } = useSession();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"sample" | "export" | "out" | null>(null);
  const [del, setDel] = useState(false);
  const [lock, setLock] = useState<{ kind: LockKind; on: boolean } | null>(null);
  useEffect(() => { void Promise.all([lockKind(), lockEnabled()]).then(([kind, on]) => setLock({ kind, on })); }, []);
  const p = me?.profile;
  if (!p) return null;
  const support = config?.support;

  async function sample() {
    setBusy("sample");
    try {
      const r = me?.hasSampleData ? await api.sample.clear() : await api.sample.load();
      await refresh();
      toast(r.message);
    } catch (e) { toast(errorText(e)); } finally { setBusy(null); }
  }

  async function exportData() {
    setBusy("export");
    try { await downloadAndShare(api.account.exportPath, `creator-assist-export-${new Date().toISOString().slice(0, 10)}.json`, "application/json"); }
    catch (e) { toast(errorText(e)); } finally { setBusy(null); }
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
        <Txt v="h2" accessibilityRole="header" style={{ marginTop: 6 }}>Tax and bank</Txt>
        <KV k="PAN" v={p.pan_masked ?? "—"} />
        <KV k="GSTIN" v={p.gstin ?? "Not registered"} />
        <KV k="Udyam" v={p.udyam_no ?? "—"} />
        <KV k="Bank" v={p.bank_account_last4 ? `${(p.bank_name ?? "").replace(/ Bank$/, "")} ••${p.bank_account_last4}` : "—"} />
        <KV k="Invoice prefix" v={p.invoice_prefix} />
        <Button title="Edit profile" kind="secondary" onPress={() => router.push("/settings/profile")} />
      </Card>

      <ListItem title="Reminders" sub={`Every ${everyLabel(everyHours(p.remind_every_hours))} · ${[p.remind_whatsapp && "WhatsApp", p.remind_email && "email"].filter(Boolean).join(" + ") || "off"} · ${LANG_LABEL[p.language]}`} onPress={() => router.push("/settings/reminders")} />
      <ListItem title="Rates" sub="GST, TDS, RBI bank rate, late-payment interest" onPress={() => router.push("/settings/rates")} />
      <ListItem title="Notifications" sub="Payments due, overdue, signed agreements, tax dates" onPress={() => router.push("/settings/notifications")} />
      {lock?.kind.available && (
        <Card>
          <Toggle
            label={`Lock with ${lock.kind.label}`} value={lock.on}
            hint="Asks for it when you open the app, and after a minute away"
            onChange={async (on) => { if (await setLockEnabled(on)) setLock({ ...lock, on }); }}
          />
        </Card>
      )}

      <Card>
        <Txt v="h2" accessibilityRole="header">Your data</Txt>
        <Txt color={c.muted}>Sample deals are marked &quot;Sample&quot; and never mix with your real ones. Clearing removes only them.</Txt>
        <Button title={me?.hasSampleData ? "Clear sample data" : "Load sample data"} kind="secondary" busy={busy === "sample"} onPress={sample} />
        <Button title="Export my data" kind="secondary" busy={busy === "export"} onPress={exportData} accessibilityHint="Downloads everything as a JSON file and opens the share sheet" />
        <Button title="Delete my account" kind="danger" onPress={() => setDel(true)} />
      </Card>

      {support && (
        <Card>
          <Txt v="h2" accessibilityRole="header">Help &amp; support</Txt>
          <Txt color={c.muted}>Questions about a deal, an invoice or your account? We usually reply within a working day.</Txt>
          {support.whatsapp && <Button title="Chat on WhatsApp" kind="secondary" onPress={() => void Linking.openURL(`https://wa.me/${support.whatsapp!.replace(/\D/g, "")}?text=${encodeURIComponent("Hi Creator Assist, I need help with ")}`)} />}
          {support.email && <Button title={`Email ${support.email}`} kind="secondary" onPress={() => void Linking.openURL(`mailto:${support.email}?subject=${encodeURIComponent("Creator Assist help")}`)} />}
        </Card>
      )}

      <ListItem title="About & data safety" sub="Who built this, what we store, how it's protected" onPress={() => void openWeb("/about")} />
      <Button title="Log out" kind="secondary" busy={busy === "out"} onPress={confirmSignOut} />
      <Txt v="small" color={c.muted} style={{ textAlign: "center" }}>PAN and bank numbers are encrypted.</Txt>

      <DeleteSheet open={del} onClose={() => setDel(false)} onDeleted={signOut} />
    </Screen>
  );
}

/** Permanent deletion, confirmed by typing DELETE (same rule as the web). */
function DeleteSheet({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr("");
    try { await api.account.delete(); await onDeleted(); }
    catch (e) { setErr(errorText(e)); setBusy(false); }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Delete my account">
      <Note tone="warn">This permanently deletes your profile, deals, invoices, reminders and uploaded files. Export your data first if you need it.</Note>
      <Field label="Type DELETE to confirm" value={text} onChangeText={setText} autoCapitalize="characters" autoCorrect={false} autoComplete="off" />
      {err ? <Note tone="warn">{err}</Note> : null}
      <Button title="Delete permanently" kind="danger" busy={busy} disabled={text.trim() !== "DELETE"} onPress={go} />
      <Button title="Cancel" kind="secondary" onPress={onClose} />
    </Sheet>
  );
}
