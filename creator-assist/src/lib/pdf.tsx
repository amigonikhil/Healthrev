import "server-only";
import path from "node:path";
import { Document, Font, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { fmtDate, fmtDateLong, fmtTimeIST, istDate } from "./dates";
import { amountInWords, inr } from "./money";
import type { Agreement, AgreementBody, Brand, Invoice, Profile } from "./types";

// Fonts are embedded so ₹ renders (the standard PDF fonts don't have it).
const dir = path.join(process.cwd(), "src", "fonts");
let registered = false;
function fonts() {
  if (registered) return;
  Font.register({ family: "Jakarta", fonts: [{ src: path.join(dir, "jakarta-400.ttf") }, { src: path.join(dir, "jakarta-700.ttf"), fontWeight: 700 }] });
  Font.register({ family: "Serif", fonts: [{ src: path.join(dir, "serif-400.ttf") }, { src: path.join(dir, "serif-700.ttf"), fontWeight: 700 }] });
  Font.registerHyphenationCallback((w) => [w]);
  registered = true;
}

const s = StyleSheet.create({
  page: { padding: 40, fontFamily: "Jakarta", fontSize: 10, color: "#0F172A", lineHeight: 1.45 },
  h1: { fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginBottom: 6 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 10, marginBottom: 2 },
  muted: { color: "#475569" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  hr: { borderBottomWidth: 1, borderBottomColor: "#E2E8F0", marginVertical: 8 },
  cols: { flexDirection: "row", gap: 24 },
  col: { flex: 1 },
  bold: { fontWeight: 700 },
  big: { fontSize: 14, fontWeight: 700 },
  serif: { fontFamily: "Serif", fontSize: 10.5, lineHeight: 1.6 },
  box: { borderWidth: 1, borderColor: "#E2E8F0", borderRadius: 6, padding: 10, marginTop: 14 },
  foot: { position: "absolute", bottom: 24, left: 40, right: 40, fontSize: 8, color: "#64748B", textAlign: "center" },
});

const R = ({ k, v, bold }: { k: string; v: string; bold?: boolean }) => (
  <View style={s.row}><Text style={bold ? s.bold : s.muted}>{k}</Text><Text style={s.bold}>{v}</Text></View>
);

export async function invoicePdf(args: { invoice: Invoice; profile: Profile; brand: Brand; billTo: string; acct: string | null; advanceDate: string | null }) {
  fonts();
  const { invoice: i, profile: p, brand: b } = args;
  const registered = !!p.gstin;
  const doc = (
    <Document title={`Invoice ${i.number}`} author={p.name}>
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{registered ? "Tax invoice" : "Invoice"}</Text>
        <R k="Invoice no." v={i.number} />
        <R k="Invoice date · Due date" v={`${fmtDate(i.invoice_date)} · ${fmtDate(i.due_date)}`} />
        <View style={s.hr} />
        <View style={s.cols}>
          <View style={s.col}>
            <Text style={s.bold}>From</Text>
            <Text>{p.name}</Text>
            {p.address && <Text style={s.muted}>{p.address}</Text>}
            <Text style={s.muted}>{[p.city && !p.address?.includes(p.city) ? p.city : null, `${p.state} (${p.state_code})`].filter(Boolean).join(", ")}</Text>
            {p.gstin && <Text style={s.muted}>GSTIN {p.gstin}</Text>}
            {p.pan_masked && !p.gstin && <Text style={s.muted}>PAN {p.pan_masked}</Text>}
            {p.udyam_no && <Text style={s.muted}>{p.udyam_no}</Text>}
          </View>
          <View style={s.col}>
            <Text style={s.bold}>Bill to</Text>
            <Text>{args.billTo}</Text>
            <Text style={s.muted}>{[b.city, b.state].filter(Boolean).join(", ")}</Text>
            {b.gstin && <Text style={s.muted}>GSTIN {b.gstin}</Text>}
            {b.state && <Text style={s.muted}>Place of supply: {b.state} ({b.state_code})</Text>}
          </View>
        </View>
        <View style={s.hr} />
        {i.lines.map((l, n) => <R key={n} k={`${l.label} · SAC ${l.sac}`} v={l.included ? "Included" : inr(l.amount_paise)} />)}
        <View style={s.hr} />
        <R k="Taxable value" v={inr(i.taxable_paise)} />
        {i.igst_paise > 0 && <R k={`IGST ${Number(i.gst_rate)}%`} v={inr(i.igst_paise)} />}
        {i.cgst_paise > 0 && <R k={`CGST ${Number(i.gst_rate) / 2}%`} v={inr(i.cgst_paise)} />}
        {i.sgst_paise > 0 && <R k={`SGST ${Number(i.gst_rate) / 2}%`} v={inr(i.sgst_paise)} />}
        <View style={s.hr} />
        <View style={s.row}><Text style={s.big}>Total</Text><Text style={s.big}>{inr(i.total_paise)}</Text></View>
        <Text style={s.muted}>{amountInWords(i.total_paise)}</Text>
        {i.advance_deducted_paise > 0 && <R k={`Less: advance received${args.advanceDate ? ` ${fmtDate(args.advanceDate)}` : ""}`} v={`− ${inr(i.advance_deducted_paise)}`} />}
        <View style={s.row}><Text style={s.big}>Balance due by {fmtDate(i.due_date)}</Text><Text style={s.big}>{inr(i.balance_due_paise)}</Text></View>
        <View style={s.box}>
          <Text>
            Pay to {p.bank_name ?? "bank"}{args.acct ? ` · A/c ${args.acct}` : p.bank_account_last4 ? ` · A/c ending ${p.bank_account_last4}` : ""}{p.ifsc ? ` · IFSC ${p.ifsc}` : ""}{p.upi ? ` · UPI ${p.upi}` : ""}.
          </Text>
          <Text style={s.muted}>If TDS is deducted, please share Form 16A.{p.udyam_no ? " Supplier is registered under the MSMED Act, 2006; interest applies to payments after the due date." : ""}</Text>
          {!registered && <Text style={s.muted}>Supplier is not registered under GST; no GST is charged.</Text>}
        </View>
        <Text style={s.foot} fixed>Generated with Creator Assist · {i.number}</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

export async function agreementPdf(args: { body: AgreementBody; agreement: Pick<Agreement, "status" | "signer_name" | "signer_designation" | "signer_email" | "signed_at" | "signer_ip" | "sign_token">; brandName: string }) {
  fonts();
  const a = args.agreement;
  const doc = (
    <Document title={args.body.title} author="Creator Assist">
      <Page size="A4" style={s.page}>
        <Text style={s.h1}>{args.body.title}</Text>
        <Text style={s.muted}>{args.body.subtitle}</Text>
        {args.body.clauses.map(([h, t]) => (
          <View key={h} wrap={false}>
            <Text style={s.h2}>{h}</Text>
            <Text style={s.serif}>{t}</Text>
          </View>
        ))}
        <View style={s.box} wrap={false}>
          {a.status === "signed" && a.signed_at ? (<>
            <Text style={s.bold}>Signed electronically on behalf of {args.brandName}</Text>
            <Text>{a.signer_name}{a.signer_designation ? `, ${a.signer_designation}` : ""}</Text>
            <Text style={s.muted}>Verified by one-time password sent to {a.signer_email}</Text>
            <Text style={s.muted}>{fmtDateLong(istDate(a.signed_at))}, {fmtTimeIST(a.signed_at)} IST{a.signer_ip && a.signer_ip !== "sample" ? ` · IP ${a.signer_ip}` : ""}</Text>
            <Text style={s.muted}>Reference {a.sign_token.slice(0, 12)}</Text>
          </>) : <Text style={s.muted}>Not signed yet.</Text>}
        </View>
        <Text style={s.foot} fixed>Generated with Creator Assist</Text>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
