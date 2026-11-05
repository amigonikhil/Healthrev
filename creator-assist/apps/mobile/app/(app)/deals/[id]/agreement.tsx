import { fmtDateLong, fmtDay, fmtTimeIST, istDate } from "@creator-assist/shared/dates";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { api } from "@/lib/api";
import { downloadAndShare, openWeb, openWhatsApp, shareLink } from "@/lib/links";
import { errorText, useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Button, Card, Chip, KV, LinkButton, LoadError, Note, Skeleton, SubScreen, Toggle, Txt, useToast } from "@/ui";

export default function AgreementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const toast = useToast();
  const { data, error, reload } = useLoad(() => Promise.all([api.deals.get(id), api.deals.agreement(id)]));
  const [busy, setBusy] = useState<"send" | "pdf" | null>(null);
  const [sent, setSent] = useState<{ link: string; wa: string | null } | null>(null);
  const [byEmail, setByEmail] = useState<boolean | null>(null);
  const [byWa, setByWa] = useState<boolean | null>(null);

  if (!data) return <SubScreen><Stack.Screen options={{ title: "Agreement" }} />{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={5} />}</SubScreen>;
  const [{ deal: v }, { body, agreement: a, signLink }] = data;
  const d = v.d;
  const contact = d.brand.contact_name || d.brand.name;
  const email = d.brand.contact_email, whatsapp = d.brand.contact_whatsapp;
  const useEmail = byEmail ?? !!email, useWa = byWa ?? !!whatsapp;
  const link = sent?.link ?? signLink;

  async function send() {
    setBusy("send");
    try {
      const r = await api.deals.sendAgreement(id, { email: useEmail, whatsapp: useWa });
      setSent({ link: r.link, wa: r.wa });
      toast(r.note ?? (r.emailed ? `Sent to ${email}` : "Signing link ready"));
      if (r.wa) await openWhatsApp(r.wa, "agreement", `/deals/${id}/agreement`);
    } catch (e) { toast(errorText(e)); } finally { setBusy(null); }
  }

  async function pdf() {
    if (!a) return;
    setBusy("pdf");
    try { await downloadAndShare(api.agreements.pdfPath(a.id), `Agreement-${d.brand.name.replace(/\W+/g, "-")}.pdf`, "application/pdf"); }
    catch (e) { toast(errorText(e)); } finally { setBusy(null); }
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Agreement" }} />
      <View style={{ alignSelf: "flex-start" }}><Chip tone="mute" label={`Paid collab · ${d.paid_by === "agency" ? "via agency" : "brand direct"}`} /></View>
      <Card>
        <Txt v="h2" accessibilityRole="header">{body.title}</Txt>
        <Txt color={c.muted}>{body.subtitle}</Txt>
        {body.clauses.map(([h, t], i) => (
          <View key={i} style={{ gap: 4 }}>
            <Txt w="bold">{h}</Txt>
            <Txt style={{ fontFamily: Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" }), lineHeight: 22 }} selectable>{t}</Txt>
          </View>
        ))}
      </Card>

      {a?.status === "signed" ? (<>
        <Card>
          <Txt v="h2" accessibilityRole="header">Signed</Txt>
          <KV k="Signed by" v={`${a.signer_name}${a.signer_designation ? `, ${a.signer_designation}` : ""}`} />
          <KV k="When" v={`${fmtDateLong(istDate(a.signed_at!))}, ${fmtTimeIST(a.signed_at!)}`} />
          <KV k="Verified by" v={`Email OTP · ${a.signer_email}`} />
        </Card>
        <Button title="Download PDF" busy={busy === "pdf"} onPress={pdf} accessibilityHint="Opens the share sheet to save or send it" />
      </>) : (<>
        {a && <Note>Sent {fmtDay(istDate(a.sent_at))}{a.viewed_at ? ` · opened ${fmtDay(istDate(a.viewed_at))}` : " · not opened yet"} · awaiting signature</Note>}
        <Card>
          <Txt v="h2" accessibilityRole="header">{signLink ? "Send again" : `Send to ${contact}`}</Txt>
          <Toggle label={`Email · ${email ?? "no email on file"}`} value={useEmail} onChange={setByEmail} disabled={!email} />
          <Toggle label={`WhatsApp · ${whatsapp ?? "no number on file"}`} value={useWa} onChange={setByWa} disabled={!whatsapp} />
        </Card>
        {sent?.wa && <Button title="Open WhatsApp to send" onPress={() => void openWhatsApp(sent.wa!, "agreement", `/deals/${id}/agreement`)} />}
        <Button title={signLink || sent ? "Send again" : "Send for e-sign"} kind={sent?.wa ? "secondary" : "primary"} busy={busy === "send"} onPress={send} />
        {link ? (<>
          <Button title="Share signing link" kind="secondary" onPress={() => void shareLink(link, `Please review and sign our collab agreement for ${d.brand.name}:`)} />
          <Button title="Copy signing link" kind="secondary" onPress={async () => { await Clipboard.setStringAsync(link); toast("Signing link copied"); }} />
          <LinkButton title="Preview what the brand sees" onPress={() => void openWeb(link)} />
        </>) : (
          <Txt v="small" color={c.muted} style={{ textAlign: "center" }}>The brand gets a link to review and sign with an email OTP. No login needed.</Txt>
        )}
      </>)}
    </SubScreen>
  );
}
