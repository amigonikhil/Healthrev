import { brandWithAgency, dealAmounts, listRow, rowHref } from "@creator-assist/shared/deal-view";
import { useRouter } from "expo-router";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Button, Card, FilterChips, Head, LoadError, Row, Screen, Skeleton, Txt } from "@/ui";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "over", label: "Overdue" },
  { key: "due", label: "Awaiting pay" },
  { key: "sign", label: "To sign" },
  { key: "paid", label: "Paid" },
] as const;
type F = (typeof FILTERS)[number]["key"];

export default function Deals() {
  const { c } = useTheme();
  const router = useRouter();
  const [f, setF] = useState<F>("all");
  const { data, error, refreshing, refresh, reload } = useLoad(() => api.deals.list());
  const rows = (data?.deals ?? []).map((v) => ({ v, r: listRow(v) }));
  const count = (k: F) => (k === "all" ? rows.length : rows.filter((x) => x.r.key === k).length);
  const shown = f === "all" ? rows : rows.filter((x) => x.r.key === f);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Head title="Deals" action={{ label: "+ New deal", onPress: () => router.push("/deals/new") }} />
      {error && <LoadError message={error} onRetry={reload} />}
      {!data ? (!error && <Skeleton rows={4} />) : (<>
        <FilterChips label="Filter deals" value={f} onChange={setF} options={FILTERS.map((x) => ({ value: x.key, label: `${x.label} · ${count(x.key)}` }))} />
        {shown.map(({ v, r }) => (
          <Row
            key={v.d.id} avatar={v.d.brand.name} title={brandWithAgency(v.d)}
            sub={v.d.is_sample ? `Sample · ${r.sub}` : r.sub} amount={dealAmounts(v)} chip={{ label: r.chip, tone: r.tone }}
            onPress={() => router.push(rowHref(v) as never)}
          />
        ))}
        {shown.length === 0 && (
          <Card>
            <Txt color={c.muted}>{rows.length ? "No deals in this view." : "No deals yet."}</Txt>
            {!rows.length && <Button title="Add your first deal" onPress={() => router.push("/deals/new")} />}
          </Card>
        )}
      </>)}
    </Screen>
  );
}
