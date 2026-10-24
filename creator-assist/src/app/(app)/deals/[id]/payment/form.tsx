"use client";

import { useActionState, useState } from "react";
import { recordPayment } from "@/app/actions/payments";
import { ActionForm, SubmitButton } from "@/components/client";
import { inr, parseRupees } from "@/lib/money";

const r = (p: number) => String(Math.round(p / 100));

export function PaymentForm(p: { dealId: string; total: number; advance: number; paidBefore: number; balance: number; suggestAmount: number; suggestTds: number; today: string }) {
  const [state, action, actionPending] = useActionState(recordPayment.bind(null, p.dealId), undefined);
  const [amt, setAmt] = useState(r(p.suggestAmount));
  const [tds, setTds] = useState(r(p.suggestTds));
  const sum = (parseRupees(amt) || 0) + (parseRupees(tds) || 0);
  const left = p.balance - p.paidBefore - sum;

  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "contents" }}>
      <label className="f">Amount received in bank (₹)<input name="amount" value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="numeric" required /></label>
      <label className="f">TDS deducted by brand (₹)<input name="tds" value={tds} onChange={(e) => setTds(e.target.value)} inputMode="numeric" /></label>
      <label className="f">Date received<input name="date" type="date" defaultValue={p.today} max={p.today} required /></label>
      <label className="f">UTR / reference<input name="utr" placeholder="HDFCN26298745512" autoComplete="off" /></label>
      <div className="card" aria-live="polite">
        <div className="row"><span>Invoice total</span><b>{inr(p.total)}</b></div>
        {p.advance > 0 && <div className="row"><span>Advance received</span><b>{inr(p.advance)}</b></div>}
        {p.paidBefore > 0 && <div className="row"><span>Received earlier (incl. TDS)</span><b>{inr(p.paidBefore)}</b></div>}
        <div className="row"><span>This payment + TDS</span><b>{inr(sum)}</b></div>
        <div className="hr" />
        <div className="row"><span style={{ color: "var(--text)", fontWeight: 700 }}>Balance</span><b>{left <= 0 ? "₹0 · fully settled" : `${inr(left)} · partly paid`}</b></div>
      </div>
      <label className="tog"><span>Remind brand to send Form 16A</span><input type="checkbox" name="form16a" defaultChecked /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton>Save payment</SubmitButton>
    </ActionForm>
  );
}
