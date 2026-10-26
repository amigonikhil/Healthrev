import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { filtersOf, loadPeople } from "@/lib/admin/data";
import { redact } from "@/lib/admin/privacy";
import { inRange, one, parseRange, qs, type SP } from "@/lib/admin/range";
import { fmtDate, fmtTimeIST, istDate } from "@/lib/dates";
import { Bars } from "../charts";
import { FeedbackControls, RangePicker } from "../controls";

const STATUSES = [["new", "New"], ["seen", "Seen"], ["planned", "Planned"], ["done", "Done"], ["wont_do", "Won't do"]];
const TAGS = ["bug", "confusing", "feature request", "design", "praise"];

export default async function FeedbackInbox({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const r = parseRange(sp);
  const f = filtersOf(sp);
  const [{ data }, people] = await Promise.all([
    db.from("feedback").select("id, user_id, screen, message, status, tags, created_at").order("created_at", { ascending: false }).limit(2000),
    loadPeople(db, { ...f, admins: true }),
  ]);
  const name = new Map(people.map((p) => [p.id, p.name ?? "Not onboarded"]));
  const hidden = f.admins ? new Set<string>() : new Set((await db.from("admins").select("user_id")).data?.map((a) => a.user_id) ?? []);
  const inR = (data ?? []).filter((x) => inRange(x.created_at, r) && !(x.user_id && hidden.has(x.user_id)));
  const screen = one(sp.screen), status = one(sp.status), tag = one(sp.tag);
  const rows = inR.filter((x) => (!screen || x.screen === screen) && (!status || x.status === status) && (!tag || (x.tags ?? []).includes(tag)));
  const byScreen = new Map<string, number>(); for (const x of inR) byScreen.set(x.screen, (byScreen.get(x.screen) ?? 0) + 1);
  const screens = [...byScreen.entries()].sort((a, b) => b[1] - a[1]);
  const link = (k: string, v: string | null) => `/admin/feedback${qs(sp, { screen: k === "screen" ? v : screen || null, status: k === "status" ? v : status || null, tag: k === "tag" ? v : tag || null })}`;

  return (
    <main className="ad-page">
      <header className="ad-head">
        <h1>Feedback <small>{rows.length} of {inR.length}</small></h1>
        <RangePicker />
      </header>
      <div className="ad-cols">
        <section className="ad-card">
          <h2>Feedback by screen <small>which screens confuse people most</small></h2>
          {screens.length ? <Bars items={screens.slice(0, 12).map(([s, n]) => ({ label: s, value: n, href: link("screen", s) }))} /> : <p className="sub">No feedback in this range.</p>}
        </section>
        <section className="ad-card">
          <h2>Filter</h2>
          <nav className="chips" aria-label="Status"><Link href={link("status", null)} className={!status ? "on" : ""}>Any status</Link>{STATUSES.map(([v, l]) => <Link key={v} href={link("status", v)} className={status === v ? "on" : ""}>{l} · {inR.filter((x) => x.status === v).length}</Link>)}</nav>
          <nav className="chips" aria-label="Tag"><Link href={link("tag", null)} className={!tag ? "on" : ""}>Any tag</Link>{TAGS.map((t) => <Link key={t} href={link("tag", t)} className={tag === t ? "on" : ""}>{t}</Link>)}</nav>
          {screen && <p className="sub">Screen: <b>{screen}</b> · <Link href={link("screen", null)}>clear</Link></p>}
          <a className="btn sec sm" href={`/admin/feedback/export${qs(sp, { screen: screen || null, status: status || null, tag: tag || null })}`}>Export CSV</a>
        </section>
      </div>
      <ul className="ad-inbox">
        {rows.map((x) => (
          <li key={x.id} className={x.status === "new" ? "unread" : ""}>
            <div className="ad-inbox-head">
              <b>{x.user_id ? <Link href={`/admin/creators/${x.user_id}${qs(sp)}`}>{name.get(x.user_id) ?? "Deleted account"}</Link> : "Not signed in"}</b>
              <Link className="ad-pill" href={link("screen", x.screen)}>{x.screen}</Link>
              <span className="sub">{fmtDate(istDate(x.created_at))}, {fmtTimeIST(x.created_at)}</span>
            </div>
            <p className="ad-msg">{redact(x.message)}</p>
            <FeedbackControls id={x.id} status={x.status} tags={x.tags ?? []} />
          </li>
        ))}
        {!rows.length && <li className="sub">No feedback matches.</li>}
      </ul>
    </main>
  );
}
