import { fyOf, todayIST } from "@creator-assist/shared/dates";
import { invoiceNumber } from "@creator-assist/shared/invoice";
import { LANGS, paymentMessage } from "@creator-assist/shared/messages";
import { everyHours, everyLabel, REMIND_EVERY_HOURS, REMINDER_COUNT } from "@creator-assist/shared/reminder-schedule";
import type { Lang } from "@creator-assist/shared/types";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Bubble, Button, Card, LoadError, Note, Seg, Select, Skeleton, SubScreen, Toggle, Txt, useToast } from "@/ui";

export default function ReminderSettings() {
  const { c } = useTheme();
  const { me, refresh } = useSession();
  const p = me!.profile!;
  const router = useRouter();
  const toast = useToast();
  const notice = useFlag("lawyer_notice");
  const { data, error, reload } = useLoad(() => api.settings.get());
  const [every, setEvery] = useState(String(everyHours(p.remind_every_hours)));
  const [wa, setWa] = useState(p.remind_whatsapp);
  const [email, setEmail] = useState(p.remind_email);
  const [lang, setLang] = useState<Lang>(p.language);
  const [terms, setTerms] = useState(String(p.default_terms_days));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const today = todayIST();

  async function save() {
    setBusy(true); setErr("");
    try {
      const r = await api.settings.reminders({ everyHours: Number(every), whatsapp: wa, email, language: lang, termsDays: Number(terms) });
      await refresh();
      toast(r.message);
      router.back();
    } catch (e) { setErr(errorText(e)); setBusy(false); }
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Reminders" }} />
      <Card>
        <Select label="Remind brands every" value={every} onChange={setEvery} options={REMIND_EVERY_HOURS.map((h) => ({ value: String(h), label: everyLabel(h) }))} />
        <Txt v="small" color={c.muted}>
          {REMINDER_COUNT} reminders from the due date (9:00 AM){notice ? ", then we prompt you to send the legal notice" : ""}.
        </Txt>
        <Toggle label="WhatsApp from my number" value={wa} onChange={setWa} hint="You get a nudge to send each reminder yourself on WhatsApp" />
        <Toggle label="Email automatically" value={email} onChange={setEmail} />
        <Txt v="small" w="semibold" color={c.text2}>Default message language</Txt>
        <Seg label="Default message language" value={lang} onChange={setLang} options={LANGS} />
      </Card>
      <Txt v="small" w="semibold" color={c.text2}>What the brand gets (example)</Txt>
      {!data ? (error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={1} />) : (
        <Bubble text={paymentMessage({
          lang, contact: "Priya", invoiceNo: invoiceNumber(p.invoice_prefix, fyOf(today), 1), balance: 2_500_000,
          dueDate: today, daysToDue: 0, stage: "friendly", msme: false, creator: p.name,
        }, data.templates)} />
      )}
      <Card>
        <Txt v="small" w="semibold" color={c.text2}>Default payment terms</Txt>
        <Seg label="Default payment terms" value={terms} onChange={setTerms} options={[{ value: "30", label: "30 days" }, { value: "45", label: "45 days" }, { value: "60", label: "60 days" }]} />
      </Card>
      {err ? <Note tone="warn">{err}</Note> : null}
      <Button title="Save reminders" busy={busy} onPress={save} />
    </SubScreen>
  );
}
