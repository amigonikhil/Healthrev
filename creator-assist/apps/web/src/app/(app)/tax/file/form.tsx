"use client";

import { useActionState, useState } from "react";
import { bookAiCall } from "@/app/actions/tax";
import { ActionForm, SubmitButton } from "@/components/client";

export function BookingForm({ slots, phone, lang }: { slots: { value: string; label: string }[]; phone: string; lang: string }) {
  const [state, action, actionPending] = useActionState(bookAiCall, undefined);
  const [slot, setSlot] = useState(slots[0]?.value ?? "");
  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "contents" }}>
      <div className="stats" role="radiogroup" aria-label="Call slot">
        {slots.map((s) => (
          <button key={s.value} type="button" role="radio" aria-checked={slot === s.value} className={`slot${slot === s.value ? " on" : ""}`} onClick={() => setSlot(s.value)}>{s.label}</button>
        ))}
      </div>
      <input type="hidden" name="slot" value={slot} />
      <label className="f">Call language<select name="language" defaultValue={lang}><option>Telugu</option><option>English</option><option>Hindi</option></select></label>
      <label className="f">Call me on<input name="phone" defaultValue={phone} inputMode="tel" required /></label>
      <label className="tog"><span>I consent to sharing my tax data with the filing CA</span><input type="checkbox" name="consent" required /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Booking…">Pay ₹1,999 and book call</SubmitButton>
      <p className="sub" style={{ textAlign: "center" }}>Beta: no payment is taken.</p>
    </ActionForm>
  );
}
