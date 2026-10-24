"use client";

import { useState, useTransition } from "react";
import { logWhatsAppReminder, sendReminderEmail } from "@/app/actions/reminders";
import { Seg, useToast } from "@/components/client";
import { LANGS, paymentMessage, waLink } from "@/lib/messages";
import type { Lang } from "@/lib/types";

export function Composer(p: {
  dealId: string; stage: string; defaultLang: Lang; contact: string; phone: string | null; email: string | null; ccEmail: string | null;
  invoiceNo: string; balance: number; dueDate: string; daysToDue: number; msmeAvailable: boolean; creator: string;
}) {
  const [lang, setLang] = useState<Lang>(p.defaultLang);
  const [msme, setMsme] = useState(p.msmeAvailable && p.daysToDue < 0);
  const [cc, setCc] = useState(!!p.ccEmail);
  const [pending, start] = useTransition();
  const toast = useToast();
  const text = paymentMessage({
    lang, contact: p.contact.split(" ")[0], invoiceNo: p.invoiceNo, balance: p.balance, dueDate: p.dueDate,
    daysToDue: p.daysToDue, stage: p.stage, msme, creator: p.creator,
  });
  const target = { dealId: p.dealId, kind: "payment" as const, stage: p.stage, lang, message: text };

  return (<>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="sub" style={{ fontWeight: 600 }}>Message language</span>
      <Seg label="Message language" value={lang} onChange={setLang} options={LANGS} />
    </div>
    <div className="bubble" aria-live="polite">{text}</div>
    {p.msmeAvailable && <label className="tog"><span>Mention MSME interest</span><input type="checkbox" checked={msme} onChange={(e) => setMsme(e.target.checked)} /></label>}
    <label className="tog">
      <span>CC agency / finance team{p.ccEmail ? ` · ${p.ccEmail}` : " (add a CC email on the brand)"}</span>
      <input type="checkbox" checked={cc} disabled={!p.ccEmail} onChange={(e) => setCc(e.target.checked)} />
    </label>
    {p.phone ? (
      <a className="btn" href={waLink(p.phone, text)} target="_blank" rel="noopener" onClick={() => { logWhatsAppReminder(target); }}>
        Send now on WhatsApp
      </a>
    ) : <p className="sub">Add a WhatsApp number for this brand to send on WhatsApp.</p>}
    <button type="button" className="btn sec" disabled={pending || !p.email} onClick={() => start(async () => toast(await sendReminderEmail({ ...target, cc })))}>
      {pending ? "Sending…" : p.email ? "Send by email" : "No email on file"}
    </button>
  </>);
}
