"use client";

import { useActionState, useState, useTransition } from "react";
import { addAisEntry, sendFilingData, setFiler, uploadAis } from "@/app/actions/tax";
import { ActionForm, Seg, SubmitButton, useToast } from "@/components/client";
import type { Filing } from "@/lib/types";

export function WhoFiles({ value }: { value: "creator_assist" | "own_ca" }) {
  const [v, setV] = useState(value);
  const [, start] = useTransition();
  return (
    <Seg label="Who files for you" value={v} onChange={(x) => { setV(x); start(() => setFiler(x)); }}
      options={[{ value: "creator_assist", label: "Creator Assist" }, { value: "own_ca", label: "My own CA" }]} />
  );
}

export function FilingAction({ type, period, due, label }: { type: Filing["type"]; period: string; due: string; label: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button type="button" className="btn sec sm" disabled={pending}
      onClick={() => start(async () => toast(await sendFilingData(type, period, due)))}>
      {pending ? "Sending…" : label}
    </button>
  );
}

export function AisPanel({ updated, fy }: { updated: string | null; fy: string }) {
  const [open, setOpen] = useState<"" | "upload" | "manual">("");
  const [up, upAction, upActionPending] = useActionState(uploadAis, undefined);
  const [man, manAction, manActionPending] = useActionState(addAisEntry, undefined);
  return (<>
    <p className="term-x"><b>AIS</b> · The tax department&apos;s record of TDS brands deducted for you.</p>
    <p className="sub">
      {updated ? `AIS last updated ${updated}` : "No AIS uploaded yet"} ·{" "}
      <button type="button" className="linkbtn" onClick={() => setOpen(open === "upload" ? "" : "upload")}>Update AIS</button>
      {" · "}
      <button type="button" className="linkbtn" onClick={() => setOpen(open === "manual" ? "" : "manual")}>Add by hand</button>
    </p>
    {open === "upload" && (
      <ActionForm action={upAction} pending={upActionPending} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p className="sub">Download the AIS JSON from the income-tax portal (AIS → Download → JSON) and upload it here. We match TDS lines to your brands.</p>
        <input type="hidden" name="fy" value={fy} />
        <label className="f">AIS JSON file<input type="file" name="file" accept="application/json,.json" required /></label>
        {up?.error && <p className="err" role="alert">{up.error}</p>}
        {up?.message && <p className="info" role="status">{up.message}</p>}
        <SubmitButton className="btn sec" pendingText="Reading…">Upload AIS</SubmitButton>
      </ActionForm>
    )}
    {open === "manual" && (
      <ActionForm action={manAction} pending={manActionPending} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label className="f">Deductor name (as in AIS)<input name="deductor" required /></label>
        <label className="f">TAN (optional)<input name="tan" maxLength={10} style={{ textTransform: "uppercase" }} /></label>
        <label className="f">TDS amount (₹)<input name="amount" inputMode="numeric" required /></label>
        {man?.error && <p className="err" role="alert">{man.error}</p>}
        {man?.message && <p className="info" role="status">{man.message}</p>}
        <SubmitButton className="btn sec">Add entry</SubmitButton>
      </ActionForm>
    )}
  </>);
}
