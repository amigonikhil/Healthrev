import Link from "next/link";
import { Chip, Row, Top } from "@/components/ui";
import { NOTICE_DAYS } from "@/lib/advocate";
import { requireAdmin } from "@/lib/admin";
import { addDays, daysBetween, fmtDate, istDate, todayIST } from "@/lib/dates";
import type { Tone } from "@/lib/deal-view";
import { inr } from "@/lib/money";
import { fmtSlot } from "@/lib/slots";
import { StatusButtons } from "./status";

export const metadata = { title: "Admin · Creator Assist" };

const TABS = [
  { key: "notices", label: "Legal notices" },
  { key: "calls", label: "Legal calls" },
  { key: "escalations", label: "Other escalations" },
  { key: "tax", label: "Tax filings" },
  { key: "ai", label: "AI calls" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const FILING = { gstr1: "GSTR-1", gstr3b: "GSTR-3B", advance_tax: "Advance tax", itr: "ITR" } as const;
const ESC = { final_reminder: "Final reminder", lawyer_notice: "Legal notice", msme_samadhaan: "MSME Samadhaan" } as const;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const one = (x: any) => (Array.isArray(x) ? x[0] : x);

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { admin } = await requireAdmin();
  const want = (await searchParams).tab;
  const tab: TabKey = TABS.find((t) => t.key === want)?.key ?? "notices";
  const today = todayIST();

  const [esc, calls, filings, ai, fb] = await Promise.all([
    admin.from("escalations")
      .select("id, user_id, type, status, channel, draft, is_sample, created_at, deal:deals(id, brand:brands(name, contact_name, contact_email, contact_whatsapp), invoices(number, balance_due_paise, payments(amount_paise, tds_paise)))")
      .order("created_at", { ascending: false }).limit(300),
    admin.from("legal_call_bookings").select("*, deal:deals(id, brand:brands(name))").order("slot", { ascending: true }).limit(300),
    admin.from("filings").select("*").eq("handled_by", "creator_assist").order("due_date", { ascending: true }).limit(300),
    admin.from("ai_call_bookings").select("*").order("slot", { ascending: true }).limit(300),
    admin.from("feedback").select("id", { count: "exact", head: true }),
  ]);
  const userIds = [...new Set([...(esc.data ?? []), ...(calls.data ?? []), ...(filings.data ?? []), ...(ai.data ?? [])].map((r) => r.user_id))];
  const { data: people } = userIds.length ? await admin.from("profiles").select("id, name, phone, email").in("id", userIds) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));
  const person = (id: string) => { const p = who.get(id); return p ? `${p.name}${p.phone ? ` · ${p.phone}` : ""}` : "Deleted account"; };

  const notices = (esc.data ?? []).filter((e) => e.type === "lawyer_notice").map((e) => {
    const deal = one(e.deal); const inv = one(deal?.invoices);
    const paid = (inv?.payments ?? []).reduce((a: number, p: { amount_paise: number; tds_paise: number }) => a + p.amount_paise + p.tds_paise, 0);
    const unpaid = inv ? Math.max(0, inv.balance_due_paise - paid) : 0;
    const deadline = addDays(istDate(e.created_at), NOTICE_DAYS);
    const left = daysBetween(today, deadline);
    const state: { label: string; tone: Tone } =
      e.status === "closed" ? { label: "Closed", tone: "mute" }
      : unpaid <= 0 ? { label: "Paid", tone: "ok" }
      : e.status !== "sent" ? { label: "Draft (old flow)", tone: "mute" }
      : left >= 0 ? { label: `${left} day${left === 1 ? "" : "s"} left`, tone: "info" }
      : { label: `Period over ${-left}d · unpaid`, tone: "over" };
    return { e, deal, inv, unpaid, deadline, state };
  });
  const others = (esc.data ?? []).filter((e) => e.type !== "lawyer_notice");
  const open = {
    notices: notices.filter((n) => n.e.status === "sent" && n.unpaid > 0).length,
    overdue: notices.filter((n) => n.state.tone === "over").length,
    calls: (calls.data ?? []).filter((c) => c.status === "requested").length,
    filings: (filings.data ?? []).filter((f) => f.status !== "filed").length,
    ai: (ai.data ?? []).filter((a) => a.status === "booked").length,
  };

  return (
    <main className="scr">
      <Top title="Admin" sub="Every creator's escalations, calls and filings" fallback="/settings" />
      <div className="stats">
        <div className="stat"><span className="k">Notices open</span><span className="v">{open.notices}</span></div>
        <div className={`stat${open.overdue ? " hot" : ""}`}><span className="k">Notice period over, unpaid</span><span className="v">{open.overdue}</span></div>
        <div className="stat"><span className="k">Legal calls to confirm</span><span className="v">{open.calls}</span></div>
        <div className="stat"><span className="k">Filings to do</span><span className="v">{open.filings}</span></div>
        <div className="stat"><span className="k">AI calls booked</span><span className="v">{open.ai}</span></div>
        <Link className="stat" href="/admin/feedback" style={{ textDecoration: "none" }}><span className="k">Tester feedback ›</span><span className="v">{fb.count ?? 0}</span></Link>
      </div>
      <nav className="chips" aria-label="Sections">
        {TABS.map((t) => <Link key={t.key} href={`/admin?tab=${t.key}`} className={tab === t.key ? "on" : ""} aria-current={tab === t.key ? "page" : undefined}>{t.label}</Link>)}
      </nav>

      {tab === "notices" && (<>
        {!notices.length && <p className="sub">No legal notices yet.</p>}
        {notices.map(({ e, deal, inv, unpaid, deadline, state }) => (
          <div className="card" key={e.id}>
            <div className="row"><h2>{one(deal?.brand)?.name ?? "Deleted deal"}</h2><Chip tone={state.tone}>{state.label}</Chip></div>
            <p className="sub">{person(e.user_id)}{e.is_sample ? " · sample deal" : ""}</p>
            <Row k="Invoice" v={inv?.number ?? "—"} />
            <Row k="Unpaid now" v={inr(unpaid)} />
            <Row k="Sent" v={`${fmtDate(istDate(e.created_at))}${e.channel ? ` · ${e.channel === "email" ? "email" : "WhatsApp"}` : ""}`} />
            <Row k="Pay-by date" v={fmtDate(deadline)} />
            {one(deal?.brand)?.contact_email && <Row k="Brand contact" v={`${one(deal.brand).contact_name ?? ""} ${one(deal.brand).contact_email}`.trim()} />}
            {deal && <a className="btn sec sm" href={`/api/admin/notice/${deal.id}`} target="_blank" rel="noopener">View notice PDF</a>}
            {e.draft && <details><summary className="sub" style={{ minHeight: 44, display: "flex", alignItems: "center" }}>Notice text</summary><p className="sub" style={{ whiteSpace: "pre-wrap" }}>{e.draft}</p></details>}
            <StatusButtons table="escalations" id={e.id} current={e.status} options={[{ value: "sent", label: "Active" }, { value: "closed", label: "Closed" }]} />
          </div>
        ))}
      </>)}

      {tab === "calls" && (<>
        {!calls.data?.length && <p className="sub">No legal call bookings yet.</p>}
        {(calls.data ?? []).map((c) => (
          <div className="card" key={c.id}>
            <div className="row"><h2>{fmtSlot(c.slot)}</h2><Chip tone={c.status === "requested" ? "info" : c.status === "confirmed" ? "ok" : "mute"}>{c.status}</Chip></div>
            <p className="sub">{person(c.user_id)}{c.is_sample ? " · sample deal" : ""}</p>
            <Row k="Deal" v={one(c.deal)?.brand ? one(one(c.deal).brand).name : "—"} />
            <Row k="Call on" v={<a href={`tel:${c.phone}`}><b>{c.phone}</b></a>} />
            <Row k="Fee" v={inr(c.fee_paise)} />
            {c.note && <p className="sub" style={{ whiteSpace: "pre-wrap" }}>“{c.note}”</p>}
            {one(c.deal) && <a className="btn sec sm" href={`/api/admin/notice/${one(c.deal).id}`} target="_blank" rel="noopener">View notice PDF</a>}
            <StatusButtons table="legal_call_bookings" id={c.id} current={c.status} options={[{ value: "requested", label: "New" }, { value: "confirmed", label: "Confirmed" }, { value: "done", label: "Done" }, { value: "cancelled", label: "Cancel" }]} />
          </div>
        ))}
      </>)}

      {tab === "escalations" && (<>
        {!others.length && <p className="sub">No other escalations yet.</p>}
        {others.map((e) => (
          <div className="card" key={e.id}>
            <div className="row"><h2>{ESC[e.type as keyof typeof ESC]}</h2><Chip tone={e.status === "closed" ? "mute" : "info"}>{e.status.replace("_", " ")}</Chip></div>
            <p className="sub">{person(e.user_id)} · {one(e.deal)?.brand ? one(one(e.deal).brand).name : "—"} · {fmtDate(istDate(e.created_at))}{e.is_sample ? " · sample" : ""}</p>
            <StatusButtons table="escalations" id={e.id} current={e.status} options={[{ value: "draft", label: "Open" }, { value: "in_review", label: "In review" }, { value: "closed", label: "Closed" }]} />
          </div>
        ))}
      </>)}

      {tab === "tax" && (<>
        {!filings.data?.length && <p className="sub">No filings handled by Creator Assist yet.</p>}
        {(filings.data ?? []).map((f) => {
          const days = daysBetween(today, f.due_date);
          return (
            <div className="card" key={f.id}>
              <div className="row"><h2>{FILING[f.type as keyof typeof FILING]} · {f.period}</h2><Chip tone={f.status === "filed" ? "ok" : days < 0 ? "over" : days <= 7 ? "info" : "mute"}>{f.status === "filed" ? "Filed" : days < 0 ? `Late ${-days}d` : `Due in ${days}d`}</Chip></div>
              <p className="sub">{person(f.user_id)}{f.is_sample ? " · sample" : ""}</p>
              <Row k="Due" v={fmtDate(f.due_date)} />
              <Row k="Data from creator" v={f.data_sent_at ? `Sent ${fmtDate(istDate(f.data_sent_at))}` : "Not sent yet"} />
              <StatusButtons table="filings" id={f.id} current={f.status} options={[{ value: "pending", label: "Pending" }, { value: "ready", label: "Ready" }, { value: "filed", label: "Filed" }]} />
            </div>
          );
        })}
      </>)}

      {tab === "ai" && (<>
        {!ai.data?.length && <p className="sub">No AI call bookings yet.</p>}
        {(ai.data ?? []).map((a) => (
          <div className="card" key={a.id}>
            <div className="row"><h2>{fmtSlot(a.slot)}</h2><Chip tone={a.status === "booked" ? "info" : a.status === "done" ? "ok" : "mute"}>{a.status}</Chip></div>
            <p className="sub">{person(a.user_id)} · {a.language}</p>
            <Row k="Call on" v={<a href={`tel:${a.phone}`}><b>{a.phone}</b></a>} />
            <StatusButtons table="ai_call_bookings" id={a.id} current={a.status} options={[{ value: "booked", label: "Booked" }, { value: "done", label: "Done" }, { value: "cancelled", label: "Cancel" }]} />
          </div>
        ))}
      </>)}
    </main>
  );
}
