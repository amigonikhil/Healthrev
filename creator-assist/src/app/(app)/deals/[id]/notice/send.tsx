"use client";

import { useState, useTransition } from "react";
import { emailLegalNotice, logNoticeWhatsApp } from "@/app/actions/escalations";
import { useToast } from "@/components/client";

export function NoticeSend(p: { dealId: string; waHref: string | null; email: string | null; sample: boolean }) {
  const [ok, setOk] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (<>
    <label className="tog"><span>I confirm the facts in this notice are correct</span><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /></label>
    {p.waHref ? (
      <a className="btn" href={ok ? p.waHref : undefined} aria-disabled={!ok} target="_blank" rel="noopener"
        style={ok ? undefined : { opacity: 0.55, pointerEvents: "none" }} onClick={() => { logNoticeWhatsApp(p.dealId); }}>
        Send via WhatsApp
      </a>
    ) : <p className="sub">Add a WhatsApp number for this brand to send on WhatsApp.</p>}
    <button type="button" className="btn sec" disabled={!ok || pending || !p.email} onClick={() => start(async () => toast(await emailLegalNotice(p.dealId)))}>
      {pending ? "Sending…" : p.email ? `Send via email${p.sample ? " (to you, sample)" : ""}` : "No email on file"}
    </button>
  </>);
}
