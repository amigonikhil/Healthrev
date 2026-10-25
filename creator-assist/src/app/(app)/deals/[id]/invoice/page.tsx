import { Row, Top } from "@/components/ui";
import { fmtDate, fmtDay, todayIST } from "@/lib/dates";
import { getTax, loadDealView } from "@/lib/data";
import { buildInvoice } from "@/lib/invoice";
import { billToName } from "@/lib/invoice-data";
import { amountInWords, inr, minus } from "@/lib/money";
import type { DealFull, InvoiceLine, Profile } from "@/lib/types";
import { GenerateForm, InvoiceActions } from "./actions";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile, db } = await loadDealView(id);
  const d = v.d;
  const today = todayIST();
  const inv = d.invoice ?? {
    ...buildInvoice({
      profile, tax: await getTax(db), brandStateCode: d.brand.state_code, fee: d.fee_paise, gstMode: d.gst_mode, tdsRate: Number(d.tds_rate),
      advanceReceived: d.advance_received_at ? d.advance_paise : 0, termsDays: d.terms_days,
      invoiceDate: d.go_live_date && d.go_live_date <= today ? d.go_live_date : today, deliverables: d.deliverables, usage: d.usage,
    }),
    number: "Draft",
  };
  const gstRate = Number(inv.gst_rate);

  return (
    <main className="scr">
      <Top title={profile.gstin ? "Tax invoice" : "Invoice"} fallback={`/deals/${d.id}`} />
      {!d.invoice && <div className="info">Preview. Generating the invoice gives it the next number and starts the reminder ladder.</div>}
      <div className="card">
        <Row k="Invoice no." v={inv.number} />
        <Row k="Date · Due" v={`${fmtDay(inv.invoice_date)} · ${fmtDate(inv.due_date)}`} />
        <div className="hr" />
        <Party title="From" lines={fromLines(profile)} />
        <Party title="Bill to" lines={billLines(d)} />
        <div className="hr" />
        {inv.lines.map((l: InvoiceLine, i: number) => <Row key={i} k={`${l.label} · SAC ${l.sac}`} v={l.included ? "Included" : inr(l.amount_paise)} />)}
        <Row k="Taxable value" v={inr(inv.taxable_paise)} />
        {inv.igst_paise > 0 && <Row k={`IGST ${gstRate}%`} v={inr(inv.igst_paise)} />}
        {inv.cgst_paise > 0 && <Row k={`CGST ${gstRate / 2}%`} v={inr(inv.cgst_paise)} />}
        {inv.sgst_paise > 0 && <Row k={`SGST ${gstRate / 2}%`} v={inr(inv.sgst_paise)} />}
        <div className="hr" />
        <Row strong k="Total" v={<span className="big">{inr(inv.total_paise)}</span>} />
        <p className="sub">{amountInWords(inv.total_paise)}</p>
        {inv.advance_deducted_paise > 0 && <Row k={`Less: advance received${d.advance_received_at ? ` ${fmtDay(d.advance_received_at)}` : ""}`} v={minus(inv.advance_deducted_paise)} />}
        <Row strong k={`Balance due by ${fmtDay(inv.due_date)}`} v={<b className="amt">{inr(inv.balance_due_paise)}</b>} />
        <div className="hr" />
        <p className="sub">
          Pay to {profile.bank_name}{profile.bank_account_last4 ? ` · A/c ending ${profile.bank_account_last4}` : ""}{profile.ifsc ? ` · IFSC ${profile.ifsc}` : ""}{profile.upi ? ` · UPI ${profile.upi}` : ""}. If TDS is deducted, please share Form 16A.
        </p>
        {!profile.gstin && <p className="sub">You&apos;re not GST-registered, so no GST is charged. Add a GSTIN in Settings if you register.</p>}
      </div>
      {d.invoice
        ? <InvoiceActions invoiceId={d.invoice.id} pdfHref={`/api/invoices/${d.invoice.id}/pdf`} />
        : <GenerateForm dealId={d.id} defaultDate={inv.invoice_date} hasEmail={!!d.brand.contact_email} />}
    </main>
  );
}

function Party({ title, lines }: { title: string; lines: string[] }) {
  return (
    <p className="sub">
      <b style={{ color: "var(--text)" }}>{title}</b>
      {lines.map((l, i) => <span key={i}><br />{l}</span>)}
    </p>
  );
}

const fromLines = (p: Profile) => [
  [p.name, p.address, p.city, p.state].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", "),
  [p.gstin && `GSTIN ${p.gstin}`, p.udyam_no].filter(Boolean).join(" · "),
].filter(Boolean);

const billLines = (d: DealFull) => [
  [billToName(d), d.brand.city, d.brand.state].filter(Boolean).join(", "),
  [d.brand.gstin && `GSTIN ${d.brand.gstin}`, d.brand.state && `Place of supply: ${d.brand.state} (${d.brand.state_code})`].filter(Boolean).join(" · "),
].filter(Boolean);
