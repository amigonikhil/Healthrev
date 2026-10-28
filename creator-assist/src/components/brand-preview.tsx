"use client";

import { useEffect, useState } from "react";
import { inr } from "@/lib/money";
import { DEFAULT_TEMPLATES, paymentMessage, type ReminderTemplates } from "@/lib/messages";
import type { Lang } from "@/lib/types";

/** The first automatic reminder exactly as the brand gets it (email; WhatsApp uses the same words). */
export function BrandPreview(p: {
  creator: string; lang: Lang; templates?: ReminderTemplates; invoiceNo: string; amount: number; dueDate: string; contact?: string;
  example?: boolean; open?: boolean;
}) {
  const [open, setOpen] = useState(!!p.open);
  useEffect(() => { if (p.open) setOpen(true); }, [p.open]);
  const text = paymentMessage({
    lang: p.lang, contact: p.contact ?? "", invoiceNo: p.invoiceNo, balance: p.amount, dueDate: p.dueDate,
    daysToDue: 0, stage: "friendly", msme: false, creator: p.creator,
  }, p.templates ?? DEFAULT_TEMPLATES);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <button type="button" className="btn sec" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? "Hide preview" : "Preview what the brand sees"}
      </button>
      {open && (
        <div className="preview" role="region" aria-label="What the brand sees">
          <p className="sub"><b>From</b> {p.creator} via Creator Assist<br /><b>Subject</b> Payment reminder: invoice {p.invoiceNo} ({inr(p.amount)})</p>
          <div className="bubble">{text}</div>
          <p className="sub">First reminder, sent on the due date at 9:00 AM. WhatsApp reminders use the same words.{p.example ? " Example amounts shown." : ""}</p>
        </div>
      )}
    </div>
  );
}
