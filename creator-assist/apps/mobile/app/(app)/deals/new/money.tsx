import type { GstMode } from "@creator-assist/shared/calc";
import { deliverablesSummary } from "@creator-assist/shared/deliverables";
import { inr, minus } from "@creator-assist/shared/money";
import { View } from "react-native";
import { StepHead, useDraft, useDraftLoading, type Terms } from "@/components/deal-draft";
import { AiNote, StepFooter } from "@/components/deal-steps";
import { useTheme } from "@/theme";
import { Card, CheckTag, Field, Hr, KV, LinkButton, Seg, Skeleton, Stepper, SubScreen, Toggle, Txt } from "@/ui";

const FEE_LABEL: Record<GstMode, string> = { add: "Total fee, before GST (₹)", incl: "Total fee, including GST (₹)", none: "Total fee (₹)" };

/** Step 3: the fee, GST, advance, TDS and payment terms, with the live summary; then save. */
export default function MoneyStep() {
  return useDraftLoading().w ? <Money /> : <SubScreen><Skeleton rows={5} /></SubScreen>;
}

function Money() {
  const { c } = useTheme();
  const { o, d, up, chosen, check, touch, shown, summary: s, submit, busy, err } = useDraft();
  const { tax, creator } = o;
  const e = shown(3);
  const payer = d.paidBy === "agency" && d.brand.agency_name ? d.brand.agency_name : d.brand.name;
  const who = d.paidBy === "agency" ? "Agency" : "Brand";

  return (
    <SubScreen
      footer={
        <StepFooter
          back next="Review agreement" onNext={() => void submit("agreement")} busy={busy === "agreement"} disabled={!!busy} error={err}
          below={<LinkButton title="Save without agreement" onPress={() => { if (!busy) void submit("save"); }} />}
        />
      }
    >
      <StepHead step={3} title="Fee and payment" sub={`What ${payer || "the brand"} pays you, and when.`} />
      <AiNote step={3} />

      {creator.registered ? (
        <View style={{ gap: 6 }}>
          <Txt v="small" w="semibold" color={c.text2}>GST</Txt>
          <Seg label="GST" value={d.gstMode} onChange={(v) => up({ gstMode: v })} options={[{ value: "add", label: "+ GST" }, { value: "incl", label: "Incl. GST" }, { value: "none", label: "No GST" }]} />
          <Txt v="small" color={c.muted}>
            {d.gstMode === "add" ? `GST (${tax.gst_rate}%) is added on top of your fee.` : d.gstMode === "incl" ? "Your fee already includes GST; we work out the taxable value." : "No GST on this invoice."}
          </Txt>
        </View>
      ) : <Txt v="small" color={c.muted}>No GST: you haven&apos;t added a GSTIN. Add it in Settings → Edit profile to charge GST.</Txt>}
      <Field label={FEE_LABEL[d.gstMode]} check={check("fee")} error={e.fee} value={d.fee} onChangeText={(t) => { touch("fee"); up({ fee: t.replace(/[^\d.,]/g, "") }); }} keyboardType="decimal-pad" placeholder="45000" />

      <Card>
        {check("advance") && <CheckTag />}
        <Toggle label={`${who} pays an advance`} value={d.advOn} onChange={(v) => { touch("advance"); up({ advOn: v }); }} />
        {d.advOn && (<>
          <Field label="Advance amount (₹)" check={check("advance")} error={e.advance} value={d.adv} onChangeText={(t) => { touch("advance"); up({ adv: t.replace(/[^\d.,]/g, "") }); }} keyboardType="decimal-pad" placeholder="15000" />
          <Toggle label="Advance already received" value={d.advRecv} onChange={(v) => up({ advRecv: v })} />
        </>)}
      </Card>

      <Card>
        <Toggle label={`${who} deducts TDS`} value={d.tdsOn} onChange={(v) => up({ tdsOn: v })} />
        {d.tdsOn && (<>
          <Field label="TDS rate (%)" error={e.tds} value={d.tdsRate} onChangeText={(t) => up({ tdsRate: t.replace(/[^\d.]/g, "").slice(0, 5) })} keyboardType="decimal-pad" />
          <Txt v="small" color={c.muted}>Usually 10% (194J, professional fees) or 1–2% (194C, advertising contract). Ask them. TDS is on the fee, not the GST.</Txt>
        </>)}
      </Card>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt v="small" w="semibold" color={c.text2}>Balance due after invoice</Txt>
          {check("payment_terms") && <CheckTag />}
        </View>
        <Seg<Terms> label="Payment terms" value={d.terms} onChange={(v) => { touch("payment_terms"); up({ terms: v }); }}
          options={[{ value: "30", label: "30 days" }, { value: "45", label: "45 days" }, { value: "60", label: "60 days" }, { value: "custom", label: "Custom" }]} />
        {d.terms === "custom" && (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Txt>Days after invoice</Txt>
            <Stepper label="Payment days" value={d.customDays} max={365} onChange={(v) => { touch("payment_terms"); up({ customDays: v }); }} />
          </View>
        )}
        {creator.msme && <Txt v="small" color={c.muted}>45 days keeps your MSME interest claim strongest.</Txt>}
      </View>

      <Card>
        <Txt v="h2" accessibilityRole="header">Summary</Txt>
        <Txt v="small" w="semibold" color={c.muted}>{[d.brand.name, deliverablesSummary(chosen, ", ")].filter(Boolean).join(" · ")}</Txt>
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <KV k={d.gstMode === "incl" ? "Fee before GST" : "Fee"} v={inr(s.taxable)} />
          {s.gst.total > 0 && <KV k={s.gstLabel} v={inr(s.gst.total)} />}
          <KV k="Invoice total" v={inr(s.total)} />
          {d.advOn && s.advP > 0 && <KV k={d.advRecv ? "Advance received" : "Advance (on signing)"} v={minus(s.advP)} />}
          {d.tdsOn && s.tdsPct > 0 && <KV k={`TDS ${who.toLowerCase()} deducts (${s.tdsPct}%, est.)`} v={minus(s.tds)} />}
          <Hr />
          <KV strong k="Balance you receive" v={inr(Math.max(0, s.total - s.advP - s.tds))} />
        </View>
      </Card>
      <Txt v="small" color={c.muted} style={{ textAlign: "center" }}>Next you&apos;ll see the agreement before anything is sent to the brand.</Txt>
    </SubScreen>
  );
}
