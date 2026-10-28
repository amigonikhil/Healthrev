"use client";

import { useState } from "react";

const TERMS = {
  gst: {
    title: "What is GST?",
    body: "GST (Goods and Services Tax) is added on top of your fee when you're GST-registered. The brand pays it to you with the invoice, and you pass it on to the government in your monthly or quarterly GST return, so it isn't your income. If you aren't registered, you don't charge it and your invoices show no GST.",
  },
  tds: {
    title: "What is TDS?",
    body: "TDS (Tax Deducted at Source) is a slice of your fee that the brand keeps back and pays to the tax department in your name. It isn't lost money: it counts as income tax you've already paid, and you get it back or adjust it when you file your return. That's why we check it shows up in your AIS.",
  },
  msme: {
    title: "What is MSME interest?",
    body: "If you're registered as a micro or small business (Udyam), the MSME Act says buyers must pay you within the agreed time, and no later than 45 days. If they pay late, you're entitled to interest at a multiple of the RBI bank rate, compounded monthly. It's your right, but it's usually best kept for brands who keep ignoring friendly reminders.",
  },
} as const;

/** Small "?" next to a tax term; opens a one-paragraph explanation. */
export function Help({ term }: { term: keyof typeof TERMS }) {
  const [open, setOpen] = useState(false);
  const t = TERMS[term];
  return (
    <>
      <button type="button" className="help" aria-label={t.title} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}>?</button>
      {open && (
        <span className="sheet-bg" onClick={(e) => { e.preventDefault(); if (e.target === e.currentTarget) setOpen(false); }}>
          <span className="sheet" role="dialog" aria-modal="true" aria-label={t.title}>
            <span className="help-h">{t.title}</span>
            <span className="help-p">{t.body}</span>
            <button type="button" className="btn sec" autoFocus onClick={() => setOpen(false)}>Got it</button>
          </span>
        </span>
      )}
    </>
  );
}
