import Link from "next/link";
import { markAdvanceReceived } from "@/app/actions/deals";
import { SubmitButton } from "@/components/client";
import { Help } from "@/components/help";
import { Chip, Row, Top } from "@/components/ui";
import { fmtDay, fmtDate } from "@/lib/dates";
import { dealAmounts, detailChip, type DealView } from "@/lib/deal-view";
import { deliverablesSummary, usageDurationLabel } from "@/lib/deliverables";
import { loadDealView } from "@/lib/data";
import { inr, minus } from "@/lib/money";
import { dealTimeline } from "@/lib/timeline";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, today, profile } = await loadDealView(id);
  const d = v.d;
  const inv = d.invoice;
  const chip = detailChip(v);
  const advanceIn = d.advance_received_at && d.advance_paise ? d.advance_paise : 0;
  const timeline = dealTimeline(v, today);
  const advanceAction = markAdvanceReceived.bind(null, d.id);
  const amt = dealAmounts(v);
  const actions = barActions(v);

  return (
    <main className="scr">
      <Top title={d.brand.name} sub={inv?.number ?? (d.is_sample ? "Sample deal" : "Not invoiced yet")} fallback="/deals" />
      <Chip tone={chip.tone} style={{ alignSelf: "flex-start" }}>{chip.label}</Chip>
      <div className="deal-amts">
        <p className="big-amt">{inr(amt.due)} <span>{amt.label}</span></p>
        <p className="sub">{inr(amt.afterTds)} after TDS{amt.label === "due" && !inv ? " · estimate, not invoiced yet" : ""}</p>
      </div>

      <div className="card">
        {inv ? (<>
          <Row k="Invoice total" v={inr(inv.total_paise)} />
          {inv.advance_deducted_paise > 0 && <Row k={`Advance received${d.advance_received_at ? ` · ${fmtDay(d.advance_received_at)}` : ""}`} v={minus(inv.advance_deducted_paise)} />}
          {v.received > 0 && <Row k="Received so far" v={minus(v.received)} />}
          {v.tdsRecorded > 0 && <Row k="TDS deducted" v={minus(v.tdsRecorded)} />}
          {v.tdsRemaining > 0 && <Row k="TDS (est.)" v={minus(v.tdsRemaining)} />}
          <div className="hr" />
          <Row strong k={v.phase === "paid" ? "Balance" : "Balance to receive"} v={<span className="big">{v.phase === "paid" ? "₹0" : inr(v.receive)}</span>} />
        </>) : (<>
          <Row k="Fee" v={inr(d.fee_paise)} />
          <Row k="Invoice total (est.)" v={inr(v.total)} />
          {d.advance_paise > 0 && <Row k={advanceIn ? `Advance received · ${fmtDay(d.advance_received_at!)}` : "Advance (not received yet)"} v={minus(d.advance_paise)} />}
          <Row k="TDS (est.)" v={minus(v.tdsExpected)} />
          <div className="hr" />
          <Row strong k="Balance you receive" v={<span className="big">{inr(Math.max(0, v.total - d.advance_paise - v.tdsExpected))}</span>} />
        </>)}
        {v.interest > 0 && (
          <div className="note">MSME interest<Help term="msme" /> so far: <b>{inr(v.interest)}</b> on the {inr(v.remaining)} unpaid, for {v.daysOverdue} day{v.daysOverdue === 1 ? "" : "s"}.</div>
        )}
      </div>

      {v.noticeReady && (
        <div className="card" style={{ boxShadow: "inset 0 0 0 2px var(--primary)" }}>
          <h2>Time for the legal notice</h2>
          <p className="sub">{v.remindersSent || "All"} reminder{v.remindersSent === 1 ? "" : "s"} sent and {d.brand.name} still hasn&apos;t paid. Send the legal notice on your lawyer&apos;s letterhead.</p>
          <Link className="btn" href={`/deals/${d.id}/notice`}>Send legal notice</Link>
        </div>
      )}

      <div className="card">
        <Row k="Deliverables" v={deliverablesSummary(d.deliverables)} />
        <Row k="Usage rights" v={d.usage?.enabled ? `${usageDurationLabel(d.usage.duration)} · included` : "None"} />
        <Row k="Paid by" v={d.paid_by === "agency" ? d.brand.agency_name ?? "Agency" : "Brand directly"} />
        <Row k={<>GST<Help term="gst" /></>} v={d.gst_mode === "incl" ? "Included in fee" : d.gst_mode === "add" && profile.gstin ? "Added on top" : "None"} />
        <Row k={<>TDS<Help term="tds" /></>} v={Number(d.tds_rate) > 0 ? `${Number(d.tds_rate)}% by brand` : "Not deducted"} />
        {d.go_live_date && <Row k="Go-live" v={fmtDate(d.go_live_date)} />}
        <Row k="Terms" v={`${d.terms_days} days after invoice`} />
      </div>

      {d.advance_paise > 0 && !d.advance_received_at && (
        <form action={advanceAction}><SubmitButton className="btn sec">Mark {inr(d.advance_paise)} advance received</SubmitButton></form>
      )}
      {(!d.agreement || d.agreement.status === "sent") && (
        <Link className="btn sec" href={`/deals/${d.id}/agreement`}>{d.agreement ? "Agreement · awaiting signature" : "Send agreement for e-sign"}</Link>
      )}

      {/* Everything else stays one tap away; the bar's own actions aren't repeated here. */}
      <div className="stats">
        {[
          { href: `/deals/${d.id}/invoice`, label: "Invoice", cls: "btn sec" },
          { href: `/deals/${d.id}/reminders`, label: "Reminders", cls: "btn sec" },
          { href: `/deals/${d.id}/escalate`, label: "Escalate", cls: "btn warn" },
          { href: `/deals/${d.id}/payment`, label: v.phase === "paid" ? "Payments" : "Mark paid", cls: "btn sec" },
        ].filter((x) => !actions.some((a) => a.href === x.href)).map((x) => <Link key={x.href} className={x.cls} href={x.href}>{x.label}</Link>)}
      </div>

      {timeline.length > 0 && (
        <div className="card">
          <h2>Timeline</h2>
          <ol className="tl">
            {timeline.map((t, i) => <li key={i}><span className="dot" style={{ background: t.color }} /><span>{t.text}</span></li>)}
          </ol>
        </div>
      )}
      {d.agreement?.status === "signed" && <Link className="linkbtn" style={{ alignSelf: "center" }} href={`/deals/${d.id}/agreement`}>View signed agreement</Link>}

      {/* Pinned above the tab bar; it stays in the page flow, so nothing scrolls out of reach behind it. */}
      <div className="actbar" role="group" aria-label="Next steps">
        {actions.map((a) => <Link key={a.href} className={`btn${a.primary ? "" : " sec"}`} href={a.href}>{a.label}</Link>)}
      </div>
    </main>
  );
}

/** The one or two next steps that fit where the deal is. */
function barActions(v: DealView): { label: string; href: string; primary?: boolean }[] {
  const base = `/deals/${v.d.id}`;
  switch (v.phase) {
    case "overdue":
      return v.noticeReady
        ? [{ label: "Send legal notice", href: `${base}/notice` }, { label: "Mark paid", href: `${base}/payment`, primary: true }]
        : [{ label: "Send reminder", href: `${base}/reminders` }, { label: "Mark paid", href: `${base}/payment`, primary: true }];
    case "due": return [{ label: "Send reminder", href: `${base}/reminders` }, { label: "Mark paid", href: `${base}/payment`, primary: true }];
    case "sign": return [{ label: "View agreement", href: `${base}/agreement`, primary: true }];
    case "ready": return [{ label: "Create invoice", href: `${base}/invoice`, primary: true }];
    case "draft": return [{ label: "Send agreement", href: `${base}/agreement`, primary: true }];
    default: return [{ label: "View invoice", href: `${base}/invoice`, primary: true }];
  }
}
