"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/client";
import { addAdmin, creatorContact, revealPhone, saveTaxDefaults, saveTemplates, setFeedback, setQueueStatus, updateAdmin } from "./actions";
import type { QueueKind, QueueStatus } from "@/lib/admin/data";
import type { ReminderTemplates } from "@/lib/messages";
import type { TaxDefaults } from "@/lib/app-settings";

/** Today / 7 days / 30 days / All time / Custom, plus the sample-data and admin toggles. */
export function RangePicker({ showToggles = true }: { showToggles?: boolean }) {
  const sp = useSearchParams();
  const path = usePathname();
  const router = useRouter();
  const cur = sp.get("range") ?? "30d";
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) if (v === null) p.delete(k); else p.set(k, v);
    router.push(`${path}?${p}`);
  };
  return (
    <div className="ad-range">
      <div className="seg" role="radiogroup" aria-label="Date range">
        {[["today", "Today"], ["7d", "7 days"], ["30d", "30 days"], ["all", "All time"], ["custom", "Custom"]].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={cur === k} className={cur === k ? "on" : ""}
            onClick={() => (k === "custom" ? go({ range: "custom", from: from || null, to: to || null }) : go({ range: k, from: null, to: null }))}>{l}</button>
        ))}
      </div>
      {cur === "custom" && (
        <form className="ad-custom" onSubmit={(e) => { e.preventDefault(); go({ range: "custom", from, to }); }}>
          <label className="f">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></label>
          <label className="f">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} required /></label>
          <button className="btn sm">Apply</button>
        </form>
      )}
      {showToggles && (
        <div className="ad-toggles">
          <label className="tog"><span>Include sample data</span><input type="checkbox" checked={sp.get("sample") === "1"} onChange={(e) => go({ sample: e.target.checked ? "1" : null })} /></label>
          <label className="tog"><span>Include admins</span><input type="checkbox" checked={sp.get("admins") === "1"} onChange={(e) => go({ admins: e.target.checked ? "1" : null })} /></label>
        </div>
      )}
    </div>
  );
}

function useRun() {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; message: string }>, after?: (m: string) => void) =>
    start(async () => { const r = await fn(); if (r.ok && after) after(r.message); else toast(r.message); if (r.ok) router.refresh(); });
  return { pending, run, toast };
}

export function QueueControls({ kind, id, status, note }: { kind: QueueKind; id: string; status: QueueStatus; note: string | null }) {
  const { pending, run } = useRun();
  const [s, setS] = useState<QueueStatus>(status);
  const [n, setN] = useState(note ?? "");
  return (
    <form className="ad-qctl" onSubmit={(e) => { e.preventDefault(); run(() => setQueueStatus(kind, id, s, n)); }}>
      <label className="f">Status
        <select value={s} onChange={(e) => setS(e.target.value as QueueStatus)}>
          <option value="new">New</option><option value="in_review">In review</option><option value="done">Done</option><option value="rejected">Rejected</option>
        </select>
      </label>
      <label className="f">Internal note<textarea rows={2} value={n} onChange={(e) => setN(e.target.value)} maxLength={2000} placeholder="Only admins see this" /></label>
      <button className="btn sm" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
    </form>
  );
}

const TAGS = ["bug", "confusing", "feature request", "design", "praise"];
export function FeedbackControls({ id, status, tags }: { id: string; status: string; tags: string[] }) {
  const { pending, run } = useRun();
  return (
    <div className="ad-fbctl">
      <select aria-label="Status" value={status} disabled={pending} onChange={(e) => run(() => setFeedback(id, { status: e.target.value }))}>
        {[["new", "New"], ["seen", "Seen"], ["planned", "Planned"], ["done", "Done"], ["wont_do", "Won't do"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <div className="ad-tags" role="group" aria-label="Tags">
        {TAGS.map((t) => (
          <button key={t} type="button" aria-pressed={tags.includes(t)} disabled={pending} className={`ad-tag${tags.includes(t) ? " on" : ""}`}
            onClick={() => run(() => setFeedback(id, { tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] }))}>{t}</button>
        ))}
      </div>
    </div>
  );
}

export function PhoneReveal({ userId, masked, canReveal }: { userId: string; masked: string; canReveal: boolean }) {
  const { pending, run } = useRun();
  const [shown, setShown] = useState<string | null>(null);
  return (
    <span className="ad-phone">{shown ?? masked}
      {canReveal && !shown && <button type="button" className="linkbtn" disabled={pending} onClick={() => run(() => revealPhone(userId), setShown)}>Reveal</button>}
    </span>
  );
}

export function ContactButtons({ userId, canWhatsApp }: { userId: string; canWhatsApp: boolean }) {
  const { pending, run, toast } = useRun();
  return (
    <div className="ad-row-btns">
      {canWhatsApp && <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => creatorContact(userId, "whatsapp"), (href) => window.open(href, "_blank", "noopener"))}>Message on WhatsApp</button>}
      <button type="button" className="btn sec sm" disabled={pending} onClick={() => run(() => creatorContact(userId, "email"), (email) => navigator.clipboard.writeText(email).then(() => toast("Email copied")))}>Copy email</button>
    </div>
  );
}

