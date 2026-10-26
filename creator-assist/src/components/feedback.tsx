"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/actions/feedback";
import { useToast } from "./client";

const HIDDEN = [/^\/s\//, /^\/admin/]; // the brand's signing page is not for testers; admin has its own
const NO_NAV = [/^\/signin/, /^\/onboarding/];

export function FeedbackButton() {
  const path = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();
  if (HIDDEN.some((r) => r.test(path))) return null;

  const send = () =>
    start(async () => {
      const res = await submitFeedback(path, msg);
      if (res.ok) {
        setOpen(false);
        setMsg("");
        toast("Thanks! Feedback sent.");
      } else toast(res.error);
    });

  return (
    <>
      <button type="button" className={`fab${NO_NAV.some((r) => r.test(path)) ? " low" : ""}`} onClick={() => setOpen(true)}>Feedback</button>
      {open && (
        <div className="sheet-bg" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="fb-title">
            <h2 id="fb-title">Send feedback</h2>
            <p className="sub">What worked, what confused you, what’s missing? We read every note. Screen: {path}</p>
            <label className="f">Your feedback
              <textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={4000} autoFocus />
            </label>
            <button type="button" className="btn" disabled={pending || !msg.trim()} onClick={send}>{pending ? "Sending…" : "Send feedback"}</button>
            <button type="button" className="btn sec" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
