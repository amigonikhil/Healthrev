"use client";

import { useActionState, useState } from "react";
import { deleteAccount, saveRates, saveReminderSettings } from "@/app/actions/settings";
import { ActionForm, SubmitButton } from "@/components/client";
import type { TaxConfig } from "@/lib/calc";

export function ReminderForm(p: { ladder: string; whatsapp: boolean; email: boolean; language: string; terms: number }) {
  const [state, action, actionPending] = useActionState(saveReminderSettings, undefined);
  return (
    <ActionForm action={action} pending={actionPending} className="card">
      <h2>Reminders</h2>
      <label className="f">Ladder (days after due)<input name="ladder" defaultValue={p.ladder} inputMode="numeric" /></label>
      <label className="tog"><span>WhatsApp from my number</span><input type="checkbox" name="whatsapp" defaultChecked={p.whatsapp} /></label>
      <label className="tog"><span>Email automatically</span><input type="checkbox" name="email" defaultChecked={p.email} /></label>
      <label className="f">Default message language
        <select name="language" defaultValue={p.language}><option value="en">English</option><option value="te">Telugu-English</option><option value="hi">Hinglish</option></select>
      </label>
      <label className="f">Default payment terms
        <select name="terms" defaultValue={String(p.terms)}><option value="30">30 days</option><option value="45">45 days</option><option value="60">60 days</option></select>
      </label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="info" role="status">{state.ok}</p>}
      <SubmitButton className="btn sec">Save reminders</SubmitButton>
    </ActionForm>
  );
}

export function RatesForm({ tax }: { tax: TaxConfig }) {
  const [state, action, actionPending] = useActionState(saveRates, undefined);
  return (
    <ActionForm action={action} pending={actionPending} className="card">
      <h2>Rates</h2>
      <label className="f">RBI bank rate for MSME interest (%)<input name="rbi_bank_rate" defaultValue={tax.rbi_bank_rate.toFixed(2)} inputMode="decimal" /></label>
      <label className="f">MSME interest multiple (× RBI bank rate)<input name="msme_multiple" defaultValue={String(tax.msme_multiple)} inputMode="decimal" /></label>
      <label className="f">Expected TDS on fees (%)<input name="tds_rate" defaultValue={String(tax.tds_rate)} inputMode="decimal" /></label>
      <label className="f">GST rate (%)<input name="gst_rate" defaultValue={String(tax.gst_rate)} inputMode="decimal" /></label>
      <p className="sub">Confirm these with your CA.</p>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      {state?.ok && <p className="info" role="status">{state.ok}</p>}
      <SubmitButton className="btn sec">Save rates</SubmitButton>
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
