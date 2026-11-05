import { NOTICE_DAYS } from "@creator-assist/shared/advocate";
import { msmeAnnualRate } from "@creator-assist/shared/calc";
import { addDays, daysBetween, fmtDateLong, istDate } from "@creator-assist/shared/dates";
import { inr } from "@creator-assist/shared/money";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Linking } from "react-native";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Card, Chip, ListItem, LoadError, Note, Skeleton, SubScreen, Txt, useToast } from "@/ui";

export default function Escalate() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const { me } = useSession();
  const router = useRouter();
  const toast = useToast();
  const notice = useFlag("lawyer_notice");
  const p = me!.profile!, tax = me!.tax!;
  const { data, error, reload } = useLoad(() => Promise.all([api.deals.get(id), api.deals.escalation(id)]));
  if (!data) return <SubScreen><Stack.Screen options={{ title: "Escalate" }} />{error ? <LoadError message={error} onRetry={reload} /> : <Skeleton rows={4} />}</SubScreen>;
  const [{ deal: v, today }, esc] = data;
  const d = v.d;
  const sent = esc.sentNotice as { created_at: string; channel: "email" | "whatsapp" | null } | null;
  const canEscalate = v.phase === "overdue";

  async function samadhaan() {
    try {
      const r = await api.deals.samadhaan(id);
      toast("Opening MSME Samadhaan. You file the case on the government portal.");
      await Linking.openURL(r.portal);
    } catch (e) { toast(errorText(e)); }
  }
  const samadhaanItem = p.udyam_no ? (
    <ListItem title={`${notice ? "3" : "2"} · MSME Samadhaan`} sub="File a delayed-payment case online" onPress={samadhaan} right={<Chip tone="mute" label="Govt portal" />} />
  ) : null;

  // After the legal notice went out: the notice period countdown.
  if (notice && canEscalate && sent && esc.claim) {
    const sentOn = istDate(sent.created_at);
    const deadline = addDays(sentOn, NOTICE_DAYS);
    const left = daysBetween(today, deadline);
    const period = left > 0 ? `${left} day${left === 1 ? "" : "s"} left` : left === 0 ? "Ends today" : `Ended ${-left} day${left === -1 ? "" : "s"} ago`;
    return (
      <SubScreen>
        <Stack.Screen options={{ title: "Escalate" }} />
        <Card>
          <Txt v="small" color={c.muted}>Legal notice sent · {fmtDateLong(sentOn)}{sent.channel ? ` by ${sent.channel === "email" ? "email" : "WhatsApp"}` : ""}</Txt>
          <Txt v="tile">{inr(esc.claim.total)}</Txt>
          <Txt v="small" color={c.muted}>Claimed from {d.brand.name}: {inr(esc.claim.principal)} unpaid{esc.claim.interest ? " + interest" : ""}{esc.claim.legalFee ? " + legal fee" : ""}.</Txt>
        </Card>
        <Txt v="h2" accessibilityRole="header">What happens next</Txt>
        <ListItem title="1 · Wait for the notice period"
          sub={left >= 0 ? `${d.brand.name} has until ${fmtDateLong(deadline)} to pay. Most brands pay or reply in this window.` : `The ${NOTICE_DAYS}-day period ended on ${fmtDateLong(deadline)} without payment.`}
          right={<Chip tone={left >= 0 ? "info" : "over"} label={period} />} />
        <ListItem title="Brand paid?" sub="Record the payment to close the deal" onPress={() => router.push(`/deals/${id}/payment`)} />
        {samadhaanItem}
        <ListItem title="Send the notice again" onPress={() => router.push(`/deals/${id}/notice`)} />
      </SubScreen>
    );
  }

  return (
    <SubScreen>
      <Stack.Screen options={{ title: "Escalate" }} />
      {!canEscalate ? (
        <Note>{v.phase === "paid" ? "This deal is paid. Nothing to escalate." : "Escalation opens once the invoice is past its due date. Until then, friendly reminders work best."}</Note>
      ) : (<>
        <Card>
          <Txt v="small" color={c.muted}>MSME interest estimate · {d.brand.name}</Txt>
          <Txt v="tile">{p.udyam_no ? inr(v.interest) : "—"}</Txt>
          <Txt v="small" color={c.muted}>
            {p.udyam_no
              ? `${inr(v.remaining)} unpaid × ${msmeAnnualRate(tax).toFixed(1)}% a year (${tax.msme_multiple} × RBI bank rate) for ${v.daysOverdue} days, compounded monthly. Rate is editable in Settings; confirm with a CA.`
              : "Add your Udyam (MSME) number in Settings to claim interest on late payments under the MSMED Act."}
          </Txt>
        </Card>
        <Txt v="h2" accessibilityRole="header">Choose next step</Txt>
        <ListItem title="1 · Send final reminder" sub="Firm message quoting MSME interest" onPress={() => router.push(`/deals/${id}/reminders`)} />
        {notice && <ListItem title="2 · Send legal notice" sub="On your lawyer's letterhead, by WhatsApp or email" onPress={() => router.push(`/deals/${id}/notice`)} />}
        {samadhaanItem}
        <Note>Nothing goes to the brand until you press send.</Note>
      </>)}
    </SubScreen>
  );
}
