"use client";

import { useActionState, useState, useTransition } from "react";
import { sendSignOtp, signAgreement } from "@/app/actions/agreements";
import { ActionForm, SubmitButton, useToast } from "@/components/client";

export function SignForm({ token, brand, email: initialEmail }: { token: string; brand: string; email: string }) {
  const [state, action, actionPending] = useActionState(signAgreement.bind(null, token), undefined);
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [otpMsg, setOtpMsg] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  const sendOtp = () => start(async () => {
    const r = await sendSignOtp(token, email);
    setOtpMsg(r.message);
    toast(r.message);
    if (r.ok) setSent(true);
  });

  return (
    <ActionForm action={action} pending={actionPending} style={{ display: "contents" }}>
      <label className="f">Your name<input name="name" required autoComplete="name" /></label>
      <label className="f">Designation<input name="designation" autoComplete="organization-title" placeholder="Marketing Manager" /></label>
      <label className="f">Your work email<input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setSent(false); }} autoComplete="email" required /></label>
      <button className="btn sec" type="button" onClick={sendOtp} disabled={pending || !email}>{pending ? "Sending…" : sent ? "Resend OTP" : "Send OTP to email"}</button>
      {otpMsg && <p className="sub" role="status">{otpMsg}</p>}
      <label className="f">Email OTP<input name="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required placeholder="6-digit code" /></label>
      <label className="tog"><span>I accept on behalf of {brand}</span><input type="checkbox" name="accept" required /></label>
      <label className="tog"><span>Send invoice and payment updates to my WhatsApp</span><input type="checkbox" name="whatsapp" /></label>
      {state?.error && <p className="err" role="alert">{state.error}</p>}
      <SubmitButton pendingText="Signing…" disabled={!sent}>Accept and sign</SubmitButton>
    </ActionForm>
  );
}
