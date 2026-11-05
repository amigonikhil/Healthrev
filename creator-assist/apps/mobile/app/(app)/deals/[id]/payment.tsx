import { fmtDay } from "@creator-assist/shared/dates";
import { inr, parseRupees } from "@creator-assist/shared/money";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Platform } from "react-native";
import { api } from "@/lib/api";
import { maybeAskForRating } from "@/lib/links";
import { errorText, useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Button, Card, DateField, Field, Hr, KV, LoadError, Note, Skeleton, SubScreen, Toggle, Txt } from "@/ui";

const r = (p: number) => String(Math.round(p / 100));

export default function PaymentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const { data, error, reload } = useLoad(() => api.deals.get(id));
  if (!data) return <SubScreen><Stack.Screen options={{ title: "Record payment" }} />{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={4} />}</SubScreen>;
  const { deal: v, today } = data;
  const d = v.d;
  const inv = d.invoice;

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Record payment" }} />
      {!inv ? (<>
        <Note>Generate the invoice first, then record payments against it.</Note>
        <Button title="Open invoice" onPress={() => router.replace(`/deals/${id}/invoice`)} />
      </>) : (<>
        <Txt color={c.muted}>
          {d.brand.name} · invoice {inr(inv.total_paise)}{inv.advance_deducted_paise ? ` · advance ${inr(inv.advance_deducted_paise)} already received` : ""}
        </Txt>
        {inv.payments.length > 0 && (
          <Card>
            <Txt v="h2" accessibilityRole="header">Received</Txt>
            {inv.payments.map((p) => <KV key={p.id} k={`${fmtDay(p.received_on)}${p.utr ? ` · ${p.utr}` : ""}`} v={`${inr(p.amount_paise)}${p.tds_paise ? ` + ${inr(p.tds_paise)} TDS` : ""}`} />)}
          </Card>
        )}
        {v.phase === "paid" ? <Note>This invoice is fully settled.</Note> : (
          <PaymentForm
            dealId={id} today={today} total={inv.total_paise} advance={inv.advance_deducted_paise} paidBefore={v.received + v.tdsRecorded}
            balance={inv.balance_due_paise} suggestAmount={v.receive} suggestTds={v.tdsRemaining}
            onSaved={(tds) => router.replace({ pathname: "/deals/[id]/paid", params: { id, tds: String(tds) } })}
          />
        )}
      </>)}
    </SubScreen>
  );
}

function PaymentForm(p: { dealId: string; today: string; total: number; advance: number; paidBefore: number; balance: number; suggestAmount: number; suggestTds: number; onSaved: (tds: number) => void }) {
  const [amt, setAmt] = useState(r(p.suggestAmount));
  const [tds, setTds] = useState(r(p.suggestTds));
  const [date, setDate] = useState(p.today);
  const [utr, setUtr] = useState("");
  const [form16a, setForm16a] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const amtP = parseRupees(amt) || 0, tdsP = parseRupees(tds) || 0;
  const sum = amtP + tdsP;
  const left = p.balance - p.paidBefore - sum;

  async function save() {
    setBusy(true); setErr("");
    try {
      const res = await api.deals.recordPayment(p.dealId, { amountPaise: amtP, tdsPaise: tdsP, receivedOn: date, utr: utr.trim() || null, form16a });
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void maybeAskForRating();
      p.onSaved(res.tdsPaise);
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (<>
    <Field label="Amount received in bank (₹)" value={amt} onChangeText={(t) => setAmt(t.replace(/[^\d.,]/g, ""))} keyboardType="decimal-pad" />
    <Field label="TDS deducted by brand (₹)" value={tds} onChangeText={(t) => setTds(t.replace(/[^\d.,]/g, ""))} keyboardType="decimal-pad" />
    <DateField label="Date received" value={date} onChange={setDate} max={p.today} />
    <Field label="UTR / reference" value={utr} onChangeText={setUtr} placeholder="HDFCN26298745512" autoCapitalize="characters" autoCorrect={false} autoComplete="off" />
    <Card>
      <KV k="Invoice total" v={inr(p.total)} />
      {p.advance > 0 && <KV k="Advance received" v={inr(p.advance)} />}
      {p.paidBefore > 0 && <KV k="Received earlier (incl. TDS)" v={inr(p.paidBefore)} />}
      <KV k="This payment + TDS" v={inr(sum)} />
      <Hr />
      <KV strong k="Balance" v={left <= 0 ? "₹0 · fully settled" : `${inr(left)} · partly paid`} />
    </Card>
    <Toggle label="Remind brand to send Form 16A" value={form16a} onChange={setForm16a} />
    {err ? <Note tone="warn">{err}</Note> : null}
    <Button title="Save payment" busy={busy} onPress={save} />
  </>);
}
