import { noticeText, type Notice } from "@creator-assist/shared/notice";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { downloadAndShare, openWhatsApp } from "@/lib/links";
import { errorText, useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Button, Card, LoadError, Note, Skeleton, SubScreen, Toggle, Txt, useToast } from "@/ui";

/** Legal notice (lawyer_notice flag): review, confirm the facts, then send it yourself. Never automatic. */
export default function NoticeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const toast = useToast();
  const on = useFlag("lawyer_notice");
  const { data, error, reload } = useLoad(() => Promise.all([api.deals.get(id), api.deals.notice(id)]));
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState<"email" | "pdf" | null>(null);

  if (!on) return <SubScreen><Stack.Screen options={{ title: "Legal notice" }} /><Note>This isn&apos;t available.</Note></SubScreen>;
  if (!data) return <SubScreen><Stack.Screen options={{ title: "Legal notice" }} />{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={6} />}</SubScreen>;
  const [{ deal: v }, { notice, waHref, emailTo }] = data;

  async function email() {
    setBusy("email");
    try { toast((await api.deals.emailNotice(id)).message); } catch (e) { toast(errorText(e)); } finally { setBusy(null); }
  }
  async function whatsapp() {
    if (!waHref) return;
    if (await openWhatsApp(waHref, "legal_notice", `/deals/${id}/notice`)) { try { await api.deals.logNoticeWhatsApp(id); } catch { /* sent from WhatsApp anyway */ } }
  }
  async function pdf() {
    setBusy("pdf");
    try { await downloadAndShare(`/deals/${encodeURIComponent(id)}/notice/pdf`, `Legal-notice-${v.d.brand.name.replace(/\W+/g, "-")}.pdf`, "application/pdf"); }
    catch (e) { toast(errorText(e)); } finally { setBusy(null); }
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Legal notice" }} />
      <Card><Txt selectable>{noticeText(notice as Notice).replace(/\*\*/g, "")}</Txt></Card>
      <Button title="Open as PDF" kind="secondary" busy={busy === "pdf"} onPress={pdf} />
      <Toggle label="I confirm the facts in this notice are correct" value={ok} onChange={setOk} />
      {waHref ? <Button title="Send via WhatsApp" disabled={!ok} onPress={whatsapp} /> : <Txt v="small" color={c.muted}>Add a WhatsApp number for this brand to send on WhatsApp.</Txt>}
      <Button title={emailTo ? `Send via email${v.d.is_sample ? " (to you, sample)" : ""}` : "No email on file"} kind="secondary" busy={busy === "email"} disabled={!ok || !emailTo} onPress={email} />
    </SubScreen>
  );
}
