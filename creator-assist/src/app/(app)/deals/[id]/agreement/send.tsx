"use client";

import { trackClient } from "@/components/track";
import { useState, useTransition } from "react";
import { sendAgreement } from "@/app/actions/agreements";
import { useToast } from "@/components/client";

export function SendPanel({ dealId, contact, email, whatsapp, existingLink }: {
  dealId: string; contact: string; email: string | null; whatsapp: string | null; existingLink: string | null;
}) {
  const [byEmail, setByEmail] = useState(!!email);
  const [byWa, setByWa] = useState(!!whatsapp);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ link: string; wa: string | null } | null>(null);
  const toast = useToast();
  const link = done?.link ?? existingLink;

  const send = () => start(async () => {
    const r = await sendAgreement(dealId, { email: byEmail, whatsapp: byWa });
    if (!r.ok) return toast(r.error);
    setDone({ link: r.link, wa: r.wa });
    toast(r.note ?? (r.emailed ? `Sent to ${email}` : "Signing link ready"));
  });

  return (<>
    <div className="card">
      <h2>{existingLink ? "Send again" : `Send to ${contact}`}</h2>
      <label className="tog"><span>Email · {email ?? "no email on file"}</span><input type="checkbox" checked={byEmail} disabled={!email} onChange={(e) => setByEmail(e.target.checked)} /></label>
      <label className="tog"><span>WhatsApp · {whatsapp ?? "no number on file"}</span><input type="checkbox" checked={byWa} disabled={!whatsapp} onChange={(e) => setByWa(e.target.checked)} /></label>
    </div>
    {done?.wa && <a className="btn" href={done.wa} target="_blank" rel="noopener" onClick={() => trackClient("whatsapp_clicked", { kind: "agreement" })}>Open WhatsApp to send</a>}
    <button type="button" className={done?.wa ? "btn sec" : "btn"} onClick={send} disabled={pending}>
      {pending ? "Sending…" : existingLink || done ? "Send again" : "Send for e-sign"}
    </button>
    {link && (<>
      <button type="button" className="btn sec" onClick={() => navigator.clipboard.writeText(link).then(() => toast("Signing link copied"))}>Copy signing link</button>
      <a className="linkbtn" style={{ alignSelf: "center" }} href={link} target="_blank" rel="noopener">Preview what the brand sees</a>
    </>)}
    {!link && <p className="sub" style={{ textAlign: "center" }}>The brand gets a link to review and sign with an email OTP. No login needed.</p>}
  </>);
}
