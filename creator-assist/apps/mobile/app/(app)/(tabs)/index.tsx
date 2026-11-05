import { fmtWeekday } from "@creator-assist/shared/dates";
import { attentionRow, brandLabel, dealAmounts, rowHref } from "@creator-assist/shared/deal-view";
import { inr } from "@creator-assist/shared/money";
import { popShadow, radius } from "@creator-assist/shared/tokens";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, View } from "react-native";
import { api } from "@/lib/api";
import { errorText, useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Button, Card, Head, LoadError, Note, Row, Screen, Skeleton, Stat, Txt } from "@/ui";

export default function Home() {
  const { c } = useTheme();
  const { me, refresh: refreshMe } = useSession();
  const { data, error, refreshing, refresh, reload } = useLoad(() => api.home());
  const router = useRouter();
  const first = me?.profile?.name.split(/\s+/)[0] ?? "";

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Head eyebrow={data ? fmtWeekday(data.today) : " "} title={first ? `Hi, ${first}` : "Home"} action={{ label: "+ New deal", onPress: () => router.push("/deals/new") }} />
      {error && <LoadError message={error} onRetry={reload} />}
      {!data ? (!error && <Skeleton hero rows={3} />) : data.empty ? (
        <Empty onAdd={() => router.push("/deals/new")} onLoaded={async () => { await Promise.all([reload(), refreshMe()]); }} />
      ) : (<>
        <View
          accessible
          accessibilityLabel={`Money owed to you: ${inr(data.owed.due)} due, ${inr(data.owed.afterTds)} after TDS. ${data.openCount} open invoice${data.openCount === 1 ? "" : "s"}${data.overdue ? `, ${inr(data.overdue)} overdue` : ""}.`}
          style={{ backgroundColor: c.accent, borderRadius: radius.card, padding: 20, gap: 6, overflow: "hidden" }}
        >
          <Txt w="semibold" color={c.onAccent}>Money owed to you</Txt>
          <Txt v="hero" color={c.onAccent} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.6}>
            {inr(data.owed.due)} <Txt v="h2" w="bold" color={c.onAccent}>due</Txt>
          </Txt>
          <Txt w="semibold" color={c.onAccent} style={{ opacity: 0.8 }}>{inr(data.owed.afterTds)} after TDS</Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 }}>
            <Sticker dark label={`${data.openCount} open invoice${data.openCount === 1 ? "" : "s"}`} />
            {data.overdue > 0 && <Sticker label={`${inr(data.overdue)} overdue`} />}
          </View>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Stat label="Due this week" value={inr(data.dueThisWeek)} />
          <Stat label="TDS to be deducted" value={inr(data.tdsPending)} />
        </View>
        <Txt v="h2" accessibilityRole="header">Needs attention</Txt>
        {data.attention.length === 0 && <Txt color={c.muted}>Nothing pending. Nice work!</Txt>}
        {data.attention.map((v) => {
          const r = attentionRow(v);
          return (
            <Row
              key={v.d.id} avatar={v.d.brand.name} title={brandLabel(v.d)}
              sub={v.d.is_sample ? `Sample · ${r.sub}` : r.sub} amount={dealAmounts(v)} chip={{ label: r.chip, tone: r.tone }}
              onPress={() => router.push(rowHref(v) as never)}
            />
          );
        })}
      </>)}
    </Screen>
  );
}

/** "3 open invoices" (dark, tilted) and "₹X overdue" (coral pop sticker with the hard shadow). */
function Sticker({ label, dark }: { label: string; dark?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={[
      { minHeight: 32, paddingHorizontal: 14, borderRadius: radius.pill, justifyContent: "center" },
      dark
        ? { backgroundColor: "#111111", transform: [{ rotate: "-2deg" }] }
        : {
          backgroundColor: c.stOver, borderWidth: 2, borderColor: "#111111", transform: [{ rotate: "2.5deg" }],
          shadowColor: popShadow.color, shadowOffset: popShadow.offset, shadowOpacity: popShadow.opacity, shadowRadius: popShadow.radius,
          ...(Platform.OS === "android" ? { boxShadow: "2px 3px 0px #111111" } : null),
        },
    ]}>
      <Txt v="chip" w="bold" color={dark ? c.accent : "#111111"}>{label}</Txt>
    </View>
  );
}

function Empty({ onLoaded, onAdd }: { onLoaded: () => Promise<void>; onAdd: () => void }) {
  const { c } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function trySample() {
    setBusy(true); setErr("");
    try {
      await api.sample.load();
      if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await onLoaded();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Txt v="h2" accessibilityRole="header">No deals yet</Txt>
      <Txt color={c.muted}>Add a paid collab to send an agreement, raise a GST invoice and get reminders going.</Txt>
      <Button title="Add your first deal" onPress={onAdd} />
      <Button title="Try with sample data" kind="secondary" busy={busy} onPress={trySample} accessibilityHint="Loads example deals marked Sample. You can clear them in Settings." />
      {err ? <Note tone="warn">{err}</Note> : null}
      <Txt v="small" color={c.muted}>Sample deals are marked &quot;Sample&quot; and can be cleared any time in Settings.</Txt>
    </Card>
  );
}
