import { fmtDate, fmtDay } from "@creator-assist/shared/dates";
import { dealAmounts, detailChip, type DealView } from "@creator-assist/shared/deal-view";
import { deliverablesSummary, usageDurationLabel } from "@creator-assist/shared/deliverables";
import { inr, minus } from "@creator-assist/shared/money";
import { dealTimeline } from "@creator-assist/shared/timeline";
import { radius } from "@creator-assist/shared/tokens";
import { Stack, useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api } from "@/lib/api";
import { useFlag } from "@/lib/flags";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { ActionBar, Button, Card, Chip, Hr, KV, LoadError, Note, Skeleton, SubScreen, Txt, useToast } from "@/ui";

type Action = { label: string; href: string; primary?: boolean };

/** The one or two next steps that fit where the deal is (same as the web's action bar). */
function barActions(v: DealView, notice: boolean): Action[] {
  const base = `/deals/${v.d.id}`;
  const remindOrNotice = v.noticeReady && notice ? { label: "Send legal notice", href: `${base}/notice` } : { label: "Send reminder", href: `${base}/reminders` };
  switch (v.phase) {
    case "overdue": return [remindOrNotice, { label: "Mark paid", href: `${base}/payment`, primary: true }];
    case "due": return [{ label: "Send reminder", href: `${base}/reminders` }, { label: "Mark paid", href: `${base}/payment`, primary: true }];
    case "sign": return [{ label: "View agreement", href: `${base}/agreement`, primary: true }];
    case "ready": return [{ label: "Create invoice", href: `${base}/invoice`, primary: true }];
    case "draft": return [{ label: "Send agreement", href: `${base}/agreement`, primary: true }];
    default: return [{ label: "View invoice", href: `${base}/invoice`, primary: true }];
  }
}

export default function DealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, refreshing, refresh, reload } = useLoad(() => api.deals.get(id));
  const notice = useFlag("lawyer_notice");
  const router = useRouter();
  const go = (href: string) => router.push(href as Href);
  const title = data?.deal.d.brand.name ?? "Deal";
  const actions = data ? barActions(data.deal, notice) : [];

  return (
    <SubScreen
      refreshing={refreshing} onRefresh={refresh}
      footer={data ? <ActionBar>{actions.map((a) => <Button key={a.href} flex title={a.label} kind={a.primary ? "primary" : "secondary"} onPress={() => go(a.href)} />)}</ActionBar> : undefined}
    >
      <Stack.Screen options={{ title }} />
      {error && <LoadError message={error} onRetry={reload} />}
      {!data ? (!error && <Skeleton hero rows={3} />) : <Detail v={data.deal} today={data.today} notice={notice} actions={actions} go={go} onChanged={reload} />}
    </SubScreen>
  );
}

