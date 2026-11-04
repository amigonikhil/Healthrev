"use client";

import { useActionState, useState } from "react";
import { bookLegalCall } from "@/app/actions/escalations";
import { ActionForm, SubmitButton } from "@/components/client";

export function LegalCallForm({ dealId, slots, phone, fee }: { dealId: string; slots: { value: string; label: string }[]; phone: string; fee: string }) {
  const [state, action, actionPending] = useActionState(bookLegalCall.bind(null, dealId), undefined);
  const [slot, setSlot] = useState(slots[0]?.value ?? "");
  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "contents" }}>
      <div className="stats" role="radiogroup" aria-label="Call slot">
        {slots.map((s) => (
          <button key={s.value} type="button" role="radio" aria-checked={slot === s.value} className={`slot${slot === s.value ? " on" : ""}`} onClick={() => setSlot(s.value)}>{s.label}</button>
        ))}
      </div>
      <input type="hidden" name="slot" value={slot} />
      <label className="f">Call me on<input name="phone" defaultValue={phone} inputMode="tel" required /></label>
      <label className="f">Anything the lawyer should know? (optional)<textarea name="note" rows={3} placeholder="e.g. Brand replied asking for 30 more days" /></label>
      <label className="tog"><span>Share this deal, its agreement and the notice with the legal team</span><input type="checkbox" name="consent" required /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Booking…">Pay {fee} and book call</SubmitButton>
      <p className="sub" style={{ textAlign: "center" }}>Beta: no payment is taken.</p>
    </ActionForm>
  );
}
