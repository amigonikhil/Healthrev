import { rowHref } from "@creator-assist/shared/deal-view";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Button, Card, Head, LoadError, Row, Screen, Skeleton, Txt } from "@/ui";

export default function Brands() {
  const { c } = useTheme();
  const router = useRouter();
  const { data, error, refreshing, refresh, reload } = useLoad(() => api.brands());

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Head title="Brands" />
      {error && <LoadError message={error} onRetry={reload} />}
      {!data ? (!error && <Skeleton rows={4} />) : (<>
        {data.brands.length === 0 && (
          <Card>
            <Txt color={c.muted}>Brands appear here once you add a deal.</Txt>
            <Button title="Add a deal" onPress={() => router.push("/deals/new")} />
          </Card>
        )}
        {data.brands.map((r) => (
          <Row
            key={r.brand.id} avatar={r.brand.name} title={r.brand.name}
            sub={r.brand.is_sample ? `Sample · ${r.sub}` : r.sub} amount={r.amount} chip={{ label: r.chip, tone: r.tone }}
            onPress={() => router.push(rowHref(r.open) as never)}
          />
        ))}
      </>)}
    </Screen>
  );
}
