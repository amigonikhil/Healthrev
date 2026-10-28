"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { createDeal } from "@/app/actions/deals";
import { ActionForm, Seg, Stepper, SubmitButton } from "@/components/client";
import { dealSummary, type GstMode, type TaxConfig } from "@/lib/calc";
import { ALL_DELIVERABLES, DELIVERABLE_GROUPS, deliverableKey, deliverablesSummary, USAGE_MAX_MONTHS, USAGE_SCOPES } from "@/lib/deliverables";
import { inr, minus, parseRupees } from "@/lib/money";
import { PASTED_DEAL_KEY, type PasteField, type PastedDeal } from "@/lib/pasted-deal";
import { STATES, stateByName } from "@/lib/states";

type BrandOpt = { name: string; contact_name: string; contact_email: string; contact_whatsapp: string; state: string; gstin: string; agency_name: string; legal_name: string };
type Terms = "30" | "45" | "60" | "custom";

const FEE_LABEL: Record<GstMode, string> = {
  add: "Total fee, before GST (₹)",
  incl: "Total fee, including GST (₹)",
  none: "Total fee (₹)",
};

export function DealForm({ tax, creator, brands, today }: {
  tax: TaxConfig; creator: { stateCode: string; registered: boolean; terms: number; msme: boolean }; brands: BrandOpt[]; today: string;
}) {
  const [state, action, pending] = useActionState(createDeal, undefined);
  const [brand, setBrand] = useState<BrandOpt>({ name: "", contact_name: "", contact_email: "", contact_whatsapp: "", state: "", gstin: "", agency_name: "", legal_name: "" });
  const [paidBy, setPaidBy] = useState<"brand" | "agency">("brand");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, number>>({});
  const [usage, setUsage] = useState(false);
  const [months, setMonths] = useState(3);
  const [perpetual, setPerpetual] = useState(false);
  const [gstMode, setGstMode] = useState<GstMode>(creator.registered ? "add" : "none");
  const [fee, setFee] = useState("");
  const [tdsOn, setTdsOn] = useState(tax.tds_rate > 0);
  const [tdsRate, setTdsRate] = useState(String(tax.tds_rate || ""));
  const [advOn, setAdvOn] = useState(false);
  const [adv, setAdv] = useState("");
  const [advRecv, setAdvRecv] = useState(false);
  const [terms, setTerms] = useState<Terms>(["30", "45", "60"].includes(String(creator.terms)) ? (String(creator.terms) as Terms) : "45");
  const [customDays, setCustomDays] = useState(90);
  const [scope, setScope] = useState("organic_paid");
  const [goLive, setGoLive] = useState("");
  // Fields Claude filled but wasn't sure about (yellow until the creator edits them).
  const [ai, setAi] = useState<{ unsure: Set<PasteField>; other: string[]; missing: PasteField[] } | null>(null);
  const check = (f: PasteField) => !!ai?.unsure.has(f);
  const touch = (f: PasteField) => { if (ai?.unsure.has(f)) setAi({ ...ai, unsure: new Set([...ai.unsure].filter((x) => x !== f)) }); };

  // "Paste deal": prefill once from what the paste sheet left in sessionStorage, then forget it.
  useEffect(() => {
    let p: PastedDeal | null = null;
    try {
      const raw = sessionStorage.getItem(PASTED_DEAL_KEY);
      sessionStorage.removeItem(PASTED_DEAL_KEY);
      p = raw ? (JSON.parse(raw) as PastedDeal) : null;
    } catch { p = null; }
    if (!p) return;
    const saved = p.brand ? brands.find((b) => b.name.toLowerCase() === p.brand.toLowerCase()) : undefined;
    setBrand((b) => ({
      ...(saved ?? b), name: saved?.name ?? p.brand,
      contact_name: p.contactName || saved?.contact_name || "", contact_email: p.contactEmail || saved?.contact_email || "",
      contact_whatsapp: p.contactWhatsapp || saved?.contact_whatsapp || "",
    }));
    if (saved?.agency_name) setPaidBy("agency");
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
  }, [brands, creator.registered]);

  const set = (k: keyof BrandOpt, v: string) => setBrand((b) => ({ ...b, [k]: v }));
  const onBrandName = (v: string) => {
    const hit = brands.find((b) => b.name.toLowerCase() === v.trim().toLowerCase());
    if (hit) { setBrand({ ...hit, name: v }); setPaidBy(hit.agency_name ? "agency" : "brand"); }
    else set("name", v);
  };

  const feeP = parseRupees(fee) || 0;
  const advP = advOn ? parseRupees(adv) || 0 : 0;
  const tdsPct = tdsOn ? Math.min(100, Math.max(0, parseFloat(tdsRate) || 0)) : 0;
  const brandState = stateByName(brand.state);
  const s = dealSummary({
    feePaise: feeP, gstMode, tdsRate: tdsPct, advancePaise: advOn && advRecv ? advP : 0,
    creatorStateCode: creator.stateCode, brandStateCode: brandState?.code, creatorRegistered: creator.registered, tax,
  });
  const gstLabel = s.gst.kind === "igst" ? `IGST ${s.gst.rate}% (${brandState?.name})`
    : s.gst.kind === "cgst_sgst" ? `CGST ${s.gst.rate / 2}% + SGST ${s.gst.rate / 2}%`
    : gstMode === "none" ? "GST" : "GST (choose brand state)";

  const chosen = useMemo(
    () => ALL_DELIVERABLES.filter((d) => picked[deliverableKey(d)]).map((d) => ({ platform: d.platform, type: d.type, quantity: qty[deliverableKey(d)] ?? d.defaultQty })),
    [picked, qty],
  );
  const termsDays = terms === "custom" ? customDays : Number(terms);

  return (
    <ActionForm action={action} pending={pending} style={{ display: "contents" }}>
      {ai && (
        <div className="info" role="status">
          Filled in from your paste. Check everything, especially the <mark className="ai-mark">fields in yellow</mark>
          {ai.missing.length > 0 && <>, and add the {listOf(ai.missing.map((f) => MISSING_LABEL[f]))}</>}. Nothing is saved until you tap Next or Save.
          {ai.other.length > 0 && <><br />Also mentioned, not in our deliverables list: {ai.other.join(", ")}.</>}
        </div>
      )}
      <label className={`f${check("brand_name") ? " ai-check" : ""}`}><Lab f="brand_name" on={check}>Brand</Lab>
        <input name="brand" list="brand-list" value={brand.name} onChange={(e) => { touch("brand_name"); onBrandName(e.target.value); }} placeholder="Voltra Motors Pvt Ltd" required autoComplete="organization" />
        <datalist id="brand-list">{brands.map((b) => <option key={b.name} value={b.name} />)}</datalist>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="sub" style={{ fontWeight: 600 }}>Who pays you?</span>
        <Seg name="paid_by" label="Who pays you?" value={paidBy} onChange={setPaidBy} options={[{ value: "brand", label: "Brand directly" }, { value: "agency", label: "An agency" }]} />
      </div>
      {paidBy === "agency" && <label className="f">Agency name<input name="agency" value={brand.agency_name} onChange={(e) => set("agency_name", e.target.value)} placeholder="Spark Agency" required /></label>}
      <label className={`f${check("contact_name") ? " ai-check" : ""}`}><Lab f="contact_name" on={check}>{paidBy === "agency" ? "Agency contact" : "Brand contact"}</Lab><input name="contact_name" value={brand.contact_name} onChange={(e) => { touch("contact_name"); set("contact_name", e.target.value); }} placeholder="Arjun Mehta" autoComplete="off" /></label>
      <label className={`f${check("contact_email") ? " ai-check" : ""}`}><Lab f="contact_email" on={check}>Contact email</Lab><input name="contact_email" type="email" value={brand.contact_email} onChange={(e) => { touch("contact_email"); set("contact_email", e.target.value); }} placeholder="arjun@voltra.in" autoComplete="off" /></label>
      <label className={`f${check("contact_whatsapp") ? " ai-check" : ""}`}><Lab f="contact_whatsapp" on={check}>Contact WhatsApp</Lab><input name="contact_whatsapp" inputMode="tel" value={brand.contact_whatsapp} onChange={(e) => { touch("contact_whatsapp"); set("contact_whatsapp", e.target.value); }} placeholder="+91 90000 12345" autoComplete="off" /></label>
      <label className="f">Brand&apos;s state
        <select name="brand_state" value={brand.state} onChange={(e) => set("state", e.target.value)} required>
          <option value="" disabled>Choose state</option>
          {STATES.map((x) => <option key={x.code} value={x.name}>{x.name} ({x.code})</option>)}
        </select>
      </label>
      <label className="f">Brand GSTIN (optional)<input name="brand_gstin" value={brand.gstin} onChange={(e) => set("gstin", e.target.value)} placeholder="29AAACV1234M1Z2" maxLength={15} style={{ textTransform: "uppercase" }} /></label>
      <input type="hidden" name="brand_legal" value={brand.legal_name} />

      <details className={`card${check("deliverables") ? " ai-check" : ""}`} open>
        <summary>Deliverables{chosen.length ? ` · ${deliverablesSummary(chosen, ", ")}` : ""}{check("deliverables") && <span className="ai-tag">Check</span>}</summary>
        <div className="dl">
          {DELIVERABLE_GROUPS.map((g, gi) => {
            const n = g.items.filter((d) => picked[deliverableKey(d)]).length;
            return (
              <details key={g.group} className="pg" open={gi === 0}>
                <summary>{g.group}{n > 0 && <span className="n">{n} selected</span>}</summary>
                {g.items.map((d) => {
                  const k = deliverableKey(d);
                  const on = !!picked[k];
                  return (
                    <div className="drow" key={k}>
                      <label>
                        <input type="checkbox" name={`dl:${k}`} checked={on} onChange={(e) => { touch("deliverables"); setPicked((p) => ({ ...p, [k]: e.target.checked })); }} /> {d.label}
                      </label>
                      {on && (
                        <Stepper
                          name={`q:${k}`} label={d.unit ? `${d.label}` : `${d.label} quantity`}
                          value={qty[k] ?? d.defaultQty} max={d.unit === "days" ? 365 : 99}
                          onChange={(v) => { touch("deliverables"); setQty((q) => ({ ...q, [k]: v })); }}
                        />
                      )}
                    </div>
                  );
                })}
              </details>
            );
          })}
        </div>
      </details>

      <div className={`card${check("usage_rights") ? " ai-check" : ""}`} onChange={() => touch("usage_rights")}>
        <label className="tog"><span>Usage rights for the brand{check("usage_rights") && <span className="ai-tag">Check</span>}</span><input type="checkbox" name="usage_on" checked={usage} onChange={(e) => setUsage(e.target.checked)} /></label>
        {usage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="row" style={{ opacity: perpetual ? 0.45 : 1 }}>
              <span>Duration (months)</span>
              <Stepper label="usage months" value={months} max={USAGE_MAX_MONTHS} onChange={(v) => { touch("usage_rights"); setMonths(v); }} disabled={perpetual} />
            </div>
            <label className="tog"><span>Perpetual (no end date)</span><input type="checkbox" checked={perpetual} onChange={(e) => setPerpetual(e.target.checked)} /></label>
            <input type="hidden" name="usage_duration" value={perpetual ? "perpetual" : `${months}m`} />
            <label className="f">Where can they use it?<select name="usage_scope" value={scope} onChange={(e) => setScope(e.target.value)}>{USAGE_SCOPES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
            <p className="sub">Included in your fee.</p>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="sub" style={{ fontWeight: 600 }}>GST</span>
        {creator.registered ? (<>
          <Seg name="gst_mode" label="GST" value={gstMode} onChange={setGstMode}
            options={[{ value: "add", label: "+ GST" }, { value: "incl", label: "Incl. GST" }, { value: "none", label: "No GST" }]} />
          <span className="sub">
            {gstMode === "add" ? `GST (${tax.gst_rate}%) is added on top of your fee.` : gstMode === "incl" ? "Your fee already includes GST; we work out the taxable value." : "No GST on this invoice."}
          </span>
        </>) : (<>
          <input type="hidden" name="gst_mode" value="none" />
          <p className="sub">No GST: you haven&apos;t added a GSTIN. Add it in Settings → Edit profile to charge GST.</p>
        </>)}
      </div>

      <label className={`f${check("fee") ? " ai-check" : ""}`}><Lab f="fee" on={check}>{FEE_LABEL[gstMode]}</Lab><input name="fee" value={fee} onChange={(e) => { touch("fee"); setFee(e.target.value); }} inputMode="numeric" placeholder="45000" required /></label>

      <div className="card">
        <label className="tog"><span>Brand deducts TDS</span><input type="checkbox" name="tds_on" checked={tdsOn} onChange={(e) => setTdsOn(e.target.checked)} /></label>
        {tdsOn && (<>
          <label className="f">TDS rate (%)<input name="tds_rate" value={tdsRate} onChange={(e) => setTdsRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} inputMode="decimal" required /></label>
          <p className="sub">Usually 10% (194J, professional fees) or 1–2% (194C, advertising contract). Ask the brand. TDS is on the fee, not the GST.</p>
        </>)}
      </div>

      <div className={`card${check("advance") ? " ai-check" : ""}`} onChange={() => touch("advance")}>
        <label className="tog"><span>Brand pays an advance{check("advance") && <span className="ai-tag">Check</span>}</span><input type="checkbox" name="advance_on" checked={advOn} onChange={(e) => setAdvOn(e.target.checked)} /></label>
        {advOn && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="f">Advance amount (₹)<input name="advance" value={adv} onChange={(e) => setAdv(e.target.value)} inputMode="numeric" placeholder="15000" required /></label>
            <label className="tog"><span>Advance already received</span><input type="checkbox" name="advance_received" checked={advRecv} onChange={(e) => setAdvRecv(e.target.checked)} /></label>
          </div>
        )}
      </div>

      <label className={`f${check("go_live_date") ? " ai-check" : ""}`}><Lab f="go_live_date" on={check}>Go-live date</Lab><input name="go_live" type="date" min={today} value={goLive} onChange={(e) => { touch("go_live_date"); setGoLive(e.target.value); }} /></label>
      <div className={check("payment_terms") ? "ai-check ai-box" : undefined} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="sub" style={{ fontWeight: 600 }}>Balance due after invoice{check("payment_terms") && <span className="ai-tag">Check</span>}</span>
        <Seg label="Payment terms" value={terms} onChange={(v) => { touch("payment_terms"); setTerms(v); }}
          options={[{ value: "30", label: "30 days" }, { value: "45", label: "45 days" }, { value: "60", label: "60 days" }, { value: "custom", label: "Custom" }]} />
        {terms === "custom" && (
          <div className="row"><span>Days after invoice</span><Stepper label="payment days" value={customDays} max={365} onChange={(v) => { touch("payment_terms"); setCustomDays(v); }} /></div>
        )}
        <input type="hidden" name="terms" value={termsDays} />
        {creator.msme && <span className="sub">45 days keeps your MSME interest claim strongest.</span>}
      </div>

      <div className="card" aria-live="polite">
        <div className="row"><span>{gstMode === "incl" ? "Fee before GST" : "Fee"}</span><b>{inr(s.taxable)}</b></div>
        {s.gst.total > 0 && <div className="row"><span>{gstLabel}</span><b>{inr(s.gst.total)}</b></div>}
        <div className="row"><span>Invoice total</span><b>{inr(s.total)}</b></div>
        {advOn && advP > 0 && <div className="row"><span>{advRecv ? "Advance received" : "Advance (on signing)"}</span><b>{minus(advP)}</b></div>}
        {tdsOn && tdsPct > 0 && <div className="row"><span>TDS brand deducts ({tdsPct}%, est.)</span><b>{minus(s.tds)}</b></div>}
        <div className="hr" />
        <div className="row"><span style={{ color: "var(--text)", fontWeight: 700 }}>Balance you receive</span><span className="big">{inr(Math.max(0, s.total - advP - s.tds))}</span></div>
      </div>

      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton name="intent" value="agreement">Next: review agreement</SubmitButton>
      <SubmitButton name="intent" value="save" className="btn sec">Save without agreement</SubmitButton>
    </ActionForm>
  );
}

const MISSING_LABEL: Record<PasteField, string> = {
  brand_name: "brand", contact_name: "contact", contact_email: "contact email", contact_whatsapp: "WhatsApp number",
  deliverables: "deliverables", fee: "fee", advance: "advance", usage_rights: "usage rights", go_live_date: "go-live date", payment_terms: "payment terms",
};
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** Field label with a "Check" tag when the AI wasn't sure about the value. */
function Lab({ f, on, children }: { f: PasteField; on: (f: PasteField) => boolean; children: React.ReactNode }) {
  return <span className="ai-lab">{children}{on(f) && <span className="ai-tag">Check</span>}</span>;
}
