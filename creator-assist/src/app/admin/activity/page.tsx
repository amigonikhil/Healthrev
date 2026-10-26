import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { EVENT_LABEL, FEATURES, filtersOf, loadEvents, loadPeople } from "@/lib/admin/data";
import { inRange, one, parseRange, qs, type SP } from "@/lib/admin/range";
import { fmtDate, fmtTimeIST, istDate } from "@/lib/dates";
import { RangePicker } from "../controls";

// Key events (screen views and sign-in steps only when asked for).
const KEY = ["signed_up", "onboarding_completed", "deal_created", "agreement_sent", "agreement_signed", "invoice_generated", "invoice_sent", "reminder_sent", "payment_recorded", "escalation_opened", "legal_call_booked", "ai_call_booked", "ais_uploaded", "filing_option_chosen", "filing_data_sent", "feedback_sent", "sample_loaded"];

export default async function Activity({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const r = parseRange(sp);
  const f = filtersOf(sp);
  const want = one(sp.event), user = one(sp.user), screen = one(sp.screen);
  const feature = FEATURES.find((x) => x.key === want);
  const [events, people] = await Promise.all([loadEvents(db, r.fromIso, f), loadPeople(db, { ...f, admins: true })]);
  const name = new Map(people.map((p) => [p.id, p.name ?? "Not onboarded"]));
  const rows = events
    .filter((e) => inRange(e.created_at, r))
    .filter((e) => (feature ? feature.match(e) : want ? e.event_name === want : KEY.includes(e.event_name)))
    .filter((e) => (!user || e.user_id === user) && (!screen || (e.screen ?? "").replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "[id]") === screen))
    .reverse();
  const shown = rows.slice(0, 300);
  return (
    <main className="ad-page">
      <header className="ad-head"><h1>Activity <small>{rows.length} events</small></h1><RangePicker /></header>
      <form className="ad-search" action="/admin/activity">
        {["range", "from", "to", "sample", "admins", "user"].map((k) => one(sp[k]) && <input key={k} type="hidden" name={k} value={one(sp[k])} />)}
        <label className="f">Event
          <select name="event" defaultValue={want}>
            <option value="">All key events</option>
            {[...KEY, "page_view", "signin_opened", "otp_requested", "otp_verified", "whatsapp_clicked"].map((k) => <option key={k} value={k}>{EVENT_LABEL[k] ?? k}</option>)}
            {FEATURES.filter((x) => !KEY.includes(x.key)).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
          </select>
        </label>
        <button className="btn sm">Filter</button>
        {(user || screen) && <Link className="linkbtn" href={`/admin/activity${qs(sp, { event: want || null })}`}>Clear creator/screen filter</Link>}
      </form>
      {user && <p className="sub">Creator: <b>{name.get(user) ?? user}</b></p>}
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>When</th><th>Creator</th><th>Event</th><th>Details</th></tr></thead>
          <tbody>
            {shown.map((e, i) => (
              <tr key={i}>
                <td>{fmtDate(istDate(e.created_at))}, {fmtTimeIST(e.created_at)}</td>
                <td>{e.user_id ? <Link href={`/admin/activity${qs(sp, { user: e.user_id, event: want || null })}`}>{name.get(e.user_id) ?? "Deleted account"}</Link> : <span className="sub">Visitor</span>}</td>
                <td>{EVENT_LABEL[e.event_name] ?? e.event_name}{e.is_sample && <small className="sub"> · sample</small>}</td>
                <td className="sub">{[e.screen, e.properties?.channel, e.properties?.type, e.properties?.method, e.properties?.kind].filter(Boolean).join(" · ")}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={4} className="sub">No events.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length > shown.length && <p className="sub">Showing the latest 300. Narrow the range or filter to see older events.</p>}
    </main>
  );
}
