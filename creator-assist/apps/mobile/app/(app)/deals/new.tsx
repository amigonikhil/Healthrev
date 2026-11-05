import Ionicons from "@expo/vector-icons/Ionicons";
import { dealSummary, type GstMode } from "@creator-assist/shared/calc";
import { ALL_DELIVERABLES, DELIVERABLE_GROUPS, deliverableKey, deliverablesSummary, USAGE_MAX_MONTHS, USAGE_SCOPES } from "@creator-assist/shared/deliverables";
import { inr, minus, parseRupees } from "@creator-assist/shared/money";
import type { PasteField } from "@creator-assist/shared/pasted-deal";
import { STATES, stateByName } from "@creator-assist/shared/states";
import { radius } from "@creator-assist/shared/tokens";
import type { Brand } from "@creator-assist/shared/types";
import { Stack, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { offerPushAfterDeal } from "@/components/push-offer";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { takePasted } from "@/lib/pasted";
import { errorText, useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import {
  Button, Card, CheckTag, DateField, Field, Hr, KV, ListItem, LoadError, Note, Seg, Select, Skeleton, Stepper, SubScreen, TAP, Toggle, Txt,
} from "@/ui";

type Terms = "30" | "45" | "60" | "custom";
const FEE_LABEL: Record<GstMode, string> = { add: "Total fee, before GST (₹)", incl: "Total fee, including GST (₹)", none: "Total fee (₹)" };
const STATE_OPTIONS = STATES.map((s) => ({ value: s.name, label: `${s.name} (${s.code})` }));
const blank = { name: "", contact_name: "", contact_email: "", contact_whatsapp: "", state: "", gstin: "", agency_name: "", legal_name: "" };

export default function NewDeal() {
  const { data, error, reload } = useLoad(() => api.deals.options());
  return (
    <>
      <Stack.Screen options={{ title: "New paid collab" }} />
      {!data ? (
        <SubScreen>{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={5} />}</SubScreen>
      ) : <DealForm o={data} />}
    </>
  );
}

function DealForm({ o }: { o: Awaited<ReturnType<typeof api.deals.options>> }) {
  const { c } = useTheme();
  const router = useRouter();
  const { tax, creator, brands, today } = o;
  const [brand, setBrand] = useState(blank);
  const [paidBy, setPaidBy] = useState<"brand" | "agency">("brand");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [openGroup, setOpenGroup] = useState<string | null>(DELIVERABLE_GROUPS[0].group);
  const [usage, setUsage] = useState(false);
  const [months, setMonths] = useState(3);
  const [perpetual, setPerpetual] = useState(false);
  const [scope, setScope] = useState("organic_paid");
  const [gstMode, setGstMode] = useState<GstMode>(creator.registered ? "add" : "none");
  const [fee, setFee] = useState("");
  const [tdsOn, setTdsOn] = useState(tax.tds_rate > 0);
  const [tdsRate, setTdsRate] = useState(String(tax.tds_rate || ""));
  const [advOn, setAdvOn] = useState(false);
  const [adv, setAdv] = useState("");
  const [advRecv, setAdvRecv] = useState(false);
  const [goLive, setGoLive] = useState("");
  const [terms, setTerms] = useState<Terms>(["30", "45", "60"].includes(String(creator.terms)) ? (String(creator.terms) as Terms) : "45");
  const [customDays, setCustomDays] = useState(90);
  const [busy, setBusy] = useState<"agreement" | "save" | null>(null);
  const [err, setErr] = useState("");
  const pasteOn = useFlag("deal_from_chat");
  // Filled in from a pasted chat: fields the AI wasn't sure about stay yellow until edited.
  const [ai, setAi] = useState<{ unsure: Set<PasteField>; other: string[]; missing: PasteField[] } | null>(null);
  const check = (f: PasteField) => !!ai?.unsure.has(f);
  const touch = (f: PasteField) => { if (ai?.unsure.has(f)) setAi({ ...ai, unsure: new Set([...ai.unsure].filter((x) => x !== f)) }); };
  useEffect(() => {
    const p = takePasted();
    if (!p) return;
    const saved = p.brand ? brands.find((b) => b.name.toLowerCase() === p.brand.toLowerCase()) : undefined;
    if (saved) pickBrand(saved);
    setBrand((b) => ({
      ...b, name: saved?.name ?? p.brand,
      contact_name: p.contactName || saved?.contact_name || "", contact_email: p.contactEmail || saved?.contact_email || "",
      contact_whatsapp: p.contactWhatsapp || saved?.contact_whatsapp || "",
    }));
    setPicked(Object.fromEntries(p.deliverables.map((d) => [d.key, true])));
    setQty(Object.fromEntries(p.deliverables.map((d) => [d.key, d.quantity])));
    if (p.usage) { setUsage(true); setMonths(p.usage.months); setPerpetual(p.usage.perpetual); setScope(p.usage.scope); }
    if (creator.registered && p.feeGst !== "not_mentioned") setGstMode(p.feeGst === "including_gst" ? "incl" : "add");
    if (p.fee !== null) setFee(String(p.fee));
    if (p.advance !== null) { setAdvOn(true); setAdv(String(p.advance)); }
    if (p.goLive) setGoLive(p.goLive);
    if (p.termsDays !== null) {
      if ([30, 45, 60].includes(p.termsDays)) setTerms(String(p.termsDays) as Terms);
      else { setTerms("custom"); setCustomDays(p.termsDays); }
    }
    setAi({ unsure: new Set(p.unsure), other: p.otherDeliverables, missing: p.missing });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof typeof blank) => (v: string) => setBrand((b) => ({ ...b, [k]: v }));
  const pickBrand = (b: Brand) => {
    setBrand({
      name: b.name, contact_name: b.contact_name ?? "", contact_email: b.contact_email ?? "", contact_whatsapp: b.contact_whatsapp ?? "",
      state: b.state ?? "", gstin: b.gstin ?? "", agency_name: b.agency_name ?? "", legal_name: b.legal_name ?? "",
    });
    setPaidBy(b.agency_name ? "agency" : "brand");
  };
  const q = brand.name.trim().toLowerCase();
  const suggestions = q ? brands.filter((b) => b.name.toLowerCase().includes(q) && b.name.toLowerCase() !== q).slice(0, 4) : [];

  const feeP = parseRupees(fee) || 0;
  const advP = advOn ? parseRupees(adv) || 0 : 0;
  const tdsPct = tdsOn ? Math.min(100, Math.max(0, parseFloat(tdsRate) || 0)) : 0;
  const brandState = stateByName(brand.state);
  const s = dealSummary({
    feePaise: feeP, gstMode, tdsRate: tdsPct, advancePaise: advOn && advRecv ? advP : 0,
    creatorStateCode: creator.stateCode, brandStateCode: brandState?.code, creatorRegistered: creator.registered, tax,
  });
  const gstLabel = s.gst.kind === "igst" ? `IGST ${s.gst.rate}% (${brandState?.name})`
    : s.gst.kind === "cgst_sgst" ? `CGST ${s.gst.rate / 2}% + SGST ${s.gst.rate / 2}%` : "GST";
  const chosen = useMemo(
    () => ALL_DELIVERABLES.filter((d) => picked[deliverableKey(d)]).map((d) => ({ platform: d.platform, type: d.type, quantity: qty[deliverableKey(d)] ?? d.defaultQty })),
    [picked, qty],
  );
  const termsDays = terms === "custom" ? customDays : Number(terms);

  async function submit(intent: "agreement" | "save") {
    setBusy(intent); setErr("");
    try {
      const { id } = await api.deals.create({
        brand: brand.name, paidBy, agency: paidBy === "agency" ? brand.agency_name : null, brandLegal: brand.legal_name || null,
        contactName: brand.contact_name || null, contactEmail: brand.contact_email || null, contactWhatsapp: brand.contact_whatsapp || null,
        brandState: brand.state, brandGstin: brand.gstin || null,
        feePaise: feeP, gstMode, tds: tdsOn ? { rate: tdsPct } : null,
        advance: advOn ? { paise: advP, received: advRecv } : null,
        goLive: goLive || null, termsDays, deliverables: chosen,
        usage: usage ? { duration: perpetual ? "perpetual" : `${months}m`, scope } : null,
      });
      router.replace(intent === "agreement" ? `/deals/${id}/agreement` : `/deals/${id}`);
      void offerPushAfterDeal();
    } catch (e) {
      setErr(errorText(e)); setBusy(null);
    }
  }

  return (
    <SubScreen>
      {ai ? (
        <Note>
          Filled in from your chat. Check everything, especially the fields marked Check{ai.missing.length ? `, and add the ${listOf(ai.missing.map((f) => MISSING_LABEL[f]))}` : ""}. Nothing is saved until you tap Next or Save.
          {ai.other.length ? `\nAlso mentioned, not in our deliverables list: ${ai.other.join(", ")}.` : ""}
        </Note>
      ) : pasteOn ? (
        <ListItem title="Paste a chat instead" sub="We'll fill this in from the brand's message or a screenshot" onPress={() => router.push("/deals/paste")} />
      ) : null}
      <Field label="Brand" check={check("brand_name")} value={brand.name} onChangeText={(v) => { touch("brand_name"); const hit = brands.find((b) => b.name.toLowerCase() === v.trim().toLowerCase()); if (hit) pickBrand(hit); else set("name")(v); }} placeholder="Voltra Motors Pvt Ltd" textContentType="organizationName" autoCorrect={false} />
      {suggestions.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }} accessibilityLabel="Saved brands">
          {suggestions.map((b) => (
            <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`Use saved brand ${b.name}`} onPress={() => pickBrand(b)}
              style={{ minHeight: TAP, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: c.surface2, justifyContent: "center" }}>
              <Txt v="chip" w="semibold">{b.name}</Txt>
            </Pressable>
          ))}
        </View>
      )}
      <Txt v="small" w="semibold" color={c.text2}>Who pays you?</Txt>
      <Seg label="Who pays you?" value={paidBy} onChange={setPaidBy} options={[{ value: "brand", label: "Brand directly" }, { value: "agency", label: "An agency" }]} />
      {paidBy === "agency" && <Field label="Agency name" value={brand.agency_name} onChangeText={set("agency_name")} placeholder="Spark Agency" />}
      <Field label={paidBy === "agency" ? "Agency contact" : "Brand contact"} check={check("contact_name")} value={brand.contact_name} onChangeText={(v) => { touch("contact_name"); set("contact_name")(v); }} placeholder="Arjun Mehta" autoComplete="off" />
      <Field label="Contact email" check={check("contact_email")} value={brand.contact_email} onChangeText={(v) => { touch("contact_email"); set("contact_email")(v); }} placeholder="arjun@voltra.in" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="off" />
      <Field label="Contact WhatsApp" check={check("contact_whatsapp")} value={brand.contact_whatsapp} onChangeText={(v) => { touch("contact_whatsapp"); set("contact_whatsapp")(v); }} placeholder="+91 90000 12345" keyboardType="phone-pad" autoComplete="off" />
      <Select label="Brand's state" value={brand.state} options={STATE_OPTIONS} onChange={set("state")} placeholder="Choose state" />
      <Field label="Brand GSTIN (optional)" value={brand.gstin} onChangeText={(t) => set("gstin")(t.toUpperCase())} placeholder="29AAACV1234M1Z2" maxLength={15} autoCapitalize="characters" autoCorrect={false} />

      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt v="h2" accessibilityRole="header">Deliverables</Txt>
          {check("deliverables") && <CheckTag />}
        </View>
        {chosen.length > 0 && <Txt v="small" color={c.muted}>{deliverablesSummary(chosen, ", ")}</Txt>}
        {DELIVERABLE_GROUPS.map((g) => {
          const n = g.items.filter((d) => picked[deliverableKey(d)]).length;
          const open = openGroup === g.group;
          return (
            <View key={g.group} style={{ gap: 4 }}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${g.group}${n ? `, ${n} selected` : ""}`}
                onPress={() => setOpenGroup(open ? null : g.group)} style={{ minHeight: TAP, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Txt w="bold" style={{ flex: 1 }}>{g.group}{n ? <Txt v="small" w="semibold" color={c.muted}>  · {n} selected</Txt> : null}</Txt>
                <Ionicons name={open ? "chevron-up" : "chevron-down"} size={20} color={c.muted} />
              </Pressable>
              {open && g.items.map((d) => {
                const k = deliverableKey(d);
                const on = !!picked[k];
                return (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 10, minHeight: TAP }}>
                    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={d.label}
                      onPress={() => { touch("deliverables"); setPicked((p) => ({ ...p, [k]: !on })); }} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minHeight: TAP }}>
                      <Ionicons name={on ? "checkbox" : "square-outline"} size={24} color={on ? c.text : c.muted} />
                      <Txt style={{ flex: 1 }}>{d.label}</Txt>
                    </Pressable>
                    {on && <Stepper label={d.unit ? d.label : `${d.label} quantity`} value={qty[k] ?? d.defaultQty} max={d.unit === "days" ? 365 : 99} onChange={(v) => { touch("deliverables"); setQty((x) => ({ ...x, [k]: v })); }} />}
                  </View>
                );
              })}
              <Hr />
            </View>
          );
        })}
      </Card>

      <Card>
        {check("usage_rights") && <CheckTag />}
        <Toggle label="Usage rights for the brand" value={usage} onChange={(v) => { touch("usage_rights"); setUsage(v); }} />
        {usage && (<>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", opacity: perpetual ? 0.45 : 1 }}>
            <Txt>Duration (months)</Txt>
            <Stepper label="Usage months" value={months} max={USAGE_MAX_MONTHS} onChange={(v) => { touch("usage_rights"); setMonths(v); }} disabled={perpetual} />
          </View>
          <Toggle label="Perpetual (no end date)" value={perpetual} onChange={setPerpetual} />
          <Select label="Where can they use it?" value={scope} options={USAGE_SCOPES.map((u) => ({ value: u.value, label: u.label }))} onChange={setScope} />
          <Txt v="small" color={c.muted}>Included in your fee.</Txt>
        </>)}
      </Card>

      <Txt v="small" w="semibold" color={c.text2}>GST</Txt>
      {creator.registered ? (<>
        <Seg label="GST" value={gstMode} onChange={setGstMode} options={[{ value: "add", label: "+ GST" }, { value: "incl", label: "Incl. GST" }, { value: "none", label: "No GST" }]} />
        <Txt v="small" color={c.muted}>
          {gstMode === "add" ? `GST (${tax.gst_rate}%) is added on top of your fee.` : gstMode === "incl" ? "Your fee already includes GST; we work out the taxable value." : "No GST on this invoice."}
        </Txt>
      </>) : <Txt v="small" color={c.muted}>No GST: you haven&apos;t added a GSTIN. Add it in Settings → Edit profile to charge GST.</Txt>}
      <Field label={FEE_LABEL[gstMode]} check={check("fee")} value={fee} onChangeText={(t) => { touch("fee"); setFee(t.replace(/[^\d.,]/g, "")); }} keyboardType="decimal-pad" placeholder="45000" />

      <Card>
        <Toggle label="Brand deducts TDS" value={tdsOn} onChange={setTdsOn} />
        {tdsOn && (<>
          <Field label="TDS rate (%)" value={tdsRate} onChangeText={(t) => setTdsRate(t.replace(/[^\d.]/g, "").slice(0, 5))} keyboardType="decimal-pad" />
          <Txt v="small" color={c.muted}>Usually 10% (194J, professional fees) or 1–2% (194C, advertising contract). Ask the brand. TDS is on the fee, not the GST.</Txt>
        </>)}
      </Card>

      <Card>
        {check("advance") && <CheckTag />}
        <Toggle label="Brand pays an advance" value={advOn} onChange={(v) => { touch("advance"); setAdvOn(v); }} />
        {advOn && (<>
          <Field label="Advance amount (₹)" check={check("advance")} value={adv} onChangeText={(t) => { touch("advance"); setAdv(t.replace(/[^\d.,]/g, "")); }} keyboardType="decimal-pad" placeholder="15000" />
          <Toggle label="Advance already received" value={advRecv} onChange={setAdvRecv} />
        </>)}
      </Card>

      {check("go_live_date") && <CheckTag />}
      <DateField label="Go-live date" value={goLive} onChange={(v) => { touch("go_live_date"); setGoLive(v); }} min={today} clearable placeholder="Optional" />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Txt v="small" w="semibold" color={c.text2}>Balance due after invoice</Txt>
        {check("payment_terms") && <CheckTag />}
      </View>
      <Seg label="Payment terms" value={terms} onChange={(v) => { touch("payment_terms"); setTerms(v); }} options={[{ value: "30", label: "30 days" }, { value: "45", label: "45 days" }, { value: "60", label: "60 days" }, { value: "custom", label: "Custom" }]} />
      {terms === "custom" && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Txt>Days after invoice</Txt>
          <Stepper label="Payment days" value={customDays} max={365} onChange={(v) => { touch("payment_terms"); setCustomDays(v); }} />
        </View>
      )}
      {creator.msme && <Txt v="small" color={c.muted}>45 days keeps your MSME interest claim strongest.</Txt>}

      <Card>
        <View accessibilityLiveRegion="polite" style={{ gap: 8 }}>
          <KV k={gstMode === "incl" ? "Fee before GST" : "Fee"} v={inr(s.taxable)} />
          {s.gst.total > 0 && <KV k={gstLabel} v={inr(s.gst.total)} />}
          <KV k="Invoice total" v={inr(s.total)} />
          {advOn && advP > 0 && <KV k={advRecv ? "Advance received" : "Advance (on signing)"} v={minus(advP)} />}
          {tdsOn && tdsPct > 0 && <KV k={`TDS brand deducts (${tdsPct}%, est.)`} v={minus(s.tds)} />}
          <Hr />
          <KV strong k="Balance you receive" v={inr(Math.max(0, s.total - advP - s.tds))} />
        </View>
      </Card>

      {err ? <Note tone="warn">{err}</Note> : null}
      <Button title="Next: review agreement" busy={busy === "agreement"} disabled={!!busy} onPress={() => submit("agreement")} />
      <Button title="Save without agreement" kind="secondary" busy={busy === "save"} disabled={!!busy} onPress={() => submit("save")} />
    </SubScreen>
  );
}

const MISSING_LABEL: Record<PasteField, string> = {
  brand_name: "brand", contact_name: "contact", contact_email: "contact email", contact_whatsapp: "WhatsApp number",
  deliverables: "deliverables", fee: "fee", advance: "advance", usage_rights: "usage rights", go_live_date: "go-live date", payment_terms: "payment terms",
};
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