export function AddAdmin() {
  const { pending, run, toast } = useRun();
  const [id, setId] = useState("");
  const [role, setRole] = useState("support");
  return (
    <form className="ad-inline" onSubmit={(e) => { e.preventDefault(); run(() => addAdmin(id, role), (m) => { toast(m); setId(""); }); }}>
      <label className="f">Phone number or email<input value={id} onChange={(e) => setId(e.target.value)} required placeholder="+91 98765 43210" /></label>
      <label className="f">Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="support">Support</option><option value="owner">Owner</option></select></label>
      <button className="btn sm" disabled={pending}>Add admin</button>
    </form>
  );
}

export function AdminRow({ userId, role, self }: { userId: string; role: string; self: boolean }) {
  const { pending, run, toast } = useRun();
  if (self) return <span className="sub">You</span>;
  return (
    <span className="ad-row-btns">
      <select aria-label="Role" value={role} disabled={pending} onChange={(e) => run(() => updateAdmin(userId, e.target.value), toast)}>
        <option value="support">Support</option><option value="owner">Owner</option>
      </select>
      <button type="button" className="btn warn sm" disabled={pending} onClick={() => confirm("Remove this admin?") && run(() => updateAdmin(userId, null), toast)}>Remove</button>
    </span>
  );
}

export function TaxDefaultsForm({ value, canEdit }: { value: TaxDefaults; canEdit: boolean }) {
  const { pending, run, toast } = useRun();
  const [v, setV] = useState(value);
  const field = (k: keyof TaxDefaults, label: string) => (
    <label className="f">{label}<input inputMode="decimal" value={String(v[k])} disabled={!canEdit} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} /></label>
  );
  return (
    <form className="ad-grid4" onSubmit={(e) => { e.preventDefault(); run(() => saveTaxDefaults(v), toast); }}>
      {field("gst_rate", "GST %")}{field("tds_rate", "TDS %")}{field("rbi_bank_rate", "RBI bank rate %")}{field("msme_multiple", "MSME multiple (×)")}
      {canEdit && <button className="btn sm" disabled={pending}>Save defaults</button>}
    </form>
  );
}

export function TemplatesForm({ value, canEdit }: { value: ReminderTemplates; canEdit: boolean }) {
  const { pending, run, toast } = useRun();
  const [t, setT] = useState(value);
  const LANG = { en: "English", te: "Telugu-English", hi: "Hinglish" } as const;
  return (
    <form className="ad-stack" onSubmit={(e) => { e.preventDefault(); run(() => saveTemplates(t), toast); }}>
      {(Object.keys(LANG) as (keyof typeof LANG)[]).map((l) => (
        <fieldset key={l} className="ad-fieldset">
          <legend>{LANG[l]}</legend>
          {(["upcoming", "overdue"] as const).map((k) => (
            <label key={k} className="f">{k === "upcoming" ? "Before / on the due date" : "After the due date"}
              <textarea rows={3} value={t[l][k]} disabled={!canEdit} onChange={(e) => setT({ ...t, [l]: { ...t[l], [k]: e.target.value } })} />
            </label>
          ))}
        </fieldset>
      ))}
      <p className="sub">Placeholders: {"{contact} {amount} {invoice} {due} {days} {days_label} {when}"}. The final-reminder and MSME lines are added automatically.</p>
      {canEdit && <button className="btn sm" disabled={pending}>Save templates</button>}
    </form>
  );
}
