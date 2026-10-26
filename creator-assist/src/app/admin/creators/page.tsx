import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { filtersOf, isActiveEvent, loadEvents, loadPeople } from "@/lib/admin/data";
import { maskEmail } from "@/lib/admin/privacy";
import { inRange, one, parseRange, qs, type SP } from "@/lib/admin/range";
import { addDays, fmtDate, istDate, todayIST } from "@/lib/dates";
import { RangePicker } from "../controls";

export default async function Creators({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const r = parseRange(sp);
  const f = filtersOf(sp);
  const [people, events, deals, fb] = await Promise.all([
    loadPeople(db, f),
    loadEvents(db, null, { ...f, sample: true }),
    db.from("deals").select("user_id").eq("is_sample", false),
    db.from("feedback").select("user_id"),
  ]);
  const last = new Map<string, string>();
  const active7 = new Set<string>();
  const since7 = new Date(addDays(todayIST(), -6) + "T00:00:00+05:30").toISOString();
  for (const e of events) if (e.user_id) {
    if (!e.is_sample || f.sample) last.set(e.user_id, e.created_at);
    if (isActiveEvent(e) && !e.is_sample && e.created_at >= since7) active7.add(e.user_id);
  }
  const realDeals = new Map<string, number>(); for (const d of deals.data ?? []) realDeals.set(d.user_id, (realDeals.get(d.user_id) ?? 0) + 1);
  const fbCount = new Map<string, number>(); for (const x of fb.data ?? []) if (x.user_id) fbCount.set(x.user_id, (fbCount.get(x.user_id) ?? 0) + 1);

  const search = one(sp.q).trim().toLowerCase();
  const fOn = one(sp.onboarded), fAct = one(sp.active), fData = one(sp.data);
  const rows = people
    .filter((p) => r.key === "all" || inRange(p.created_at, r))
    .filter((p) => !search || `${p.name ?? ""} ${p.handle ?? ""} ${p.email ?? ""} ${p.phone ?? ""}`.toLowerCase().includes(search))
    .filter((p) => !fOn || (fOn === "yes") === !!p.onboarded_at)
    .filter((p) => !fAct || (fAct === "yes") === active7.has(p.id))
    .filter((p) => !fData || (fData === "sample" ? p.sample : (realDeals.get(p.id) ?? 0) > 0))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const link = (k: string, v: string | null) => `/admin/creators${qs(sp, { [k]: v, q: one(sp.q) || null })}`;
  const chip = (k: string, v: string | null, label: string) => <Link className={(one(sp[k]) || null) === v ? "on" : ""} href={link(k, v)}>{label}</Link>;

  return (
    <main className="ad-page">
      <header className="ad-head"><h1>Creators <small>{rows.length} signed up {r.label.toLowerCase()}</small></h1><RangePicker /></header>
      <form className="ad-search" action="/admin/creators">
        {["range", "from", "to", "sample", "admins", "onboarded", "active", "data"].map((k) => one(sp[k]) && <input key={k} type="hidden" name={k} value={one(sp[k])} />)}
        <input name="q" defaultValue={one(sp.q)} placeholder="Search name, handle, email or phone" aria-label="Search creators" />
        <button className="btn sm">Search</button>
      </form>
      <div className="ad-filters">
        <nav className="chips" aria-label="Onboarding">{chip("onboarded", null, "All")}{chip("onboarded", "yes", "Onboarded")}{chip("onboarded", "no", "Not onboarded")}</nav>
        <nav className="chips" aria-label="Activity">{chip("active", null, "Any activity")}{chip("active", "yes", "Active (7 days)")}{chip("active", "no", "Inactive")}</nav>
        <nav className="chips" aria-label="Data">{chip("data", null, "Any data")}{chip("data", "real", "Real deals")}{chip("data", "sample", "Using sample data")}</nav>
      </div>
      <div className="ad-table-wrap">
        <table className="ad-table">
          <thead><tr><th>Name</th><th>Email</th><th>Handle</th><th>Signed up</th><th>Onboarded</th><th>Last active</th><th className="n">Real deals</th><th>Sample data</th><th className="n">Feedback</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <td><Link href={`/admin/creators/${p.id}${qs(sp)}`}>{p.name ?? <em>Not onboarded yet</em>}</Link></td>
                <td>{maskEmail(p.email)}</td>
                <td>{p.handle ?? "—"}</td>
                <td>{fmtDate(istDate(p.created_at))}</td>
                <td>{p.onboarded_at ? "Yes" : "No"}</td>
                <td>{last.get(p.id) ? fmtDate(istDate(last.get(p.id)!)) : "—"}</td>
                <td className="n">{realDeals.get(p.id) ?? 0}</td>
                <td>{p.sample ? "Yes" : "No"}</td>
                <td className="n">{fbCount.get(p.id) ?? 0}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="sub">No creators match.</td></tr>}
          </tbody>
        </table>
      </div>
    </main>
  );
}
