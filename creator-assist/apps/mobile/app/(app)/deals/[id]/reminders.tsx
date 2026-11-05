import { fmtDay, fmtTimeIST, istDate } from "@creator-assist/shared/dates";
import { LANGS, msmeOffered, paymentMessage, STAGE_LABEL, waLink } from "@creator-assist/shared/messages";
import { inr } from "@creator-assist/shared/money";
import { everyHours, REMINDER_COUNT } from "@creator-assist/shared/reminder-schedule";
import type { Lang } from "@creator-assist/shared/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { openWhatsApp } from "@/lib/links";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Bubble, Button, Card, Chip, LoadError, Note, Seg, Skeleton, SubScreen, Toggle, Txt, useToast } from "@/ui";

export default function RemindersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { me } = useSession();
  const p = me!.profile!;
  const notice = useFlag("lawyer_notice");
  const router = useRouter();
  const { data, error, reload } = useLoad(() => Promise.all([api.deals.get(id), api.deals.reminders(id)]));

  if (!data) return <SubScreen><Stack.Screen options={{ title: "Reminders" }} />{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={4} />}</SubScreen>;
  const [{ deal: v }, { ladder, manual, stage, templates }] = data;
  const d = v.d;
  const inv = d.invoice;
  const status = v.phase === "overdue" ? `${inr(v.remaining)} balance overdue` : v.phase === "paid" ? "Paid in full" : inv ? `${inr(v.remaining)} due ${fmtDay(inv.due_date)}` : "Not invoiced yet";

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Reminders" }} />
      <Txt color={c.muted}>{d.brand.name} · {status}</Txt>
      {!inv ? (
        <Note>Reminders start once the invoice is generated: {REMINDER_COUNT} reminders every {everyHours(p.remind_every_hours)} hours from the due date{notice ? ", then the legal notice" : ""} (change this in Settings).</Note>
      ) : (<>
        <Card>
          <Txt v="h2" accessibilityRole="header">Ladder</Txt>
          {ladder.map((r) => {
            const [label, tone] = r.cancelled_at ? ["Cancelled", "mute"] : r.sent_at ? [r.read_at ? "Sent · read" : "Sent", "ok"] : ["Scheduled", "mute"];
            return (
              <View key={r.id} accessible style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Txt style={{ flex: 1 }}>{STAGE_LABEL[r.stage] ?? r.stage} · {fmtDay(istDate(r.scheduled_at))}, {fmtTimeIST(r.scheduled_at)}</Txt>
                <Chip tone={tone as "ok" | "mute"} label={label} />
              </View>
            );
          })}
          {notice && v.noticeDueAt && v.phase !== "paid" && (
            <View accessible style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Txt style={{ flex: 1 }}>Legal notice · {fmtDay(istDate(v.noticeDueAt))}, {fmtTimeIST(v.noticeDueAt)}</Txt>
              <Chip tone={v.noticeReady ? "over" : "mute"} label={v.noticeReady ? "Due now" : "Next"} />
            </View>
          )}
          {manual.length > 0 && <Txt v="small" color={c.muted}>{manual.length} sent by you on WhatsApp</Txt>}
        </Card>
        {notice && v.noticeReady && <Button title="Send legal notice" onPress={() => router.push(`/deals/${id}/notice`)} />}
        {v.phase !== "paid" && (
          <Composer
            dealId={id} stage={stage} defaultLang={p.language} contact={d.brand.contact_name ?? ""} phone={d.brand.contact_whatsapp}
            email={d.brand.contact_email} ccEmail={d.brand.cc_email} invoiceNo={inv.number} balance={v.remaining} dueDate={inv.due_date}
            daysToDue={v.daysToDue ?? 0} msmeAvailable={!!p.udyam_no} creator={p.name} templates={templates} onSent={reload}
          />
        )}
      </>)}
    </SubScreen>
  );
}

function Composer(p: {
  dealId: string; stage: string; defaultLang: Lang; contact: string; phone: string | null; email: string | null; ccEmail: string | null;
  invoiceNo: string; balance: number; dueDate: string; daysToDue: number; msmeAvailable: boolean; creator: string;
  templates: Parameters<typeof paymentMessage>[1]; onSent: () => Promise<void>;
}) {
  const { c } = useTheme();
  const toast = useToast();
  const [lang, setLang] = useState<Lang>(p.defaultLang);
  const [msme, setMsme] = useState(false);
  const [cc, setCc] = useState(!!p.ccEmail);
  const [busy, setBusy] = useState(false);
  const offerMsme = p.msmeAvailable && msmeOffered(p.stage);
  const text = paymentMessage({
    lang, contact: p.contact.split(" ")[0], invoiceNo: p.invoiceNo, balance: p.balance, dueDate: p.dueDate,
    daysToDue: p.daysToDue, stage: p.stage, msme, creator: p.creator,
  }, p.templates);
  const target = { dealId: p.dealId, kind: "payment" as const, stage: p.stage, lang, message: text };

  async function whatsapp() {
    const ok = await openWhatsApp(waLink(p.phone, text), "payment_reminder", `/deals/${p.dealId}/reminders`);
    if (!ok) return toast("Couldn't open WhatsApp");
    try { await api.reminders.logWhatsApp(target); await p.onSent(); } catch { /* the message was still sent from WhatsApp */ }
  }
  async function email() {
    setBusy(true);
    try { toast((await api.reminders.email({ ...target, cc })).message); await p.onSent(); }
    catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  return (<>
    <Txt v="small" w="semibold" color={c.text2}>Message language</Txt>
    <Seg label="Message language" value={lang} onChange={setLang} options={LANGS} />
    <Bubble text={text} />
    {offerMsme && <Toggle label="Mention MSME interest" value={msme} onChange={setMsme} />}
    <Toggle label={`CC agency / finance team${p.ccEmail ? ` · ${p.ccEmail}` : " (add a CC email on the brand)"}`} value={cc} onChange={setCc} disabled={!p.ccEmail} />
    {p.phone
      ? <Button title="Send now on WhatsApp" onPress={whatsapp} accessibilityHint="Opens WhatsApp with the message filled in" />
      : <Txt v="small" color={c.muted}>Add a WhatsApp number for this brand to send on WhatsApp.</Txt>}
    <Button title={p.email ? "Send by email" : "No email on file"} kind="secondary" busy={busy} disabled={!p.email} onPress={email} />
  </>);
}
