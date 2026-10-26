import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { FEATURES, filtersOf, isActiveEvent, loadEvents, loadPeople, loadQueues, QUEUE_TABS, waitingLabel } from "@/lib/admin/data";
import { inRange, istDay, parseRange, qs, type SP } from "@/lib/admin/range";
import { addDays } from "@/lib/dates";
import { Bars, LineChart } from "./charts";
import { RangePicker } from "./controls";

function Kpi({ label, value, prev, href, extra }: { label: string; value: number; prev: number | null; href: string; extra?: string }) {
  const delta = prev === null ? null : value - prev;
  return (
    <Link href={href} className="ad-kpi">
      <span className="k">{label}</span>
      <span className="v">{value}</span>
      <span className="d">
        {delta === null ? "All time" : delta === 0 ? "No change vs previous period" : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} vs previous period`}
        {extra && <b> · {extra}</b>}
      </span>
    </Link>
  );
}

export default async function Overview({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const f = filtersOf(sp);
  const { data: firstUser } = await db.from("events").select("created_at").eq("event_name", "signed_up").order("created_at").limit(1).maybeSingle();
  const r = parseRange(sp, firstUser ? istDay(firstUser.created_at) : undefined);
  const since = r.prevFromIso ?? null;
  const [events, people, queues, feedback] = await Promise.all([
    loadEvents(db, since ? new Date(Math.min(Date.parse(since), Date.parse(addDays(r.to, -13) + "T00:00:00+05:30"))).toISOString() : null, f),
    loadPeople(db, f),
    loadQueues(db, f),
    db.from("feedback").select("id, screen, message, status, created_at").order("created_at", { ascending: false }).limit(500),
  ]);
  const cur = events.filter((e) => inRange(e.created_at, r));
  const prevR = r.prevFromIso ? { ...r, fromIso: r.prevFromIso, toIso: r.prevToIso! } : null;
  const prev = prevR ? events.filter((e) => inRange(e.created_at, prevR)) : null;
  const count = (list: typeof events | null, name: string) => (list ? list.filter((e) => e.event_name === name).length : null);
  const users = (list: typeof events) => new Set(list.filter((e) => e.user_id).map((e) => e.user_id));

  const signups = people.filter((p) => inRange(p.created_at, r)).length;
  const signupsPrev = prevR ? people.filter((p) => inRange(p.created_at, prevR)).length : null;
  const onboarded = people.filter((p) => inRange(p.onboarded_at, r)).length;
  const onboardedPrev = prevR ? people.filter((p) => inRange(p.onboarded_at, prevR)).length : null;
  // Active creators: any key action in the 7 days ending at the range end (and the 7 days before that).
  const end = r.to;
  const w7 = { ...r, fromIso: new Date(addDays(end, -6) + "T00:00:00+05:30").toISOString() };
  const w7prev = { ...r, fromIso: new Date(addDays(end, -13) + "T00:00:00+05:30").toISOString(), toIso: new Date(addDays(end, -7) + "T23:59:59.999+05:30").toISOString() };
  const active = users(events.filter((e) => isActiveEvent(e) && inRange(e.created_at, w7))).size;
  const activePrev = users(events.filter((e) => isActiveEvent(e) && inRange(e.created_at, w7prev))).size;
  const fbAll = (feedback.data ?? []).filter((x) => inRange(x.created_at, r));
  const unread = (feedback.data ?? []).filter((x) => x.status === "new").length;
  const openQ = queues.filter((q) => q.status === "new" || q.status === "in_review");

  // Daily series
  const signupSeries = r.days.map((d) => people.filter((p) => istDay(p.created_at) === d).length);
  const activeSeries = r.days.map((d) => new Set(cur.filter((e) => isActiveEvent(e) && istDay(e.created_at) === d).map((e) => e.user_id)).size);
  const features = FEATURES.map((ft) => ({ label: ft.label, value: users(cur.filter(ft.match)).size, href: `/admin/activity${qs(sp, { event: ft.key })}` }));
  const longest = [...openQ].sort((a, b) => a.created_at.localeCompare(b.created_at)).slice(0, 5);
  const q = (extra: Record<string, string | null> = {}) => qs(sp, extra);

  return (
    <main className="ad-page">
      <header className="ad-head"><h1>Overview</h1><RangePicker /></header>
      <section className="ad-kpis">
        <Kpi label="Total sign-ups" value={signups} prev={signupsPrev} href={`/admin/creators${q({ sort: "signup" })}`} />
        <Kpi label="Completed onboarding" value={onboarded} prev={onboardedPrev} href={`/admin/creators${q({ onboarded: "yes" })}`} />
        <Kpi label="Active creators, 7 days" value={active} prev={activePrev} href={`/admin/creators${q({ active: "yes" })}`} />
        <Kpi label="Deals created (real)" value={count(cur, "deal_created")!} prev={count(prev, "deal_created")} href={`/admin/activity${q({ event: "deal_created" })}`} />
        <Kpi label="Invoices generated" value={count(cur, "invoice_generated")!} prev={count(prev, "invoice_generated")} href={`/admin/activity${q({ event: "invoice_generated" })}`} />
        <Kpi label="Reminders sent" value={count(cur, "reminder_sent")! + count(cur, "whatsapp_clicked")!} prev={prev ? count(prev, "reminder_sent")! + count(prev, "whatsapp_clicked")! : null} href={`/admin/activity${q({ event: "reminder_sent" })}`} />
        <Kpi label="Feedback received" value={fbAll.length} prev={null} extra={`${unread} unread`} href={`/admin/feedback${q({ status: "new" })}`} />
        <Kpi label="Open queue items" value={openQ.length} prev={null} href={`/admin/queues${q()}`} />
      </section>
      <div className="ad-cols">
        <section className="ad-card"><h2>Sign-ups and active creators per day</h2>
          <LineChart days={r.days} series={[{ label: "Sign-ups", color: "var(--chart-1)", values: signupSeries }, { label: "Active creators", color: "var(--chart-2)", values: activeSeries }]} />
        </section>
        <section className="ad-card"><h2>Feature usage <small>creators who used each</small></h2><Bars items={features} /></section>
      </div>
      <div className="ad-cols">
        <section className="ad-card"><h2>Latest feedback</h2>
          <ul className="ad-list">
            {(feedback.data ?? []).slice(0, 5).map((x) => <li key={x.id}><Link href={`/admin/feedback${q({ screen: x.screen })}`}><span className="ad-pill">{x.screen}</span> {x.message.slice(0, 140)}</Link></li>)}
            {!feedback.data?.length && <li className="sub">No feedback yet.</li>}
          </ul>
        </section>
        <section className="ad-card"><h2>Waiting the longest</h2>
          <ul className="ad-list">
            {longest.map((x) => <li key={x.kind + x.id}><Link href={`/admin/queues${q({ tab: x.kind })}`}><span className="ad-pill">{QUEUE_TABS.find((t) => t.kind === x.kind)?.label}</span> waiting {waitingLabel(x.created_at)} · {x.status.replace("_", " ")}</Link></li>)}
            {!longest.length && <li className="sub">Nothing waiting. 🎉</li>}
          </ul>
        </section>
      </div>
    </main>
  );
}
