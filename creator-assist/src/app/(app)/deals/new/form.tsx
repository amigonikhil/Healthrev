"use client";

import { useActionState, useMemo, useState } from "react";
import { createDeal } from "@/app/actions/deals";
import { ActionForm, Seg, SubmitButton } from "@/components/client";
import { dealSummary, type TaxConfig } from "@/lib/calc";
import { ALL_DELIVERABLES, DELIVERABLE_GROUPS, deliverableKey, deliverablesSummary, USAGE_DURATIONS, USAGE_SCOPES } from "@/lib/deliverables";
import { inr, minus, parseRupees } from "@/lib/money";
import { STATES, stateByName } from "@/lib/states";

type BrandOpt = { name: string; contact_name: string; contact_email: string; contact_whatsapp: string; state: string; gstin: string; agency_name: string; legal_name: string };

export function DealForm({ tax, creator, brands, today }: {
  tax: TaxConfig; creator: { stateCode: string; registered: boolean; terms: number; msme: boolean }; brands: BrandOpt[]; today: string;
}) {
  const [state, action, actionPending] = useActionState(createDeal, undefined);
  const [brand, setBrand] = useState<BrandOpt>({ name: "", contact_name: "", contact_email: "", contact_whatsapp: "", state: "", gstin: "", agency_name: "", legal_name: "" });
  const [paidBy, setPaidBy] = useState<"brand" | "agency">("brand");
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [qty, setQty] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState(false);
  const [fee, setFee] = useState("");
  const [advOn, setAdvOn] = useState(false);
  const [adv, setAdv] = useState("");
  const [advRecv, setAdvRecv] = useState(false);
  const [terms, setTerms] = useState(String(creator.terms) as "30" | "45" | "60");

  const set = (k: keyof BrandOpt, v: string) => setBrand((b) => ({ ...b, [k]: v }));
  const onBrandName = (v: string) => {
    const hit = brands.find((b) => b.name.toLowerCase() === v.trim().toLowerCase());
    if (hit) { setBrand({ ...hit, name: v }); setPaidBy(hit.agency_name ? "agency" : "brand"); }
    else set("name", v);
  };

  const feeP = parseRupees(fee) || 0;
  const advP = advOn ? parseRupees(adv) || 0 : 0;
  const brandState = stateByName(brand.state);
  const s = dealSummary({ feePaise: feeP, advancePaise: advOn && advRecv ? advP : 0, creatorStateCode: creator.stateCode, brandStateCode: brandState?.code, creatorRegistered: creator.registered, tax });
  const gstLabel = s.gst.kind === "igst" ? `IGST ${s.gst.rate}% (${brandState?.name})`
    : s.gst.kind === "cgst_sgst" ? `CGST ${s.gst.rate / 2}% + SGST ${s.gst.rate / 2}%`
    : creator.registered ? "GST (choose brand state)" : "GST (not registered)";

  const chosen = useMemo(
    () => ALL_DELIVERABLES.filter((d) => picked[deliverableKey(d)]).map((d) => ({ platform: d.platform, type: d.type, quantity: parseInt(qty[deliverableKey(d)] ?? String(d.defaultQty), 10) || d.defaultQty })),
    [picked, qty],
  );

  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "contents" }}>
      <label className="f">Brand
        <input name="brand" list="brand-list" value={brand.name} onChange={(e) => onBrandName(e.target.value)} placeholder="Voltra Motors Pvt Ltd" required autoComplete="organization" />
        <datalist id="brand-list">{brands.map((b) => <option key={b.name} value={b.name} />)}</datalist>
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="sub" style={{ fontWeight: 600 }}>Who pays you?</span>
        <Seg name="paid_by" label="Who pays you?" value={paidBy} onChange={setPaidBy} options={[{ value: "brand", label: "Brand directly" }, { value: "agency", label: "An agency" }]} />
      </div>
      {paidBy === "agency" && <label className="f">Agency name<input name="agency" value={brand.agency_name} onChange={(e) => set("agency_name", e.target.value)} placeholder="Spark Agency" required /></label>}
      <label className="f">{paidBy === "agency" ? "Agency contact" : "Brand contact"}<input name="contact_name" value={brand.contact_name} onChange={(e) => set("contact_name", e.target.value)} placeholder="Arjun Mehta" autoComplete="off" /></label>
      <label className="f">Contact email<input name="contact_email" type="email" value={brand.contact_email} onChange={(e) => set("contact_email", e.target.value)} placeholder="arjun@voltra.in" autoComplete="off" /></label>
      <label className="f">Contact WhatsApp<input name="contact_whatsapp" inputMode="tel" value={brand.contact_whatsapp} onChange={(e) => set("contact_whatsapp", e.target.value)} placeholder="+91 90000 12345" autoComplete="off" /></label>
      <label className="f">Brand&apos;s state
        <select name="brand_state" value={brand.state} onChange={(e) => set("state", e.target.value)} required>
          <option value="" disabled>Choose state</option>
          {STATES.map((x) => <option key={x.code} value={x.name}>{x.name} ({x.code})</option>)}
        </select>
      </label>
      <label className="f">Brand GSTIN (optional)<input name="brand_gstin" value={brand.gstin} onChange={(e) => set("gstin", e.target.value)} placeholder="29AAACV1234M1Z2" maxLength={15} style={{ textTransform: "uppercase" }} /></label>
      <input type="hidden" name="brand_legal" value={brand.legal_name} />

      <details className="card" open>
        <summary>Deliverables{chosen.length ? ` · ${deliverablesSummary(chosen, ", ")}` : ""}</summary>
        <div className="dl">
          {DELIVERABLE_GROUPS.map((g) => (
            <div key={g.group} style={{ display: "contents" }}>
              <p className="grp">{g.group}</p>
              {g.items.map((d) => {
                const k = deliverableKey(d);
                return (
                  <label key={k}>
                    <input type="checkbox" name={`dl:${k}`} checked={!!picked[k]} onChange={(e) => setPicked((p) => ({ ...p, [k]: e.target.checked }))} /> {d.label}
                    <input className="q" name={`q:${k}`} aria-label={`${d.label} quantity`} inputMode="numeric" value={qty[k] ?? String(d.defaultQty)} onChange={(e) => setQty((q) => ({ ...q, [k]: e.target.value.replace(/\D/g, "").slice(0, 3) }))} />
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </details>

      <div className="card">
        <label className="tog"><span>Usage rights for the brand</span><input type="checkbox" name="usage_on" checked={usage} onChange={(e) => setUsage(e.target.checked)} /></label>
        {usage && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="f">Duration<select name="usage_duration" defaultValue="3m">{USAGE_DURATIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
            <label className="f">Where can they use it?<select name="usage_scope" defaultValue="organic_paid">{USAGE_SCOPES.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
            <p className="sub">Included in your fee.</p>
          </div>
        )}
      </div>

      <label className="f">Total fee, before GST (₹)<input name="fee" value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" placeholder="45000" required /></label>

      <div className="card">
        <label className="tog"><span>Brand pays an advance</span><input type="checkbox" name="advance_on" checked={advOn} onChange={(e) => setAdvOn(e.target.checked)} /></label>
        {advOn && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <label className="f">Advance amount (₹)<input name="advance" value={adv} onChange={(e) => setAdv(e.target.value)} inputMode="numeric" placeholder="15000" required /></label>
            <label className="tog"><span>Advance already received</span><input type="checkbox" name="advance_received" checked={advRecv} onChange={(e) => setAdvRecv(e.target.checked)} /></label>
          </div>
        )}
      </div>

      <label className="f">Go-live date<input name="go_live" type="date" min={today} /></label>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="sub" style={{ fontWeight: 600 }}>Balance due after invoice</span>
        <Seg name="terms" label="Payment terms" value={terms} onChange={setTerms} options={[{ value: "30", label: "30 days" }, { value: "45", label: "45 days" }, { value: "60", label: "60 days" }]} />
        {creator.msme && <span className="sub">45 days keeps your MSME interest claim strongest.</span>}
      </div>

      <div className="card" aria-live="polite">
        <div className="row"><span>Fee</span><b>{inr(s.fee)}</b></div>
        <div className="row"><span>{gstLabel}</span><b>{inr(s.gst.total)}</b></div>
        <div className="row"><span>Invoice total</span><b>{inr(s.total)}</b></div>
        {advOn && advP > 0 && <div className="row"><span>{advRecv ? "Advance received" : "Advance (on signing)"}</span><b>{minus(advP)}</b></div>}
        <div className="row"><span>TDS brand deducts (est.)</span><b>{minus(s.tds)}</b></div>
        <div className="hr" />
        <div className="row"><span style={{ color: "var(--text)", fontWeight: 700 }}>Balance you receive</span><span className="big">{inr(Math.max(0, s.total - advP - s.tds))}</span></div>
      </div>

      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton name="intent" value="agreement">Next: review agreement</SubmitButton>
      <SubmitButton name="intent" value="save" className="btn sec">Save without agreement</SubmitButton>
    </ActionForm>
  );
}
