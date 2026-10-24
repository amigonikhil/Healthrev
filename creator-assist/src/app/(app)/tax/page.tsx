import Link from "next/link";
import { Chip } from "@/components/ui";
import { loadViews } from "@/lib/data";
import { fmtDay, istDate } from "@/lib/dates";
import { inr } from "@/lib/money";
import { taxHub, upcomingFilings } from "@/lib/tax";
import type { AisEntry, Filing } from "@/lib/types";
import { AisPanel, FilingAction, WhoFiles } from "./client";

export const metadata = { title: "Tax hub · Creator Assist" };

export default async function TaxPage() {
  const { db, views, today, profile } = await loadViews();
  const [{ data: ais }, { data: filings }] = await Promise.all([
    db.from("ais_entries").select("*"),
    db.from("filings").select("*"),
  ]);
  const hub = taxHub(views, (ais ?? []) as AisEntry[], today);
  const cards = upcomingFilings(views, profile, (filings ?? []) as Filing[], today, hub);
  const missing = hub.payers.filter((p) => p.missing > 0);
  const who = profile.files_with === "own_ca" ? "your CA" : "Creator Assist";

  return (
    <main className="scr">
      <h1>Tax hub</h1>
      <p className="sub">FY {hub.fy} · so far</p>
      <div className="stats">
        <div className="stat"><span className="k">Income invoiced</span><span className="v">{inr(hub.income)}</span><span className="sub">{hub.brands} brand{hub.brands === 1 ? "" : "s"}</span></div>
        <div className="stat"><span className="k">GST collected</span><span className="v">{inr(hub.gst)}</span><span className="sub">{profile.gstin ? "On your invoices" : "Not GST-registered"}</span></div>
        <div className="stat"><span className="k">TDS by brands</span><span className="v">{inr(hub.tdsExpected)}</span><span className="sub">Per your invoices</span></div>
        <div className="stat" style={hub.missingTotal ? { borderColor: "var(--warn)" } : undefined}>
          <span className="k">TDS in AIS</span><span className="v">{inr(hub.tdsInAis)}</span>
          {hub.missingTotal > 0
            ? <span className="sub" style={{ color: "var(--warn)", fontWeight: 700 }}>{inr(hub.missingTotal)} missing</span>
            : <span className="sub">{hub.tdsExpected ? "All matched" : "Nothing yet"}</span>}
        </div>
      </div>

      <h2>Needs your action</h2>
      <div className="card" style={{ gap: 12 }}>
        {missing.length === 0 && <p className="sub">No TDS mismatches. Upload your latest AIS to keep this current.</p>}
        {missing.map((p, i) => (
          <div key={p.brand.id} style={{ display: "contents" }}>
            {i > 0 && <div className="hr" />}
            <div className="row">
              <span><b style={{ color: "var(--text)" }}>{p.brand.name}</b><br />TDS {inr(p.missing)} not in AIS</span>
              <Link className="btn sec sm" href={`/tax/remind/${p.brand.id}`}>Remind</Link>
            </div>
          </div>
        ))}
        <AisPanel updated={profile.ais_updated_at ? fmtDay(istDate(profile.ais_updated_at)) : null} fy={hub.fy} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h2>Who files for you</h2>
        <WhoFiles value={profile.files_with} />
      </div>

      <h2>Coming up</h2>
      {cards.map((c) => {
        const days = Math.round((Date.parse(c.due) - Date.parse(today)) / 86_400_000);
        const tone = days <= 20 ? "over" : days <= 45 ? "info" : "mute";
        return (
          <div className="card" key={c.type + c.period}>
            <div className="row">
              <span><b style={{ color: "var(--text)" }}>{c.title}</b><br />{c.detail}</span>
              <Chip tone={tone}>Due {fmtDay(c.due)}</Chip>
            </div>
            {c.type === "itr" && profile.files_with === "creator_assist" && !c.filing?.data_sent_at ? (<>
              <div className="row"><span>Data goes to Creator Assist after your AI call</span><Chip tone="mute">Opens 1 Apr</Chip></div>
              <Link className="btn sec" href="/tax/file" style={{ minHeight: 42, fontSize: 14 }}>Book AI call now</Link>
            </>) : c.filing?.data_sent_at ? (
              <div className="row"><span>Data sent to {c.filing.handled_by === "own_ca" ? "your CA" : "Creator Assist"} · {fmtDay(istDate(c.filing.data_sent_at))}</span><Chip tone="ok">Ready</Chip></div>
            ) : (
              <FilingAction type={c.type} period={c.period} due={c.due} label={c.type === "itr" ? "Send ITR data to my CA" : `Send data to ${who}`} />
            )}
          </div>
        );
      })}
      <p className="sub">Estimates from your invoices. Confirm all due dates and amounts with your CA.</p>
    </main>
  );
}
