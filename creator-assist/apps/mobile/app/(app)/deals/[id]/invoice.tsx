import { fmtDate, fmtDay } from "@creator-assist/shared/dates";
import { amountInWords, inr, minus } from "@creator-assist/shared/money";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { downloadAndShare } from "@/lib/links";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, DateField, Hr, KV, LoadError, Note, Skeleton, SubScreen, Toggle, Txt, useToast } from "@/ui";

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { me } = useSession();
  const toast = useToast();
  const p = me!.profile!;
  const { data, error, reload } = useLoad(() => Promise.all([api.deals.get(id), api.deals.invoice(id)]));
  const [date, setDate] = useState<string | null>(null);
  const [email, setEmail] = useState(true);
  const [busy, setBusy] = useState<"gen" | "pdf" | "email" | null>(null);
  const [err, setErr] = useState("");
  const title = p.gstin ? "Tax invoice" : "Invoice";

  if (!data) return <SubScreen><Stack.Screen options={{ title }} />{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={5} />}</SubScreen>;
  const [{ deal: v }, { invoice: inv, billTo }] = data;
  const d = v.d;
  const gstRate = Number(inv.gst_rate);
  const savedId = !inv.draft ? inv.id : null;

  async function generate() {
    setBusy("gen"); setErr("");
    try {
      const r = await api.deals.generateInvoice(id, { invoiceDate: date ?? inv.invoice_date, email: email && !!d.brand.contact_email });
      toast(r.message);
      await reload();
    } catch (e) { setErr(errorText(e)); } finally { setBusy(null); }
  }
  async function pdf() {
    if (!savedId) return;
    setBusy("pdf");
    try { await downloadAndShare(api.invoices.pdfPath(savedId), `${inv.number.replace(/\//g, "-")}.pdf`, "application/pdf"); }
    catch (e) { toast(errorText(e)); } finally { setBusy(null); }
  }
  async function sendAgain() {
    if (!savedId) return;
    setBusy("email");
    try { toast((await api.invoices.email(savedId)).message); } catch (e) { toast(errorText(e)); } finally { setBusy(null); }
  }

  const from = [[p.name, p.address, p.city, p.state].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", "), [p.gstin && `GSTIN ${p.gstin}`, p.udyam_no].filter(Boolean).join(" · ")].filter(Boolean);
  const to = [[billTo, d.brand.city, d.brand.state].filter(Boolean).join(", "), [d.brand.gstin && `GSTIN ${d.brand.gstin}`, d.brand.state && `Place of supply: ${d.brand.state} (${d.brand.state_code})`].filter(Boolean).join(" · ")].filter(Boolean);

  return (
    <SubScreen>
      <Stack.Screen options={{ title }} />
      {inv.draft && <Note>Preview. Generating the invoice gives it the next number and starts the reminder ladder.</Note>}
      <Card>
        <KV k="Invoice no." v={inv.number} />
        <KV k="Date · Due" v={`${fmtDay(inv.invoice_date)} · ${fmtDate(inv.due_date)}`} />
        <Hr />
        <Party title="From" lines={from} />
        <Party title="Bill to" lines={to} />
        <Hr />
        {inv.lines.map((l, i) => <KV key={i} k={`${l.label} · SAC ${l.sac}`} v={l.included ? "Included" : inr(l.amount_paise)} />)}
        <KV k="Taxable value" v={inr(inv.taxable_paise)} />
        {inv.igst_paise > 0 && <KV k={`IGST ${gstRate}%`} v={inr(inv.igst_paise)} />}
        {inv.cgst_paise > 0 && <KV k={`CGST ${gstRate / 2}%`} v={inr(inv.cgst_paise)} />}
        {inv.sgst_paise > 0 && <KV k={`SGST ${gstRate / 2}%`} v={inr(inv.sgst_paise)} />}
        <Hr />
        <KV strong k="Total" v={inr(inv.total_paise)} />
        <Txt v="small" color={c.muted}>{amountInWords(inv.total_paise)}</Txt>
        {inv.advance_deducted_paise > 0 && <KV k={`Less: advance received${d.advance_received_at ? ` ${fmtDay(d.advance_received_at)}` : ""}`} v={minus(inv.advance_deducted_paise)} />}
        <KV strong k={`Balance due by ${fmtDay(inv.due_date)}`} v={inr(inv.balance_due_paise)} />
        <Hr />
        <Txt v="small" color={c.muted}>
          Pay to {p.bank_name}{p.bank_account_last4 ? ` · A/c ending ${p.bank_account_last4}` : ""}{p.ifsc ? ` · IFSC ${p.ifsc}` : ""}{p.upi ? ` · UPI ${p.upi}` : ""}. If TDS is deducted, please share Form 16A.
        </Txt>
        {!p.gstin && <Txt v="small" color={c.muted}>You&apos;re not GST-registered, so no GST is charged. Add a GSTIN in Settings if you register.</Txt>}
      </Card>

      {savedId ? (<>
        <Button title="Download PDF" busy={busy === "pdf"} onPress={pdf} accessibilityHint="Opens the share sheet to save or send it" />
        <Button title="Send again" kind="secondary" busy={busy === "email"} onPress={sendAgain} disabled={!d.brand.contact_email} />
      </>) : (<>
        <DateField label="Invoice date" value={date ?? inv.invoice_date} onChange={setDate} />
        {d.brand.contact_email && <Toggle label={`Email the invoice to ${d.brand.contact_email}`} value={email} onChange={setEmail} />}
        {err ? <Note tone="warn">{err}</Note> : null}
        <Button title="Generate invoice" busy={busy === "gen"} onPress={generate} />
      </>)}
    </SubScreen>
  );
}

function Party({ title, lines }: { title: string; lines: string[] }) {
  const { c } = useTheme();
  return (
    <View accessible style={{ gap: 2 }}>
      <Txt w="bold">{title}</Txt>
      {lines.map((l, i) => <Txt key={i} v="small" color={c.muted}>{l}</Txt>)}
    </View>
  );
}
