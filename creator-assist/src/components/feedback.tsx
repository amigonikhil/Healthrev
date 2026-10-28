"use client";

import { usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { submitFeedback } from "@/app/actions/feedback";
import { useToast } from "./client";

/** Small speech-bubble button in each screen's header; opens the feedback sheet. */
export function FeedbackButton() {
  const path = usePathname();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

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
      <button type="button" className="icon-btn fb" aria-label="Feedback" title="Send feedback" onClick={() => setOpen(true)}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
          <path d="M9 11h.01M12 11h.01M15 11h.01" strokeWidth="2.6" />
        </svg>
      </button>
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
