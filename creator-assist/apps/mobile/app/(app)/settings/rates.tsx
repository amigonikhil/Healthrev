import type { TaxConfig } from "@creator-assist/shared/calc";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, Field, LinkButton, LoadError, Note, Seg, Skeleton, SubScreen, Txt, useToast } from "@/ui";

type Form = { rbi: string; multiple: string; tds: string; late: string; period: "week" | "year"; legal: string; gst: string };
const toForm = (t: Partial<TaxConfig>): Form => ({
  rbi: t.rbi_bank_rate != null ? t.rbi_bank_rate.toFixed(2) : "", multiple: String(t.msme_multiple ?? ""), tds: String(t.tds_rate ?? ""),
  late: String(t.late_interest_rate ?? ""), period: t.late_interest_period ?? "year", legal: t.notice_legal_fee_paise != null ? String(t.notice_legal_fee_paise / 100) : "",
  gst: String(t.gst_rate ?? ""),
});
const num = (s: string) => Number(s.replace(/[^\d.]/g, ""));

export default function Rates() {
  const { c } = useTheme();
  const { refresh } = useSession();
  const router = useRouter();
  const toast = useToast();
  const notice = useFlag("lawyer_notice");
  const { data, error, reload } = useLoad(() => api.settings.get());
  const [f, setF] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { if (data && !f) setF(toForm(data.tax)); }, [data, f]);
  const set = (k: keyof Form) => (v: string) => setF((x) => (x ? { ...x, [k]: v.replace(/[^\d.]/g, "") } : x));

  async function save() {
    if (!f) return;
    setBusy(true); setErr("");
    try {
      const r = await api.settings.rates({
        rbiBankRate: num(f.rbi), msmeMultiple: num(f.multiple), tdsRate: num(f.tds), lateInterestRate: num(f.late),
        lateInterestPeriod: f.period, noticeLegalFeePaise: Math.round(num(f.legal) * 100), gstRate: num(f.gst),
      });
      await refresh();
      toast(r.message);
      router.back();
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Rates" }} />
      {error && <LoadError message={error} onRetry={reload} />}
      {!f ? (!error && <Skeleton rows={4} />) : (<>
        <Card>
          <Field label="RBI bank rate for MSME interest (%)" value={f.rbi} onChangeText={set("rbi")} keyboardType="decimal-pad" />
          <Field label="MSME interest multiple (× RBI bank rate)" value={f.multiple} onChangeText={set("multiple")} keyboardType="decimal-pad" />
          <Field label="Default TDS on fees (%)" value={f.tds} onChangeText={set("tds")} keyboardType="decimal-pad" />
          <Field label="Late payment interest in agreements (%)" value={f.late} onChangeText={set("late")} keyboardType="decimal-pad" />
          <Txt v="small" w="semibold" color={c.text2}>Charged</Txt>
          <Seg label="Late payment interest charged" value={f.period} onChange={(v) => setF({ ...f, period: v })} options={[{ value: "week", label: "Per week" }, { value: "year", label: "Per year" }]} />
          {notice && <Field label="Legal fee claimed in lawyer notices (₹)" value={f.legal} onChangeText={set("legal")} keyboardType="decimal-pad" />}
          <Field label="GST rate (%)" value={f.gst} onChangeText={set("gst")} keyboardType="decimal-pad" />
        </Card>
        <Txt v="small" color={c.muted}>Confirm these with your CA. Very high late-payment rates can be challenged as a penalty; check with a lawyer.</Txt>
        {err ? <Note tone="warn">{err}</Note> : null}
        <Button title="Save rates" busy={busy} onPress={save} />
        {data?.rateDefaults && (
          <LinkButton title="Reset to default" onPress={() => { setF(toForm({ ...data.tax, ...data.rateDefaults })); toast("Defaults filled in. Tap Save rates to keep them."); }} />
        )}
      </>)}
    </SubScreen>
  );
}
