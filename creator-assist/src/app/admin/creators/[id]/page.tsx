import Link from "next/link";
import { notFound } from "next/navigation";
import { adminLog, requireAdmin } from "@/lib/admin/auth";
import { EVENT_LABEL, FEATURES, loadEvents, loadQueues, QUEUE_TABS, waitingLabel } from "@/lib/admin/data";
import { amountBand, maskPhone } from "@/lib/admin/privacy";
import { qs, type SP } from "@/lib/admin/range";
import { fmtDate, fmtTimeIST, istDate } from "@/lib/dates";
import { ContactButtons, PhoneReveal } from "../../controls";

const MILESTONES = ["signed_up", "onboarding_completed", "sample_loaded", "deal_created", "agreement_sent", "agreement_signed", "invoice_generated", "reminder_sent", "payment_recorded", "escalation_opened", "ais_uploaded", "feedback_sent"];

export default async function CreatorDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const a = await requireAdmin();
  const { db } = a;
  const [{ data: p }, events, queues, fb, deals] = await Promise.all([
    db.from("profiles").select("id, name, handle, city, state, phone, consent_at, sample_seeded_at").eq("id", id).maybeSingle(),
    loadEvents(db, null, { sample: true, admins: true }),
    loadQueues(db, { sample: true, admins: true }),
    db.from("feedback").select("id, screen, message, status, tags, created_at").eq("user_id", id).order("created_at", { ascending: false }),
    db.from("deals").select("id, fee_paise, is_sample").eq("user_id", id),
  ]);
  const { data: authUser } = await (db as unknown as { auth: { admin: { getUserById: (i: string) => Promise<{ data: { user: { created_at: string } | null } }> } } }).auth.admin.getUserById(id);
  if (!p && !authUser?.user) notFound();
  await adminLog(a, "view_creator", "creator", id);

  const mine = events.filter((e) => e.user_id === id);
  const real = mine.filter((e) => !e.is_sample);
  const first = new Map<string, string>();
  for (const e of mine) if (MILESTONES.includes(e.event_name) && !first.has(e.event_name) && (e.event_name === "sample_loaded" || !e.is_sample)) first.set(e.event_name, e.created_at);
  const timeline = [...first.entries()].sort((x, y) => x[1].localeCompare(y[1]));
  const realDeals = (deals.data ?? []).filter((d) => !d.is_sample);
  const total = realDeals.reduce((s, d) => s + d.fee_paise, 0);
  const myQueues = queues.filter((q) => q.user_id === id);

  return (
    <main className="ad-page">
      <header className="ad-head"><h1><Link href={`/admin/creators${qs(sp)}`} className="ad-back" aria-label="Back to creators">←</Link> {p?.name ?? "Not onboarded yet"}</h1></header>
      <div className="ad-cols">
        <section className="ad-card">
          <h2>Profile</h2>
          <dl className="ad-dl">
            <dt>Handle</dt><dd>{p?.handle ?? "—"}</dd>
            <dt>City</dt><dd>{[p?.city, p?.state].filter(Boolean).join(", ") || "—"}</dd>
            <dt>Phone</dt><dd><PhoneReveal userId={id} masked={maskPhone(p?.phone)} canReveal={a.role === "owner" && !!p?.phone} /></dd>
            <dt>Signed up</dt><dd>{authUser?.user ? fmtDate(istDate(authUser.user.created_at)) : "—"}</dd>
            <dt>Onboarded</dt><dd>{p?.consent_at ? fmtDate(istDate(p.consent_at)) : "No"}</dd>
            <dt>Sample data</dt><dd>{p?.sample_seeded_at ? "Loaded" : "No"}</dd>
            <dt>Real deals</dt><dd>{realDeals.length} · total fees {amountBand(total)}</dd>
          </dl>
          <ContactButtons userId={id} canWhatsApp={a.role === "owner" && !!p?.phone} />
          <p className="sub">PAN, bank and brand details are never shown in admin. Phone reveals and contact actions are logged.</p>
        </section>
        <section className="ad-card">
          <h2>Features tried</h2>
          <ul className="ad-check">
            {FEATURES.map((ft) => { const used = real.some(ft.match); return <li key={ft.key} className={used ? "on" : ""}><span aria-hidden>{used ? "✓" : "○"}</span>{ft.label}</li>; })}
          </ul>
        </section>
      </div>
      <div className="ad-cols">
        <section className="ad-card">
          <h2>Timeline</h2>
          <ol className="tl">
            {timeline.map(([name, at]) => <li key={name}><span className="dot" style={{ background: "var(--chart-2)" }} /><span><b>{EVENT_LABEL[name] ?? name}</b> · {fmtDate(istDate(at))}, {fmtTimeIST(at)}</span></li>)}
            {!timeline.length && <li className="sub">No activity yet.</li>}
          </ol>
          <p className="sub">{real.length} events in total · last {real.at(-1) ? `${fmtDate(istDate(real.at(-1)!.created_at))} (${EVENT_LABEL[real.at(-1)!.event_name] ?? real.at(-1)!.event_name})` : "—"}</p>
          <Link className="linkbtn" href={`/admin/activity${qs(sp, { user: id })}`}>All activity ›</Link>
        </section>
        <section className="ad-card">
          <h2>Queue items</h2>
          <ul className="ad-list">
            {myQueues.map((q) => <li key={q.kind + q.id}><Link href={`/admin/queues${qs(sp, { tab: q.kind })}`}><span className="ad-pill">{QUEUE_TABS.find((t) => t.kind === q.kind)?.label}</span> {q.status.replace("_", " ")} · waiting {waitingLabel(q.created_at)}{q.sample ? " · sample" : ""}</Link></li>)}
            {!myQueues.length && <li className="sub">None.</li>}
          </ul>
          <h2>Feedback</h2>
          <ul className="ad-list">
            {(fb.data ?? []).map((x) => <li key={x.id}><span className="ad-pill">{x.screen}</span> {x.message} <small className="sub">· {x.status}</small></li>)}
            {!fb.data?.length && <li className="sub">None.</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
