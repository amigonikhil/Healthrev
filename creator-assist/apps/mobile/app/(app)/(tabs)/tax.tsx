import { fmtDay, istDate } from "@creator-assist/shared/dates";
import { inr, parseRupees } from "@creator-assist/shared/money";
import { caSummaryText } from "@creator-assist/shared/tax";
import type { Filing } from "@creator-assist/shared/types";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Share, View } from "react-native";
import { api } from "@/lib/api";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, Chip, Field, Head, Hr, LinkButton, LoadError, Note, Screen, Sheet, Skeleton, Stat, Txt, useToast } from "@/ui";

type Hub = Awaited<ReturnType<typeof api.tax.hub>>;

export default function Tax() {
  const { c } = useTheme();
  const { me, refresh: refreshMe } = useSession();
  const router = useRouter();
  const toast = useToast();
  const { data, error, refreshing, refresh, reload } = useLoad(() => api.tax.hub());
  const [ais, setAis] = useState<"" | "upload" | "manual">("");
  const p = me?.profile;
  const hub = data?.hub;
  if (!p) return null;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Head title="Tax hub" sub={hub ? `FY ${hub.fy} · so far` : undefined} />
      {error && <LoadError message={error} onRetry={reload} />}
      {!data || !hub ? (!error && <Skeleton rows={4} />) : (<>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Stat label="Income invoiced" value={inr(hub.income)}><Txt v="small" color={c.muted}>{hub.brands} brand{hub.brands === 1 ? "" : "s"}</Txt></Stat>
          <Stat label="GST collected" value={inr(hub.gst)}><Txt v="small" color={c.muted}>{p.gstin ? "On your invoices" : "Not GST-registered"}</Txt></Stat>
          <Stat label="TDS by brands" value={inr(hub.tdsExpected)}><Txt v="small" color={c.muted}>Per your invoices</Txt></Stat>
          <Stat label="TDS in AIS" value={inr(hub.tdsInAis)}>
            {hub.missingTotal > 0
              ? <Txt v="small" w="bold" color={c.warnText}>{inr(hub.missingTotal)} missing</Txt>
              : <Txt v="small" color={c.muted}>{hub.tdsExpected ? "All matched" : "Nothing yet"}</Txt>}
          </Stat>
        </View>

        <Txt v="h2" accessibilityRole="header">Needs your action</Txt>
        <Card>
          {data.missing.length === 0 && <Txt color={c.muted}>No TDS mismatches. Upload your latest AIS to keep this current.</Txt>}
          {data.missing.map((m, i) => (
            <View key={m.brand.id} style={{ gap: 12 }}>
              {i > 0 && <Hr />}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }} accessible>
                  <Txt w="bold">{m.brand.name}</Txt>
                  <Txt v="small" color={c.muted}>TDS {inr(m.missing)} not in AIS</Txt>
                </View>
                <Button title="Remind" kind="secondary" onPress={() => router.push(`/tax/remind/${m.brand.id}`)} accessibilityHint={`TDS reminder to ${m.brand.name}`} />
              </View>
            </View>
          ))}
          <Hr />
          <Txt v="small" color={c.muted}><Txt v="small" w="bold">AIS</Txt> · The tax department&apos;s record of TDS brands deducted for you. {data.aisUpdatedAt ? `Last updated ${fmtDay(istDate(data.aisUpdatedAt))}.` : "No AIS uploaded yet."}</Txt>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button flex title="Update AIS" kind="secondary" onPress={() => setAis("upload")} />
            <Button flex title="Add by hand" kind="secondary" onPress={() => setAis("manual")} />
          </View>
        </Card>

        <Txt v="h2" accessibilityRole="header">Coming up</Txt>
        {data.cards.map((f) => <FilingCard key={f.type + f.period} f={f} hub={hub} today={data.today} onSent={reload} />)}
        <Txt v="small" color={c.muted}>Estimates from your invoices. Confirm all due dates and amounts with your CA.</Txt>
      </>)}
      {hub && <AisSheets mode={ais} fy={hub.fy} onClose={() => setAis("")} onDone={async () => { setAis(""); await Promise.all([reload(), refreshMe()]); }} />}
    </Screen>
  );
}

/**
 * A coming-up filing. The creator's own CA files: the app shares a summary with them. (Filing
 * through Creator Assist needs payments and stays out of the app for now.)
 */
