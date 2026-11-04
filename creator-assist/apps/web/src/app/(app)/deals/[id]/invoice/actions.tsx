"use client";

import { useActionState, useTransition } from "react";
import { emailInvoice, generateInvoice } from "@/app/actions/invoices";
import { ActionForm, SubmitButton, useToast } from "@/components/client";

export function GenerateForm({ dealId, defaultDate, hasEmail }: { dealId: string; defaultDate: string; hasEmail: boolean }) {
  const [state, action, actionPending] = useActionState(generateInvoice.bind(null, dealId), undefined);
  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "contents" }}>
      <label className="f">Invoice date<input type="date" name="invoice_date" defaultValue={defaultDate} required /></label>
      {hasEmail && <label className="tog"><span>Email the invoice to the brand</span><input type="checkbox" name="email" defaultChecked /></label>}
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Generating…">Generate invoice</SubmitButton>
    </ActionForm>
  );
}

export function InvoiceActions({ invoiceId, pdfHref }: { invoiceId: string; pdfHref: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (<>
    <a className="btn" href={pdfHref} download>Download PDF</a>
    <button type="button" className="btn sec" disabled={pending} onClick={() => start(async () => toast(await emailInvoice(invoiceId)))}>
      {pending ? "Sending…" : "Send again"}
    </button>
  </>);
}
