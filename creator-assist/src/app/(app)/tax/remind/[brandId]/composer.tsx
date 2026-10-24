"use client";

import { useState, useTransition } from "react";
import { logWhatsAppReminder, scheduleTdsLadder, sendReminderEmail } from "@/app/actions/reminders";
import { Seg, useToast } from "@/components/client";
import { LANGS, tdsMessage, waLink } from "@/lib/messages";
import type { Lang } from "@/lib/types";

export function TdsComposer(p: {
  brandId: string; contact: string; phone: string | null; email: string | null; amount: number; invoiceNos: string[];
  pan: string; creator: string; defaultLang: Lang; alreadyEmailed: number;
}) {
  const [lang, setLang] = useState<Lang>(p.defaultLang);
  const [alsoEmail, setAlsoEmail] = useState(!!p.email);
  const [pending, start] = useTransition();
  const toast = useToast();
  const text = tdsMessage({ lang, contact: p.contact.split(" ")[0], amount: p.amount, invoiceNos: p.invoiceNos, pan: p.pan, creator: p.creator });
  const stage = p.alreadyEmailed === 0 ? "friendly" : p.alreadyEmailed === 1 ? "follow_up" : "firm";
  const target = { brandId: p.brandId, kind: "tds" as const, stage, lang, message: text };

  const email = async () => {
    const msg = await sendReminderEmail({ ...target, cc: false });
    await scheduleTdsLadder(p.brandId, lang);
    return msg;
  };

  return (<>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="sub" style={{ fontWeight: 600 }}>Message language</span>
      <Seg label="Message language" value={lang} onChange={setLang} options={LANGS} />
    </div>
    <div className="bubble" aria-live="polite">{text}</div>
    <label className="tog"><span>Also send by email{p.email ? "" : " (no email on file)"}</span><input type="checkbox" checked={alsoEmail} disabled={!p.email} onChange={(e) => setAlsoEmail(e.target.checked)} /></label>
    {p.phone ? (
      <a className="btn" href={waLink(p.phone, text)} target="_blank" rel="noopener"
        onClick={() => start(async () => {
          await logWhatsAppReminder(target);
          if (alsoEmail) toast(await email());
          else { await scheduleTdsLadder(p.brandId, lang); toast("Follow-ups scheduled"); }
        })}>
        Send now on WhatsApp
      </a>
    ) : <p className="sub">Add a WhatsApp number for this brand to send on WhatsApp.</p>}
    <button type="button" className="btn sec" disabled={pending || !p.email} onClick={() => start(async () => toast(await email() + " · reminders scheduled"))}>
      {pending ? "Sending…" : "Send by email only"}
    </button>
  </>);
}