function FilingCard({ f, hub, today, onSent }: { f: Hub["cards"][number]; hub: Hub["hub"]; today: string; onSent: () => Promise<void> }) {
  const { c } = useTheme();
  const { me } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const days = Math.round((Date.parse(f.due) - Date.parse(today)) / 86_400_000);
  const tone = days <= 20 ? "over" : days <= 45 ? "info" : "mute";
  const sent = f.filing?.data_sent_at;

  /** Shares the summary with the CA (WhatsApp, email…) and marks this filing's data as sent. */
  async function sendSummary(type: Filing["type"]) {
    setBusy(true);
    try {
      const text = caSummaryText(hub, me!.profile!, { title: f.title, due: fmtDay(f.due) });
      const r = await Share.share(Platform.OS === "ios" ? { message: text } : { message: text, title: "Tax summary for my CA" });
      if (r.action === Share.dismissedAction) return;
      toast(await api.tax.sendFilingData({ type, period: f.period, due: f.due }).then((x) => x.message));
      await onSent();
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }} accessible>
          <Txt w="bold">{f.title}</Txt>
          <Txt v="small" color={c.muted}>{f.detail}</Txt>
        </View>
        <Chip tone={tone} label={`Due ${fmtDay(f.due)}`} />
      </View>
      {f.type === "itr" && <Txt v="small" color={c.muted}><Txt v="small" w="bold">ITR-4</Txt> · The income tax return form most creators file.</Txt>}
      {sent ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Txt v="small" style={{ flex: 1 }}>{f.filing?.handled_by === "creator_assist" ? "We have everything we need" : "Summary sent to your CA"} · {fmtDay(istDate(sent))}</Txt>
          <Chip tone="ok" label="Ready" />
        </View>
      ) : (
        <Button title="Send summary to my CA" kind="secondary" busy={busy} onPress={() => sendSummary(f.type)} accessibilityHint="Opens the share sheet with your tax summary" />
      )}
      {sent && <LinkButton title="Send the summary again" onPress={() => sendSummary(f.type)} />}
    </Card>
  );
}

function AisSheets({ mode, fy, onClose, onDone }: { mode: "" | "upload" | "manual"; fy: string; onClose: () => void; onDone: () => Promise<void> }) {
  const { c } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [deductor, setDeductor] = useState("");
  const [tan, setTan] = useState("");
  const [amount, setAmount] = useState("");

  async function upload() {
    setErr("");
    const pick = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true, multiple: false });
    if (pick.canceled || !pick.assets?.[0]) return;
    const a = pick.assets[0];
    setBusy(true);
    try {
      const form = new FormData();
      // Web preview hands over a File; the phones a file URI.
      if (a.file) form.append("file", a.file);
      else form.append("file", { uri: a.uri, name: a.name || "ais.json", type: a.mimeType ?? "application/json" } as unknown as Blob);
      form.append("fy", fy);
      toast((await api.tax.uploadAis(form)).message);
      await onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }
  async function add() {
    setBusy(true); setErr("");
    try {
      toast((await api.tax.addAisEntry({ deductor, tan: tan || undefined, amountPaise: parseRupees(amount) || 0 })).message);
      setDeductor(""); setTan(""); setAmount("");
      await onDone();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  }

  return (<>
    <Sheet open={mode === "upload"} onClose={onClose} title="Update AIS">
      <Txt color={c.muted}>Download the AIS JSON from the income-tax portal (AIS → Download → JSON) and choose it here. We match TDS lines to your brands.</Txt>
      {err ? <Note tone="warn">{err}</Note> : null}
      <Button title="Choose AIS JSON file" busy={busy} onPress={upload} />
      <Button title="Cancel" kind="secondary" onPress={onClose} />
    </Sheet>
    <Sheet open={mode === "manual"} onClose={onClose} title="Add AIS entry">
      <Field label="Deductor name (as in AIS)" value={deductor} onChangeText={setDeductor} />
      <Field label="TAN (optional)" value={tan} onChangeText={(t) => setTan(t.toUpperCase())} maxLength={10} autoCapitalize="characters" autoCorrect={false} />
      <Field label="TDS amount (₹)" value={amount} onChangeText={(t) => setAmount(t.replace(/[^\d.,]/g, ""))} keyboardType="decimal-pad" />
      {err ? <Note tone="warn">{err}</Note> : null}
      <Button title="Add entry" busy={busy} disabled={!deductor.trim() || !amount} onPress={add} />
    </Sheet>
  </>);
}
