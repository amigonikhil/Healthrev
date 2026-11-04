import { requireAdmin } from "@/lib/admin/auth";
import { filtersOf, loadEvents, type Ev } from "@/lib/admin/data";
import { inRange, parseRange, qs, type SP } from "@/lib/admin/range";
import { Bars, Funnel } from "../charts";
import { RangePicker } from "../controls";

const actor = (e: Ev) => e.user_id ?? (e.anon_id ? `anon:${e.anon_id}` : null);
function median(xs: number[]) { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
const dur = (h: number | null) => (h === null ? "—" : h < 1 ? `${Math.round(h * 60)} min` : h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} days`);

export default async function FunnelPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const r = parseRange(sp);
  const f = filtersOf(sp);
  const all = await loadEvents(db, null, { ...f, sample: true });
  const evs = all.filter((e) => inRange(e.created_at, r));
  const real = (e: Ev) => f.sample || !e.is_sample;
  const who = (pred: (e: Ev) => boolean) => new Set(evs.filter(pred).map(actor).filter(Boolean) as string[]);

  const steps: { label: string; ids: Set<string>; event: string }[] = [
    { label: "Opened the sign-in screen", ids: who((e) => e.event_name === "signin_opened"), event: "signin_opened" },
    { label: "Requested an OTP", ids: who((e) => e.event_name === "otp_requested"), event: "otp_requested" },
    { label: "Signed in", ids: who((e) => ["signed_up", "signed_in", "otp_verified"].includes(e.event_name) && !!e.user_id), event: "signed_in" },
    { label: "Completed onboarding", ids: who((e) => e.event_name === "onboarding_completed"), event: "onboarding_completed" },
    { label: "Loaded sample data or created a real deal", ids: who((e) => e.event_name === "sample_loaded" || (e.event_name === "deal_created" && !e.is_sample)), event: "deal_created" },
    { label: "Created a real deal", ids: who((e) => e.event_name === "deal_created" && real(e)), event: "deal_created" },
    { label: "Sent an agreement", ids: who((e) => e.event_name === "agreement_sent" && real(e)), event: "agreement_sent" },
    { label: "Generated an invoice", ids: who((e) => e.event_name === "invoice_generated" && real(e)), event: "invoice_generated" },
    { label: "Sent a reminder", ids: who((e) => (e.event_name === "reminder_sent" || e.event_name === "whatsapp_clicked") && real(e)), event: "reminder_sent" },
    { label: "Recorded a payment", ids: who((e) => e.event_name === "payment_recorded" && real(e)), event: "payment_recorded" },
  ];

  // Median time between steps (first occurrence per creator, all time).
  const firstAt = (names: string[], pred: (e: Ev) => boolean = () => true) => {
    const m = new Map<string, number>();
    for (const e of all) if (e.user_id && names.includes(e.event_name) && pred(e) && !m.has(e.user_id)) m.set(e.user_id, Date.parse(e.created_at));
    return m;
  };
  const signIn = firstAt(["signed_up", "signed_in", "otp_verified"]);
  const onboard = firstAt(["onboarding_completed"]);
  const deal = firstAt(["deal_created"], (e) => !e.is_sample);
  const gaps = (a: Map<string, number>, b: Map<string, number>) => [...steps[3].ids].filter((u) => a.has(u) && b.has(u)).map((u) => (b.get(u)! - a.get(u)!) / 3600e3).filter((h) => h >= 0);
  const g34 = gaps(signIn, onboard);
  const g46 = [...steps[5].ids].filter((u) => onboard.has(u) && deal.has(u)).map((u) => (deal.get(u)! - onboard.get(u)!) / 3600e3).filter((h) => h >= 0);

  // Screens where sessions end: the last screen viewed in each browser session.
  const lastBySession = new Map<string, string>();
  for (const e of evs) if (e.event_name === "page_view" && e.properties?.session && e.screen) lastBySession.set(e.properties.session, e.screen.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "[id]"));
  const ends = new Map<string, number>(); for (const s of lastBySession.values()) ends.set(s, (ends.get(s) ?? 0) + 1);
  const topEnds = [...ends.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  const otp = (method: string) => {
    const req = evs.filter((e) => e.event_name === "otp_requested" && e.properties?.method === method).length;
    const ok = evs.filter((e) => e.event_name === "otp_verified" && e.properties?.method === method).length;
    return { req, ok, rate: req ? Math.round((ok / req) * 100) : null };
  };
  const sms = otp("sms"), email = otp("email");
  const trackedSince = all.find((e) => e.event_name === "signin_opened")?.created_at;

  return (
    <main className="ad-page">
      <header className="ad-head"><h1>Funnel</h1><RangePicker /></header>
      <section className="ad-card">
        <h2>Where creators drop off <small>{r.label}</small></h2>
        <Funnel steps={steps.map((s) => ({ label: s.label, value: s.ids.size, href: `/admin/activity${qs(sp, { event: s.event })}` }))} />
        <p className="sub">Steps 1–2 are counted per browser (before an account exists){trackedSince ? `, tracked since ${trackedSince.slice(0, 10)}` : ", and start counting from this release"}. Later steps are counted per creator.</p>
      </section>
      <div className="ad-cols">
        <section className="ad-card">
          <h2>Time between steps <small>median</small></h2>
          <dl className="ad-dl">
            <dt>Signed in → onboarded</dt><dd>{dur(median(g34))} <small className="sub">({g34.length} creators)</small></dd>
            <dt>Onboarded → first real deal</dt><dd>{dur(median(g46))} <small className="sub">({g46.length} creators)</small></dd>
          </dl>
          <h2>OTP success rate</h2>
          <dl className="ad-dl">
            <dt>Email</dt><dd>{email.rate === null ? "—" : `${email.rate}%`} <small className="sub">({email.ok} verified / {email.req} requested)</small></dd>
            <dt>SMS</dt><dd>{sms.rate === null ? "—" : `${sms.rate}%`} <small className="sub">({sms.ok} verified / {sms.req} requested)</small></dd>
          </dl>
        </section>
        <section className="ad-card">
          <h2>Top screens where sessions end</h2>
          {topEnds.length ? <Bars items={topEnds.map(([s, n]) => ({ label: s, value: n, href: `/admin/activity${qs(sp, { event: "page_view", screen: s })}` }))} /> : <p className="sub">No screen views in this range yet.</p>}
        </section>
      </div>
    </main>
  );
}
