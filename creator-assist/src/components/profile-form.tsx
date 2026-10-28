"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { FormState } from "@/app/actions/profile";
import { STATES } from "@/lib/states";
import { ActionForm, SubmitButton } from "./client";
import { Lock } from "./lock";

type Defaults = {
  name?: string; handle?: string; email?: string; phone?: string; city?: string; address?: string; state?: string;
  gstin?: string; udyam?: string; ifsc?: string; upi?: string; panMasked?: string; bankLast4?: string; invoicePrefix?: string;
};

export function ProfileForm({ action, defaults, mode, needPhone }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  defaults: Defaults; mode: "onboard" | "edit"; needPhone?: boolean;
}) {
  const [state, formAction, formActionPending] = useActionState(action, undefined);
  const [step, setStep] = useState(mode === "onboard" ? 1 : 2);
  const editing = mode === "edit";

  return (
    <ActionForm action={formAction} pending={formActionPending} style={{ display: "contents" }}>
      {/* Step 1 stays mounted (hidden) so its values submit with step 2. */}
      <div style={{ display: step === 1 || editing ? "contents" : "none" }}>
        {!editing && (<>
          <p className="sub">Step 1 of 2</p>
          <h1>About you</h1>
          <p className="sub">How brands know you. You can change this later in Settings.</p>
        </>)}
        {editing && <h2>Profile</h2>}
        <label className="f">Instagram / YouTube handle<input name="handle" defaultValue={defaults.handle} placeholder="@yourhandle" autoComplete="nickname" /></label>
        <label className="f">Email for brand communication<input name="email" type="email" defaultValue={defaults.email} placeholder="collabs@you.in" autoComplete="email" /></label>
        {needPhone && <label className="f">Mobile number<input name="phone" inputMode="tel" defaultValue={defaults.phone} placeholder="+91 98765 43210" autoComplete="tel" /></label>}
        <label className="f">City<input name="city" defaultValue={defaults.city} placeholder="Hyderabad" autoComplete="address-level2" /></label>
        <label className="f">Address for invoices<input name="address" defaultValue={defaults.address} placeholder="Area, city, PIN" autoComplete="street-address" /></label>
        {!editing && <button type="button" className="btn" onClick={() => { setStep(2); window.scrollTo(0, 0); }}>Continue</button>}
      </div>

      <div style={{ display: step === 2 ? "contents" : "none" }}>
        {!editing && (<>
          <p className="sub">Step 2 of 2</p>
          <h1>Business and bank details</h1>
          <p className="sub">These go on your invoices and agreements.</p>
        </>)}
        {editing && <h2 style={{ marginTop: 8 }}>Tax and bank</h2>}
        <label className="f">Full name (as on PAN)<input name="name" defaultValue={defaults.name} required autoComplete="name" /></label>
        <label className="f"><span className="lab">PAN <Lock inLabel /></span><input aria-label="PAN" name="pan" placeholder={editing ? `${defaults.panMasked ?? ""} · leave blank to keep` : "ABCDE1234F"} required={!editing} maxLength={10} style={{ textTransform: "uppercase" }} autoComplete="off" /></label>
        <label className="f">State
          <select name="state" defaultValue={defaults.state ?? "Telangana"}>
            {STATES.map((s) => <option key={s.code} value={s.name}>{s.name} ({s.code})</option>)}
          </select>
        </label>
        <label className="f">GSTIN (if registered)<input name="gstin" defaultValue={defaults.gstin} placeholder="36ABCDE1234F1Z5" maxLength={15} style={{ textTransform: "uppercase" }} /></label>
        <label className="f">Udyam (MSME) number<input name="udyam" defaultValue={defaults.udyam} placeholder="UDYAM-TS-02-0012345" style={{ textTransform: "uppercase" }} /></label>
        <label className="f"><span className="lab">Bank account <Lock inLabel /></span><input aria-label="Bank account" name="bank_account" inputMode="numeric" placeholder={editing ? `••${defaults.bankLast4 ?? ""} · leave blank to keep` : "Account number"} required={!editing} autoComplete="off" /></label>
        <label className="f">IFSC<input name="ifsc" defaultValue={defaults.ifsc} placeholder="HDFC0001234" maxLength={11} required style={{ textTransform: "uppercase" }} /></label>
        <p className="sub">
          Why we ask, and how it&apos;s protected:{" "}
          <Link className="linkbtn" style={{ minHeight: 0, display: "inline" }} href={editing ? "/about" : "/about?from=onboarding"} target={editing ? undefined : "_blank"}>About &amp; data safety</Link>
        </p>
        <label className="f">UPI ID<input name="upi" defaultValue={defaults.upi} placeholder="you@hdfcbank" /></label>
        {editing && <label className="f">Invoice prefix<input name="invoice_prefix" defaultValue={defaults.invoicePrefix} maxLength={8} required style={{ textTransform: "uppercase" }} /></label>}
        {!editing && (
          <label className="tog"><span>I consent to storing these details. PAN and bank are encrypted.</span><input type="checkbox" name="consent" required /></label>
        )}
        {state?.error && <p className="err" role="alert">{state.error}</p>}
        <SubmitButton>{editing ? "Save" : "Finish setup"}</SubmitButton>
        {!editing && <button type="button" className="btn sec" onClick={() => setStep(1)}>Back</button>}
      </div>
    </ActionForm>
  );
}
