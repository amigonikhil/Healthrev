import "server-only";
import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { allocate } from "./calc";
import { fmtDateLong } from "./dates";
import { amountInWords, inr } from "./money";
import { fonts } from "./pdf";
import type { Brand, Invoice, Payment, Profile } from "./types";

// Invoice layout: green header band, three-column detail blocks, green table
// header, totals on the right, footer band. Colours sampled from the
// reference invoice the owner supplied.
const GREEN = "#27AE60";
const TINT = "#E8F6EE";
const INK = "#161C26";
const SLATE = "#516173";
const RULE = "#EEEEEE";
const PILL: Record<Status, string> = { Paid: "#52C41A", "Partly paid": "#FAAD14", Overdue: "#F5222D", Unpaid: "#8C8C8C" };

type Status = "Paid" | "Partly paid" | "Overdue" | "Unpaid";

const s = StyleSheet.create({
  page: { fontFamily: "Jakarta", fontSize: 9, color: INK, paddingTop: 20, paddingBottom: 74, paddingHorizontal: 20, lineHeight: 1.35 },
  band: { backgroundColor: TINT, flexDirection: "row", paddingVertical: 18, paddingHorizontal: 20, minHeight: 92 },
  title: { fontSize: 32, color: GREEN, lineHeight: 1.1 },
  pill: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2, fontSize: 7.5, color: "#fff" },
  name: { fontSize: 12, fontWeight: 700, marginBottom: 6 },
  grid: { flexDirection: "row", paddingHorizontal: 5, marginTop: 16 },
  col: { width: "33.33%", paddingRight: 12 },
  label: { alignSelf: "flex-start", backgroundColor: TINT, borderLeftWidth: 1.5, borderLeftColor: GREEN, color: SLATE, fontSize: 8, paddingVertical: 2.5, paddingHorizontal: 6, marginBottom: 7 },
  kv: { flexDirection: "row", marginBottom: 5 },
  k: { color: INK },
  v: { flex: 1, color: SLATE },
  line: { color: SLATE, marginBottom: 5 },
  party: { fontSize: 10, marginBottom: 6 },
  table: { marginTop: 18, marginHorizontal: 5, borderWidth: 0.75, borderColor: RULE, borderRadius: 4 },
  thead: { flexDirection: "row", backgroundColor: GREEN, color: "#fff", fontWeight: 700, paddingVertical: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  tr: { flexDirection: "row", paddingVertical: 8, backgroundColor: TINT, borderTopWidth: 0.75, borderTopColor: "#fff" },
  c: { paddingHorizontal: 5 },
  num: { textAlign: "right" },
  lower: { flexDirection: "row", marginTop: 16, paddingHorizontal: 5 },
  left: { flex: 1, paddingRight: 24 },
  right: { width: 190 },
  words: { color: GREEN, fontSize: 11, marginTop: 6, textTransform: "uppercase" },
  tot: { flexDirection: "row", justifyContent: "space-between", marginBottom: 7, color: SLATE, fontSize: 10 },
  totV: { color: INK },
  rule: { borderBottomWidth: 0.75, borderBottomColor: "#D9D9D9", marginVertical: 6 },
  grand: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginVertical: 5 },
  ptable: { marginTop: 8, borderWidth: 0.75, borderColor: RULE, borderRadius: 4 },
  phead: { flexDirection: "row", backgroundColor: GREEN, color: "#fff", fontSize: 7.5, paddingVertical: 6, paddingHorizontal: 8, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  prow: { flexDirection: "row", fontSize: 7.5, color: SLATE, paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 0.75, borderTopColor: RULE },
  foot: { position: "absolute", left: 20, right: 20, bottom: 20, backgroundColor: TINT, minHeight: 42, justifyContent: "flex-end", paddingBottom: 11, alignItems: "center", color: SLATE, fontSize: 8.5 },
});

