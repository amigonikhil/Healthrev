import { fmtDay, istDate } from "@creator-assist/shared/dates";
import { LANGS, STAGE_LABEL, tdsMessage, waLink } from "@creator-assist/shared/messages";
import { inr } from "@creator-assist/shared/money";
import type { Lang } from "@creator-assist/shared/types";
import { Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { openWhatsApp } from "@/lib/links";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Bubble, Button, Card, Chip, LoadError, Seg, Skeleton, SubScreen, Toggle, Txt, useToast } from "@/ui";

export default function TdsRemind() {
  const { brandId } = useLocalSearchParams<{ brandId: string }>();
  const { c } = useTheme();
  const { me } = useSession();
  const p = me!.profile!;
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.reminders.tds(brandId));
  const [lang, setLang] = useState<Lang>(p.language);
  const [alsoEmail, setAlsoEmail] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <SubScreen><Stack.Screen options={{ title: "TDS reminder" }} />{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={4} />}</SubScreen>;
  const { payer, ladder, pan } = data;
  const b = payer.brand;
  const emailOn = alsoEmail ?? !!b.contact_email;
  const sentEmail = ladder.filter((r) => r.channel === "email" && r.sent_at).length;
  const rows = ladder.length
    ? ladder.filter((r) => r.channel === "email").map((r) => ({ label: `${STAGE_LABEL[r.stage] ?? r.stage} · ${fmtDay(istDate(r.scheduled_at))}`, chip: r.cancelled_at ? "Cancelled" : r.sent_at ? "Sent" : "Scheduled", tone: r.sent_at ? "ok" : "mute" }))
    : [{ label: "Friendly · today", chip: "Ready", tone: "mute" }, { label: "Follow-up · +7 days", chip: "Scheduled", tone: "mute" }, { label: "Firm · +15 days", chip: "Scheduled", tone: "mute" }];
  const text = tdsMessage({ lang, contact: (b.contact_name ?? "").split(" ")[0], amount: payer.missing, invoiceNos: payer.invoiceNos, pan, creator: p.name });
  const stage = sentEmail === 0 ? "friendly" : sentEmail === 1 ? "follow_up" : "firm";
  const target = { brandId, kind: "tds" as const, stage, lang, message: text };

  async function email(): Promise<string> {
    const r = await api.reminders.email({ ...target, cc: false });
    await api.reminders.scheduleTds(brandId, lang);
    return r.message;
  }
  async function whatsapp() {
    if (!(await openWhatsApp(waLink(b.contact_whatsapp, text), "tds_reminder", `/tax/remind/${brandId}`))) return toast("Couldn't open WhatsApp");
    setBusy(true);
    try {
      await api.reminders.logWhatsApp(target);
      if (emailOn) toast(await email());
      else { await api.reminders.scheduleTds(brandId, lang); toast("Follow-ups scheduled"); }
      await reload();
    } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }
  async function emailOnly() {
    setBusy(true);
    try { toast(`${await email()} · reminders scheduled`); await reload(); } catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "TDS reminder" }} />
      <Txt color={c.muted}>{b.name} · {inr(payer.missing)} TDS missing from AIS</Txt>
      <Card>
        {rows.map((r) => (
          <View key={r.label} accessible style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Txt style={{ flex: 1 }}>{r.label}</Txt>
            <Chip tone={r.tone as "ok" | "mute"} label={r.chip} />
          </View>
        ))}
        {ladder.some((r) => r.channel === "whatsapp") && <Txt v="small" color={c.muted}>{ladder.filter((r) => r.channel === "whatsapp").length} sent by you on WhatsApp</Txt>}
      </Card>
      <Txt v="small" w="semibold" color={c.text2}>Message language</Txt>
      <Seg label="Message language" value={lang} onChange={setLang} options={LANGS} />
      <Bubble text={text} />
      <Toggle label={`Also send by email${b.contact_email ? "" : " (no email on file)"}`} value={emailOn} onChange={setAlsoEmail} disabled={!b.contact_email} />
      {b.contact_whatsapp
        ? <Button title="Send now on WhatsApp" busy={busy} onPress={whatsapp} accessibilityHint="Opens WhatsApp with the message filled in" />
        : <Txt v="small" color={c.muted}>Add a WhatsApp number for this brand to send on WhatsApp.</Txt>}
      <Button title="Send by email only" kind="secondary" busy={busy} disabled={!b.contact_email} onPress={emailOnly} />
    </SubScreen>
  );
}
