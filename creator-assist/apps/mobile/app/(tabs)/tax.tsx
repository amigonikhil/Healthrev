import { fmtDay } from "@creator-assist/shared/dates";
import { inr } from "@creator-assist/shared/money";
import { View } from "react-native";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { useSession } from "@/session";
import { useTheme } from "@/theme";
import { Card, Chip, Head, LoadError, Screen, Skeleton, Stat, Txt } from "@/ui";

export default function Tax() {
  const { c } = useTheme();
  const { me } = useSession();
  const { data, error, refreshing, refresh, reload } = useLoad(() => api.tax.hub());
  const hub = data?.hub;

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Head title="Tax hub" sub={hub ? `FY ${hub.fy} · so far` : undefined} />
      {error && <LoadError message={error} onRetry={reload} />}
      {!data || !hub ? (!error && <Skeleton rows={4} />) : (<>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          <Stat label="Income invoiced" value={inr(hub.income)}><Txt v="small" color={c.muted}>{hub.brands} brand{hub.brands === 1 ? "" : "s"}</Txt></Stat>
          <Stat label="GST collected" value={inr(hub.gst)}><Txt v="small" color={c.muted}>{me?.profile?.gstin ? "On your invoices" : "Not GST-registered"}</Txt></Stat>
          <Stat label="TDS by brands" value={inr(hub.tdsExpected)}><Txt v="small" color={c.muted}>Per your invoices</Txt></Stat>
          <Stat label="TDS in AIS" value={inr(hub.tdsInAis)}>
            {hub.missingTotal > 0
              ? <Txt v="small" w="bold" color={c.warnText}>{inr(hub.missingTotal)} missing</Txt>
              : <Txt v="small" color={c.muted}>{hub.tdsExpected ? "All matched" : "Nothing yet"}</Txt>}
          </Stat>
        </View>

        <Txt v="h2" accessibilityRole="header">Needs your action</Txt>
        <Card>
          {data.missing.length === 0
            ? <Txt color={c.muted}>No TDS mismatches. Upload your latest AIS to keep this current.</Txt>
            : data.missing.map((p) => (
              <View key={p.brand.id} accessible style={{ gap: 2 }}>
                <Txt w="bold">{p.brand.name}</Txt>
                <Txt v="small" color={c.muted}>TDS {inr(p.missing)} not in AIS</Txt>
              </View>
            ))}
        </Card>

        <Txt v="h2" accessibilityRole="header">Coming up</Txt>
        {data.cards.map((f) => {
          const days = Math.round((Date.parse(f.due) - Date.parse(data.today)) / 86_400_000);
          const tone = days <= 20 ? "over" : days <= 45 ? "info" : "mute";
          return (
            <Card key={f.type + f.period}>
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt w="bold">{f.title}</Txt>
                  <Txt v="small" color={c.muted}>{f.detail}</Txt>
                </View>
                <Chip tone={tone} label={`Due ${fmtDay(f.due)}`} />
              </View>
            </Card>
          );
        })}
        <Txt v="small" color={c.muted}>Estimates from your invoices. Confirm all due dates and amounts with your CA.</Txt>
      </>)}
    </Screen>
  );
}
