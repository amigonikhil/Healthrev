import { dealSummary, type GstMode } from "@creator-assist/shared/calc";
import { ALL_DELIVERABLES, deliverableKey, USAGE_MAX_MONTHS } from "@creator-assist/shared/deliverables";
import { parseRupees } from "@creator-assist/shared/money";
import type { PastedDeal, PasteField } from "@creator-assist/shared/pasted-deal";
import { stateByCode, stateByName } from "@creator-assist/shared/states";
import { radius } from "@creator-assist/shared/tokens";
import type { Brand } from "@creator-assist/shared/types";
import { EMAIL_RE, GSTIN_RE } from "@creator-assist/shared/validate";
import { useFocusEffect, useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { View } from "react-native";
import { offerPushAfterDeal } from "@/components/push-offer";
import { api } from "@/lib/api";
import { takePasted } from "@/lib/pasted";
import { errorText, useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Txt } from "@/ui";

// The New deal wizard: three screens (Brand → Deliverables → Fee and payment) that share one
// draft, held by the wizard's layout. Leaving the wizard drops the draft; nothing is saved until
// the creator taps Save or Review agreement on the last step.

export type Options = Awaited<ReturnType<typeof api.deals.options>>;
export type Terms = "30" | "45" | "60" | "custom";
const blankBrand = { name: "", contact_name: "", contact_email: "", contact_whatsapp: "", state: "", gstin: "", agency_name: "", legal_name: "" };
export type BrandDraft = typeof blankBrand;

type Draft = {
  brand: BrandDraft;
  paidBy: "brand" | "agency";
  picked: Record<string, boolean>;
  qty: Record<string, number>;
  usage: boolean; months: number; perpetual: boolean; scope: string;
  goLive: string;
  gstMode: GstMode; fee: string;
  tdsOn: boolean; tdsRate: string;
  advOn: boolean; adv: string; advRecv: boolean;
  terms: Terms; customDays: number;
};

const initial = (o: Options): Draft => ({
  brand: blankBrand, paidBy: "brand", picked: {}, qty: {},
  usage: false, months: 3, perpetual: false, scope: "organic_paid", goLive: "",
  gstMode: o.creator.registered ? "add" : "none", fee: "",
  tdsOn: o.tax.tds_rate > 0, tdsRate: String(o.tax.tds_rate || ""),
  advOn: false, adv: "", advRecv: false,
  terms: ["30", "45", "60"].includes(String(o.creator.terms)) ? (String(o.creator.terms) as Terms) : "45", customDays: 90,
});

const brandFrom = (b: Brand): BrandDraft => ({
  name: b.name, contact_name: b.contact_name ?? "", contact_email: b.contact_email ?? "", contact_whatsapp: b.contact_whatsapp ?? "",
  state: b.state ?? "", gstin: b.gstin ?? "", agency_name: b.agency_name ?? "", legal_name: b.legal_name ?? "",
});

/** A fresh draft filled in from a pasted chat (what the AI found, else the saved brand's details). */
function fromPasted(o: Options, p: PastedDeal): Draft {
  const d = initial(o);
  const saved = p.brand ? o.brands.find((b) => b.name.toLowerCase() === p.brand.toLowerCase()) : undefined;
  const base = saved ? brandFrom(saved) : blankBrand;
  d.brand = {
    ...base, name: saved?.name ?? p.brand,
    contact_name: p.contactName || base.contact_name, contact_email: p.contactEmail || base.contact_email,
    contact_whatsapp: p.contactWhatsapp || base.contact_whatsapp,
    agency_name: p.agency || base.agency_name, state: p.state || base.state, gstin: p.gstin || base.gstin,
  };
  d.paidBy = p.paidBy === "agency" || (!p.paidBy && saved?.agency_name) ? "agency" : "brand";
  d.picked = Object.fromEntries(p.deliverables.map((x) => [x.key, true]));
  d.qty = Object.fromEntries(p.deliverables.map((x) => [x.key, x.quantity]));
  if (p.usage) { d.usage = true; d.months = p.usage.months; d.perpetual = p.usage.perpetual; d.scope = p.usage.scope; }
  if (o.creator.registered && p.feeGst !== "not_mentioned") d.gstMode = p.feeGst === "including_gst" ? "incl" : "add";
  if (p.fee !== null) d.fee = String(p.fee);
  if (p.advance !== null) { d.advOn = true; d.adv = String(p.advance); }
  if (p.goLive) d.goLive = p.goLive;
  if (p.termsDays !== null) {
    if ([30, 45, 60].includes(p.termsDays)) d.terms = String(p.termsDays) as Terms;
    else { d.terms = "custom"; d.customDays = p.termsDays; }
  }
  return d;
}

export type Step = 1 | 2 | 3;
export type Problems = Partial<Record<"brand" | "agency" | "state" | "email" | "gstin" | "deliverables" | "fee" | "advance" | "tds", string>>;

/** What stops a step from moving on, in the server's words (it checks the same again on save). */
function problemsFor(step: Step, d: Draft): Problems {
  const p: Problems = {};
  if (step === 1) {
    if (!d.brand.name.trim()) p.brand = "Enter the brand name";
    if (d.paidBy === "agency" && !d.brand.agency_name.trim()) p.agency = "Enter the agency name";
    if (!stateByName(d.brand.state)) p.state = d.paidBy === "agency" ? "Choose the agency's state (decides IGST vs CGST + SGST)" : "Choose the brand's state (decides IGST vs CGST + SGST)";
    if (d.brand.contact_email.trim() && !EMAIL_RE.test(d.brand.contact_email.trim())) p.email = "Contact email doesn't look right";
    if (d.brand.gstin && !GSTIN_RE.test(d.brand.gstin)) p.gstin = "GSTIN doesn't look right (15 characters, e.g. 29AAACV1234M1Z2)";
  }
  if (step === 2 && !ALL_DELIVERABLES.some((x) => d.picked[deliverableKey(x)])) p.deliverables = "Pick at least one deliverable";
  if (step === 3) {
    const fee = parseRupees(d.fee) || 0;
    const adv = parseRupees(d.adv) || 0;
    if (fee <= 0) p.fee = "Enter the total fee";
    if (d.advOn && adv <= 0) p.advance = "Enter the advance amount";
    else if (d.advOn && fee > 0 && adv > fee) p.advance = "Advance can't be more than the fee";
    const r = parseFloat(d.tdsRate);
    if (d.tdsOn && !(r > 0 && r <= 100)) p.tds = "Enter the TDS rate (e.g. 10), or switch TDS off";
  }
  return p;
}

type AiState = { unsure: Set<PasteField>; other: string[]; missing: PasteField[] } | null;

type Ctx = {
  o: Options;
  d: Draft;
  up: (patch: Partial<Draft>) => void;
  setBrand: (k: keyof BrandDraft, v: string) => void;
  pickBrand: (b: Brand) => void;
  ai: AiState;
  check: (f: PasteField) => boolean;
  touch: (f: PasteField) => void;
  chosen: { platform: string; type: string; quantity: number }[];
  summary: ReturnType<typeof dealSummary> & { feeP: number; advP: number; tdsPct: number; gstLabel: string };
  /** Problems shown on a step after Next was tapped there. */
  shown: (step: Step) => Problems;
  /** True when the step is complete; otherwise shows its problems. */
  validate: (step: Step) => boolean;
  submit: (intent: "agreement" | "save") => Promise<void>;
  busy: "agreement" | "save" | null;
  err: string;
};

const DraftCtx = createContext<{ w: Ctx | null; error: string | null; reload: () => void }>({ w: null, error: null, reload: () => {} });

/** The wizard once its options have loaded (steps 2 and 3 are only reachable by then). */
export function useDraft(): Ctx {
  const { w } = useContext(DraftCtx);
  if (!w) throw new Error("useDraft before the New deal options loaded");
  return w;
}
/** Step 1 shows a skeleton or the load error until the wizard is ready. */
export const useDraftLoading = () => useContext(DraftCtx);

/**
 * Holds the draft for the whole wizard. Rendered by the wizard's layout, so it lives as long as
 * the wizard does. Also picks up a pasted chat: on open, and again when Paste a chat closes
 * back onto the wizard.
 */
export function DraftProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: o, error, reload } = useLoad(() => api.deals.options());
  const [pending, setPending] = useState<PastedDeal | null>(null);
  useFocusEffect(useCallback(() => { const p = takePasted(); if (p) setPending(p); }, []));
  const [d, setD] = useState<Draft | null>(null);
  const [ai, setAi] = useState<AiState>(null);
  const [tried, setTried] = useState<Record<Step, boolean>>({ 1: false, 2: false, 3: false });
  const [busy, setBusy] = useState<"agreement" | "save" | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!o) return;
    if (pending) {
      setD(fromPasted(o, pending));
      setAi({ unsure: new Set(pending.unsure), other: pending.otherDeliverables, missing: pending.missing });
      setTried({ 1: false, 2: false, 3: false });
      setPending(null);
    } else setD((x) => x ?? initial(o));
  }, [o, pending]);

  const chosen = useMemo(
    () => (d ? ALL_DELIVERABLES.filter((x) => d.picked[deliverableKey(x)]).map((x) => ({ platform: x.platform, type: x.type, quantity: d.qty[deliverableKey(x)] ?? x.defaultQty })) : []),
    [d?.picked, d?.qty], // eslint-disable-line react-hooks/exhaustive-deps
  );

  let w: Ctx | null = null;
  if (o && d) {
    const up = (patch: Partial<Draft>) => setD((x) => x && { ...x, ...patch });
    const setBrand = (k: keyof BrandDraft, v: string) => setD((x) => {
      if (!x) return x;
      const brand = { ...x.brand, [k]: v };
      // A valid GSTIN tells us the state: fill it in while it's still empty.
      if (k === "gstin" && !brand.state && GSTIN_RE.test(v)) brand.state = stateByCode(v.slice(0, 2))?.name ?? "";
      return { ...x, brand };
    });
    const pickBrand = (b: Brand) => setD((x) => x && { ...x, brand: brandFrom(b), paidBy: b.agency_name ? "agency" : "brand" });
    const check = (f: PasteField) => !!ai?.unsure.has(f);
    const touch = (f: PasteField) => setAi((a) => (a?.unsure.has(f) ? { ...a, unsure: new Set([...a.unsure].filter((x) => x !== f)) } : a));

    const { tax, creator } = o;
    const feeP = parseRupees(d.fee) || 0;
    const advP = d.advOn ? parseRupees(d.adv) || 0 : 0;
    const tdsPct = d.tdsOn ? Math.min(100, Math.max(0, parseFloat(d.tdsRate) || 0)) : 0;
    const payer = stateByName(d.brand.state);
    const s = dealSummary({
      feePaise: feeP, gstMode: d.gstMode, tdsRate: tdsPct, advancePaise: d.advOn && d.advRecv ? advP : 0,
      creatorStateCode: creator.stateCode, brandStateCode: payer?.code, creatorRegistered: creator.registered, tax,
    });
    const gstLabel = s.gst.kind === "igst" ? `IGST ${s.gst.rate}% (${payer?.name})`
      : s.gst.kind === "cgst_sgst" ? `CGST ${s.gst.rate / 2}% + SGST ${s.gst.rate / 2}%` : "GST";

    const validate = (step: Step) => {
      setTried((t) => ({ ...t, [step]: true }));
      return Object.keys(problemsFor(step, d)).length === 0;
    };
    const shown = (step: Step) => (tried[step] ? problemsFor(step, d) : {});

    const submit = async (intent: "agreement" | "save") => {
      if (!validate(3)) return;
      // Steps 1 and 2 were checked on Next; this only catches a later edit that undid them.
      for (const step of [1, 2] as const) {
        if (Object.keys(problemsFor(step, d)).length) {
          setTried((t) => ({ ...t, [step]: true }));
          router.dismissTo(step === 1 ? "/deals/new" : "/deals/new/deliverables");
          return;
        }
      }
      setBusy(intent); setErr("");
      try {
        const b = d.brand;
        const { id } = await api.deals.create({
          brand: b.name, paidBy: d.paidBy, agency: d.paidBy === "agency" ? b.agency_name : null, brandLegal: b.legal_name || null,
          contactName: b.contact_name || null, contactEmail: b.contact_email || null, contactWhatsapp: b.contact_whatsapp || null,
          brandState: b.state, brandGstin: b.gstin || null,
          feePaise: feeP, gstMode: d.gstMode, tds: d.tdsOn ? { rate: tdsPct } : null,
          advance: d.advOn ? { paise: advP, received: d.advRecv } : null,
          goLive: d.goLive || null, termsDays: d.terms === "custom" ? d.customDays : Number(d.terms), deliverables: chosen,
          usage: d.usage ? { duration: d.perpetual ? "perpetual" : `${Math.min(USAGE_MAX_MONTHS, d.months)}m`, scope: d.scope } : null,
        });
        // Replaces the whole wizard, so Back from the deal goes to where the creator started.
        router.replace(intent === "agreement" ? `/deals/${id}/agreement` : `/deals/${id}`);
        void offerPushAfterDeal();
      } catch (e) {
        setErr(errorText(e)); setBusy(null);
      }
    };

    w = {
      o, d, up, setBrand, pickBrand, ai, check, touch, chosen,
      summary: { ...s, feeP, advP, tdsPct, gstLabel }, shown, validate, submit, busy, err,
    };
  }
  return <DraftCtx.Provider value={{ w, error, reload }}>{children}</DraftCtx.Provider>;
}