const KV = ({ k, v, w }: { k: string; v: string | null | undefined; w: number }) =>
  v ? <View style={s.kv}><Text style={[s.k, { width: w }]}>{k}</Text><Text style={s.v}>{v}</Text></View> : null;

const Label = ({ children }: { children: string }) => <Text style={s.label}>{children}</Text>;

/** Splits "Instagram Reel × 2" into its name and quantity. */
function splitLine(label: string): { name: string; qty: number } {
  const m = label.match(/^(.*) × (\d+)$/);
  return m ? { name: m[1], qty: Number(m[2]) } : { name: label, qty: 1 };
}

export function invoiceStatus(inv: Invoice, payments: Payment[], today: string): Status {
  const settled = payments.reduce((a, p) => a + p.amount_paise + p.tds_paise, 0);
  if (inv.balance_due_paise - settled <= 0) return "Paid";
  if (settled > 0) return "Partly paid";
  return inv.due_date < today ? "Overdue" : "Unpaid";
}

export async function invoicePdf(args: {
  invoice: Invoice; profile: Profile; brand: Brand; billTo: string; acct: string | null; pan: string | null;
  advanceDate: string | null; payments: Payment[]; today: string;
}) {
  fonts();
  const { invoice: i, profile: p, brand: b, payments } = args;
  // GST columns follow the invoice as issued, not the creator's current GSTIN.
  const registered = Number(i.gst_rate) > 0;
  const rate = Number(i.gst_rate);
  const gstTotal = i.cgst_paise + i.sgst_paise + i.igst_paise;
  const status = invoiceStatus(i, payments, args.today);
  const received = payments.reduce((a, x) => a + x.amount_paise, 0);
  const tds = payments.reduce((a, x) => a + x.tds_paise, 0);
  const balance = Math.max(0, i.balance_due_paise - received - tds);
  const lineGst = registered && gstTotal ? allocate(gstTotal, i.lines.map((l) => (l.included ? 0 : l.amount_paise))) : i.lines.map(() => 0);
  const interState = i.igst_paise > 0;
  const addr = [p.address, p.city && !p.address?.includes(p.city) ? p.city : null].filter(Boolean).join(", ");
  const cols = registered
    ? [{ h: "#", w: 22 }, { h: "Item", w: 0 }, { h: "GST\nRate", w: 40 }, { h: "Qty", w: 32 }, { h: "Rate", w: 62 }, { h: "Amount", w: 66 }, { h: "GST", w: 58 }, { h: "Total", w: 66 }]
    : [{ h: "#", w: 22 }, { h: "Item", w: 0 }, { h: "Qty", w: 40 }, { h: "Rate", w: 80 }, { h: "Amount", w: 86 }];
  const cell = (n: number, right = true) => [s.c, cols[n].w ? { width: cols[n].w } : { flex: 1 }, right && n > 1 ? s.num : {}];

  const payRows: { date: string; mode: string; amount: number }[] = [];
  if (i.advance_deducted_paise > 0) payRows.push({ date: args.advanceDate ?? i.invoice_date, mode: "Advance", amount: i.advance_deducted_paise });
  for (const x of [...payments].sort((a, c) => a.received_on.localeCompare(c.received_on))) {
    if (x.amount_paise) payRows.push({ date: x.received_on, mode: x.utr ? `Bank transfer · ${x.utr}` : "Bank transfer", amount: x.amount_paise });
    if (x.tds_paise) payRows.push({ date: x.received_on, mode: "TDS deducted by payer", amount: x.tds_paise });
  }

  const doc = (
    <Document title={`Invoice ${i.number}`} author={p.name}>
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <View style={{ width: 190 }}>
            <Text style={s.title}>{registered ? "Tax Invoice" : "Invoice"}</Text>
            <Text style={[s.pill, { backgroundColor: PILL[status] }]}>{status}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{p.name}</Text>
            {addr ? <Text style={{ color: SLATE }}>{addr},</Text> : null}
            <Text style={{ color: SLATE }}>{p.state}, India</Text>
            {p.handle ? <Text style={{ color: SLATE, marginTop: 4 }}>{p.handle}</Text> : null}
          </View>
        </View>

        <View style={s.grid}>
          <View style={s.col}>
            <Label>Invoice Details</Label>
            <KV w={66} k="Invoice No #" v={i.number} />
            <KV w={66} k="Invoice Date" v={fmtDateLong(i.invoice_date)} />
            <KV w={66} k="Due Date" v={fmtDateLong(i.due_date)} />
          </View>
          <View style={s.col}>
            <Label>Billed By</Label>
            <KV w={40} k="GSTIN:" v={p.gstin} />
            <KV w={40} k="PAN:" v={args.pan ?? p.pan_masked} />
            <KV w={40} k="Udyam:" v={p.udyam_no} />
            <KV w={40} k="Email:" v={p.email} />
            <KV w={40} k="Phone:" v={p.phone} />
          </View>
          <View style={s.col}>
            <Label>Payment Record</Label>
            <KV w={84} k="Invoiced Amount" v={inr(i.total_paise)} />
            {i.advance_deducted_paise > 0 && <KV w={84} k="Advance" v={`(${inr(i.advance_deducted_paise)})`} />}
            {received > 0 && <KV w={84} k="Paid Amount" v={`(${inr(received)})`} />}
            {tds > 0 && <KV w={84} k="TDS" v={`(${inr(tds)})`} />}
            <KV w={84} k="Balance Due" v={inr(balance)} />
          </View>
        </View>

        <View style={[s.grid, { marginTop: 14 }]}>
          <View style={s.col}>
            <Label>Billed To</Label>
            <Text style={s.party}>{args.billTo}</Text>
            <Text style={s.line}>{[b.city, b.state].filter(Boolean).join(", ")}{b.state ? ", India" : ""}</Text>
            <KV w={40} k="GSTIN:" v={b.gstin} />
            <KV w={40} k="Email:" v={b.contact_email} />
          </View>
          <View style={s.col}>
            <Label>Place of Supply</Label>
            <Text style={s.party}>{b.state ? `${b.state} (${b.state_code})` : `${p.state} (${p.state_code})`}</Text>
            {registered
              ? <Text style={s.line}>{interState ? "Inter-state supply · IGST" : "Intra-state supply · CGST + SGST"}</Text>
              : <Text style={s.line}>Supplier not registered under GST</Text>}
            {registered && <Text style={s.line}>Reverse charge: No</Text>}
          </View>
          <View style={s.col}>
            <Label>Bank Details</Label>
            <Text style={s.party}>{p.bank_name ?? "Bank"}</Text>
            <KV w={44} k="A/c No:" v={args.acct ?? (p.bank_account_last4 ? `••${p.bank_account_last4}` : null)} />
            <KV w={44} k="IFSC:" v={p.ifsc} />
            <KV w={44} k="UPI:" v={p.upi} />
          </View>
        </View>

        <View style={s.table}>
          <View style={s.thead}>
            {cols.map((c, n) => <Text key={c.h} style={cell(n)}>{c.h}</Text>)}
          </View>
          {i.lines.map((l, n) => {
            const { name, qty } = splitLine(l.label);
            const amt = l.included ? "Included" : inr(l.amount_paise);
            const unit = l.included ? "—" : inr(Math.round(l.amount_paise / qty));
            const values = registered
              ? [`${n + 1}.`, "", l.included ? "—" : `${rate}%`, l.included ? "—" : String(qty), unit, amt, l.included ? "—" : inr(lineGst[n]), l.included ? "Included" : inr(l.amount_paise + lineGst[n])]
              : [`${n + 1}.`, "", l.included ? "—" : String(qty), unit, amt];
            return (
              <View key={n} style={s.tr} wrap={false}>
                {values.map((v, c) => c === 1
                  ? <Text key={c} style={cell(c, false)}>{name} <Text style={{ fontSize: 7, color: SLATE }}>(SAC: {l.sac})</Text></Text>
                  : <Text key={c} style={cell(c)}>{v}</Text>)}
              </View>
            );
          })}
        </View>

        <View style={s.lower} wrap={false}>
          <View style={s.left}>
            <Text style={{ fontSize: 10, marginTop: 10 }}>Total (in words)</Text>
            <Text style={s.words}>: {amountInWords(i.total_paise).replace(/^Rupees (.*) only$/, "$1 rupees only")}</Text>
            {payRows.length > 0 && (<>
              <Text style={{ fontSize: 10, marginTop: 14 }}>Payments</Text>
              <View style={s.ptable}>
                <View style={s.phead}><Text style={{ width: "28%" }}>Date</Text><Text style={{ width: "52%" }}>Mode</Text><Text style={{ width: "20%", textAlign: "right" }}>Amount</Text></View>
                {payRows.map((r, n) => (
                  <View key={n} style={s.prow}><Text style={{ width: "28%" }}>{fmtDateLong(r.date)}</Text><Text style={{ width: "52%" }}>{r.mode}</Text><Text style={{ width: "20%", textAlign: "right" }}>{inr(r.amount)}</Text></View>
                ))}
              </View>
            </>)}
            <Text style={{ fontSize: 8, color: SLATE, marginTop: 14 }}>
              If TDS is deducted, please share Form 16A.{p.udyam_no ? " Supplier is registered under the MSMED Act, 2006; interest applies to payments made after the due date." : ""}
            </Text>
          </View>

          <View style={s.right}>
            <View style={s.tot}><Text>Amount</Text><Text style={s.totV}>{inr(i.taxable_paise)}</Text></View>
            {i.igst_paise > 0 && <View style={s.tot}><Text>IGST {rate}%</Text><Text style={s.totV}>{inr(i.igst_paise)}</Text></View>}
            {i.cgst_paise > 0 && <View style={s.tot}><Text>CGST {rate / 2}%</Text><Text style={s.totV}>{inr(i.cgst_paise)}</Text></View>}
            {i.sgst_paise > 0 && <View style={s.tot}><Text>SGST {rate / 2}%</Text><Text style={s.totV}>{inr(i.sgst_paise)}</Text></View>}
            <View style={s.rule} />
            <View style={s.grand}><Text style={{ fontSize: 12 }}>Total (INR)</Text><Text style={{ fontSize: 16, color: GREEN }}>{inr(i.total_paise)}</Text></View>
            <View style={s.rule} />
            {i.advance_deducted_paise > 0 && <View style={s.grand}><Text style={{ fontSize: 10.5 }}>Advance Received</Text><Text style={{ fontSize: 12, color: GREEN }}>({inr(i.advance_deducted_paise)})</Text></View>}
            {received + tds > 0 && <View style={s.grand}><Text style={{ fontSize: 10.5 }}>Amount Paid{tds ? " + TDS" : ""}</Text><Text style={{ fontSize: 12, color: GREEN }}>({inr(received + tds)})</Text></View>}
            <View style={s.grand}><Text style={{ fontSize: 10.5, fontWeight: 700 }}>Balance Due</Text><Text style={{ fontSize: 12, fontWeight: 700 }}>{inr(balance)}</Text></View>
            <View style={{ alignItems: "center", marginTop: 16 }}>
              <Text style={{ fontSize: 8.5, color: SLATE }}>For {p.name}</Text>
              <View style={{ height: 30 }} />
              <Text style={{ fontSize: 9 }}>Authorised Signatory</Text>
            </View>
          </View>
        </View>

        <View style={s.foot} fixed>
          <Text>
            For any enquiry, reach out
            {p.email ? <Text> via email at <Text style={{ color: INK, fontWeight: 700 }}>{p.email}</Text></Text> : null}
            {p.email && p.phone ? "," : ""}
            {p.phone ? <Text> call on <Text style={{ color: INK, fontWeight: 700 }}>{p.phone}</Text></Text> : null}
          </Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