function Detail({ v, today, notice, actions, go, onChanged }: { v: DealView; today: string; notice: boolean; actions: Action[]; go: (h: string) => void; onChanged: () => Promise<void> }) {
  const { c } = useTheme();
  const { me } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const p = me!.profile!;
  const d = v.d;
  const inv = d.invoice;
  const chip = detailChip(v);
  const amt = dealAmounts(v);
  const advanceIn = d.advance_received_at && d.advance_paise ? d.advance_paise : 0;
  const DOT: Record<string, string> = { "var(--dot-ok)": c.dotOk, "var(--dot-warn)": c.dotWarn, "var(--dot-info)": c.dotInfo, "var(--dot-mute)": c.dotMute };
  // With the lawyer-notice feature off, the timeline doesn't announce a notice.
  const timeline = dealTimeline(v, today).filter((t) => notice || !/^Legal notice( due)? ·/.test(t.text));
  const more = [
    { href: `/deals/${d.id}/invoice`, label: "Invoice" },
    { href: `/deals/${d.id}/reminders`, label: "Reminders" },
    { href: `/deals/${d.id}/escalate`, label: "Escalate" },
    { href: `/deals/${d.id}/payment`, label: v.phase === "paid" ? "Payments" : "Mark paid" },
  ].filter((x) => !actions.some((a) => a.href === x.href));

  async function advanceReceived() {
    setBusy(true);
    try { await api.deals.advanceReceived(d.id); toast(`Advance ${inr(d.advance_paise)} marked received`); await onChanged(); }
    catch (e) { toast(errorText(e)); } finally { setBusy(false); }
  }

  return (<>
    <View style={{ gap: 6 }}>
      <Txt v="small" w="semibold" color={c.muted}>{inv?.number ?? (d.is_sample ? "Sample deal" : "Not invoiced yet")}</Txt>
      <View style={{ alignSelf: "flex-start" }}><Chip tone={chip.tone} label={chip.label} /></View>
      <Txt v="hero" style={{ fontSize: 44 }} adjustsFontSizeToFit numberOfLines={1}>{inr(amt.due)} <Txt v="h2">{amt.label}</Txt></Txt>
      <Txt color={c.muted}>{inr(amt.afterTds)} after TDS{amt.label === "due" && !inv ? " · estimate, not invoiced yet" : ""}</Txt>
    </View>

    <Card>
      {inv ? (<>
        <KV k="Invoice total" v={inr(inv.total_paise)} />
        {inv.advance_deducted_paise > 0 && <KV k={`Advance received${d.advance_received_at ? ` · ${fmtDay(d.advance_received_at)}` : ""}`} v={minus(inv.advance_deducted_paise)} />}
        {v.received > 0 && <KV k="Received so far" v={minus(v.received)} />}
        {v.tdsRecorded > 0 && <KV k="TDS deducted" v={minus(v.tdsRecorded)} />}
        {v.tdsRemaining > 0 && <KV k="TDS (est.)" v={minus(v.tdsRemaining)} />}
        <Hr />
        <KV strong k={v.phase === "paid" ? "Balance" : "Balance to receive"} v={v.phase === "paid" ? "₹0" : inr(v.receive)} />
      </>) : (<>
        <KV k="Fee" v={inr(d.fee_paise)} />
        <KV k="Invoice total (est.)" v={inr(v.total)} />
        {d.advance_paise > 0 && <KV k={advanceIn ? `Advance received · ${fmtDay(d.advance_received_at!)}` : "Advance (not received yet)"} v={minus(d.advance_paise)} />}
        <KV k="TDS (est.)" v={minus(v.tdsExpected)} />
        <Hr />
        <KV strong k="Balance you receive" v={inr(Math.max(0, v.total - d.advance_paise - v.tdsExpected))} />
      </>)}
      {v.interest > 0 && (
        <Note tone="warn">MSME interest so far: {inr(v.interest)} on the {inr(v.remaining)} unpaid, for {v.daysOverdue} day{v.daysOverdue === 1 ? "" : "s"}.</Note>
      )}
    </Card>

    {notice && v.noticeReady && (
      <Card style={{ borderColor: c.primary, borderWidth: 2 }}>
        <Txt v="h2" accessibilityRole="header">Time for the legal notice</Txt>
        <Txt color={c.muted}>{v.remindersSent || "All"} reminder{v.remindersSent === 1 ? "" : "s"} sent and {d.brand.name} still hasn&apos;t paid. Send the legal notice on your lawyer&apos;s letterhead.</Txt>
        <Button title="Send legal notice" onPress={() => go(`/deals/${d.id}/notice`)} />
      </Card>
    )}

    <Card>
      <KV k="Deliverables" v={deliverablesSummary(d.deliverables)} />
      <KV k="Usage rights" v={d.usage?.enabled ? `${usageDurationLabel(d.usage.duration)} · included` : "None"} />
      <KV k="Paid by" v={d.paid_by === "agency" ? d.brand.agency_name ?? "Agency" : "Brand directly"} />
      <KV k="GST" v={d.gst_mode === "incl" ? "Included in fee" : d.gst_mode === "add" && p.gstin ? "Added on top" : "None"} />
      <KV k="TDS" v={Number(d.tds_rate) > 0 ? `${Number(d.tds_rate)}% by brand` : "Not deducted"} />
      {d.go_live_date && <KV k="Go-live" v={fmtDate(d.go_live_date)} />}
      <KV k="Terms" v={`${d.terms_days} days after invoice`} />
    </Card>

    {d.advance_paise > 0 && !d.advance_received_at && (
      <Button title={`Mark ${inr(d.advance_paise)} advance received`} kind="secondary" busy={busy} onPress={advanceReceived} />
    )}
    {(!d.agreement || d.agreement.status === "sent") && !actions.some((a) => a.href.endsWith("/agreement")) && (
      <Button title={d.agreement ? "Agreement · awaiting signature" : "Send agreement for e-sign"} kind="secondary" onPress={() => go(`/deals/${d.id}/agreement`)} />
    )}

    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {more.map((x) => (
        <View key={x.href} style={{ flexGrow: 1, flexBasis: "45%" }}>
          <Button title={x.label} kind={x.label === "Escalate" ? "danger" : "secondary"} onPress={() => go(x.href)} />
        </View>
      ))}
    </View>

    {timeline.length > 0 && (
      <Card>
        <Txt v="h2" accessibilityRole="header">Timeline</Txt>
        {timeline.map((t, i) => (
          <View key={i} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }} accessible>
            <View style={{ width: 10, height: 10, borderRadius: radius.pill, marginTop: 6, backgroundColor: DOT[t.color] ?? c.dotMute }} />
            <Txt style={{ flex: 1 }}>{t.text}</Txt>
          </View>
        ))}
      </Card>
    )}
    {d.agreement?.status === "signed" && <Button title="View signed agreement" kind="secondary" onPress={() => go(`/deals/${d.id}/agreement`)} />}
  </>);
}