export const STEP_TITLES: Record<Step, string> = { 1: "Brand", 2: "Deliverables", 3: "Fee & payment" };

/** "Step 2 of 3" with three bars, the current step's title and a line under it. */
export function StepHead({ step, title, sub }: { step: Step; title: string; sub?: string }) {
  const { c } = useTheme();
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={`Step ${step} of 3, ${STEP_TITLES[step]}. ${title}`} style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {([1, 2, 3] as const).map((n) => (
          <View key={n} style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: n <= step ? c.text : c.surface3 }} />
            <Txt v="tab" w={n === step ? "bold" : "semibold"} color={n === step ? c.text : c.muted}>{STEP_TITLES[n]}</Txt>
          </View>
        ))}
      </View>
      <View style={{ gap: 2, paddingTop: 4 }}>
        <Txt v="small" w="semibold" color={c.muted}>Step {step} of 3</Txt>
        <Txt v="h1Sub">{title}</Txt>
        {sub ? <Txt color={c.muted}>{sub}</Txt> : null}
      </View>
    </View>
  );
}

export const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export const MISSING_LABEL: Record<PasteField, string> = {
  brand_name: "brand", paid_by: "who pays you", billing_state: "state for GST", contact_name: "contact", contact_email: "contact email",
  contact_whatsapp: "WhatsApp number", deliverables: "deliverables", fee: "fee", advance: "advance", usage_rights: "usage rights",
  go_live_date: "go-live date", payment_terms: "payment terms",
};

/** Which step each pasted field lives on, so each step lists only its own gaps. */
export const FIELD_STEP: Record<PasteField, Step> = {
  brand_name: 1, paid_by: 1, billing_state: 1, contact_name: 1, contact_email: 1, contact_whatsapp: 1,
  deliverables: 2, usage_rights: 2, go_live_date: 2,
  fee: 3, advance: 3, payment_terms: 3,
};
