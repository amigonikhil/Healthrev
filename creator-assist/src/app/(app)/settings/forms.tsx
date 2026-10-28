"use client";

import { useActionState, useState } from "react";
import { deleteAccount, saveRates, saveReminderSettings } from "@/app/actions/settings";
import { ActionForm, SubmitButton } from "@/components/client";
import type { TaxConfig } from "@/lib/calc";
import { BrandPreview } from "@/components/brand-preview";
import { Help } from "@/components/help";
import type { ReminderTemplates } from "@/lib/messages";
import type { Lang } from "@/lib/types";
import { REMIND_EVERY_HOURS, REMINDER_COUNT } from "@/lib/reminder-schedule";

export function ReminderForm(p: {
  every: number; whatsapp: boolean; email: boolean; language: string; terms: number;
  preview: { creator: string; templates: ReminderTemplates; invoiceNo: string; dueDate: string };
}) {
  const [state, action, actionPending] = useActionState(saveReminderSettings, undefined);
  const [lang, setLang] = useState(p.language as Lang);
  // Switching automatic email on opens the preview, so the creator sees the words before anything goes out.
  const [showPreview, setShowPreview] = useState(false);
  return (
    <ActionForm action={action} pending={actionPending} className="card">
      <h2>Reminders</h2>
      <label className="f">Remind brands every
        <select name="every" defaultValue={String(p.every)}>
          {REMIND_EVERY_HOURS.map((h) => <option key={h} value={h}>{h} hours</option>)}
        </select>
      </label>
      <p className="sub">{REMINDER_COUNT} reminders from the due date (9:00 AM), then we prompt you to send the legal notice.</p>
      <label className="tog"><span>WhatsApp from my number</span><input type="checkbox" name="whatsapp" defaultChecked={p.whatsapp} /></label>
      <label className="tog"><span>Email automatically</span><input type="checkbox" name="email" defaultChecked={p.email} onChange={(e) => e.target.checked && setShowPreview(true)} /></label>
      <label className="f">Default message language
        <select name="language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}><option value="en">English</option><option value="te">Telugu-English</option><option value="hi">Hinglish</option></select>
      </label>
      <BrandPreview creator={p.preview.creator} lang={lang} templates={p.preview.templates} invoiceNo={p.preview.invoiceNo} contact="Priya" amount={2500000} dueDate={p.preview.dueDate} example open={showPreview} />
      <label className="f">Default payment terms
        <select name="terms" defaultValue={String(p.terms)}><option value="30">30 days</option><option value="45">45 days</option><option value="60">60 days</option></select>
      </label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="info" role="status">{state.ok}</p>}
      <SubmitButton className="btn sec">Save reminders</SubmitButton>
    </ActionForm>
  );
}

type RateDefaults = Pick<TaxConfig, "gst_rate" | "tds_rate" | "rbi_bank_rate" | "msme_multiple" | "late_interest_rate" | "late_interest_period" | "notice_legal_fee_paise">;
const rateFields = (t: RateDefaults) => ({
  rbi_bank_rate: t.rbi_bank_rate.toFixed(2), msme_multiple: String(t.msme_multiple), tds_rate: String(t.tds_rate),
  late_interest_rate: String(t.late_interest_rate), late_interest_period: t.late_interest_period,
  notice_legal_fee: String(t.notice_legal_fee_paise / 100), gst_rate: String(t.gst_rate),
});

export function RatesForm({ tax, defaults }: { tax: TaxConfig; defaults: RateDefaults | null }) {
  const [state, action, actionPending] = useActionState(saveRates, undefined);
  const [resetNote, setResetNote] = useState(false);
  const v = rateFields(tax);
  const reset = (form: HTMLFormElement | null) => {
    if (!form || !defaults) return;
    for (const [name, val] of Object.entries(rateFields(defaults))) {
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el) el.value = val;
    }
    setResetNote(true);
  };
  return (
    <ActionForm action={action} pending={actionPending} className="card">
      <h2>Rates</h2>
      <label className="f">RBI bank rate for MSME interest (%)<input name="rbi_bank_rate" defaultValue={v.rbi_bank_rate} inputMode="decimal" /></label>
      <label className="f"><span>MSME interest multiple (× RBI bank rate)<Help term="msme" /></span><input name="msme_multiple" defaultValue={v.msme_multiple} inputMode="decimal" /></label>
      <label className="f"><span>Default TDS on fees (%)<Help term="tds" /></span><input name="tds_rate" defaultValue={v.tds_rate} inputMode="decimal" /></label>
      <label className="f">Late payment interest in agreements (%)<input name="late_interest_rate" defaultValue={v.late_interest_rate} inputMode="decimal" /></label>
      <label className="f">Charged
        <select name="late_interest_period" defaultValue={v.late_interest_period}>
          <option value="week">Per week</option>
          <option value="year">Per year</option>
        </select>
      </label>
      <label className="f">Legal fee claimed in lawyer notices (₹)<input name="notice_legal_fee" defaultValue={v.notice_legal_fee} inputMode="decimal" /></label>
      <label className="f"><span>GST rate (%)<Help term="gst" /></span><input name="gst_rate" defaultValue={v.gst_rate} inputMode="decimal" /></label>
      <p className="sub">Confirm these with your CA. Very high late-payment rates can be challenged as a penalty; check with a lawyer.</p>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="info" role="status">{state.ok}</p>}
      {resetNote && !state?.ok && <p className="info" role="status">Defaults filled in. Tap Save rates to keep them.</p>}
      <SubmitButton className="btn sec">Save rates</SubmitButton>
      {defaults && (
        <button type="button" className="linkbtn" style={{ alignSelf: "center" }}
          title={`GST ${defaults.gst_rate}%, TDS ${defaults.tds_rate}%, RBI bank rate ${defaults.rbi_bank_rate}%, ${defaults.msme_multiple}× multiple`}
          onClick={(e) => reset(e.currentTarget.form)}>Reset to default</button>
      )}
    </ActionForm>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, action, actionPending] = useActionState(deleteAccount, undefined);
  if (!open) return <button type="button" className="btn warn" onClick={() => setOpen(true)}>Delete my account</button>;
  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p className="note">This permanently deletes your profile, deals, invoices, reminders and uploaded files. Export your data first if you need it.</p>
      <label className="f">Type DELETE to confirm<input name="confirm" autoComplete="off" required /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton className="btn warn" pendingText="Deleting…">Delete permanently</SubmitButton>
      <button type="button" className="btn sec" onClick={() => setOpen(false)}>Cancel</button>
    </ActionForm>
  );
}
