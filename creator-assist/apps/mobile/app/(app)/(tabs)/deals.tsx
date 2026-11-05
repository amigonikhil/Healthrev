import { brandWithAgency, dealAmounts, listRow } from "@creator-assist/shared/deal-view";
import { useState } from "react";
import { api } from "@/lib/api";
import { useLoad } from "@/lib/use-load";
import { useTheme } from "@/theme";
import { Card, FilterChips, Head, LoadError, Row, Screen, Skeleton, Txt } from "@/ui";

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
  const [f, setF] = useState<F>("all");
  const { data, error, refreshing, refresh, reload } = useLoad(() => api.deals.list());
  const rows = (data?.deals ?? []).map((v) => ({ v, r: listRow(v) }));
  const count = (k: F) => (k === "all" ? rows.length : rows.filter((x) => x.r.key === k).length);
  const shown = f === "all" ? rows : rows.filter((x) => x.r.key === f);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Head title="Deals" />
      {error && <LoadError message={error} onRetry={reload} />}
      {!data ? (!error && <Skeleton rows={4} />) : (<>
        <FilterChips label="Filter deals" value={f} onChange={setF} options={FILTERS.map((x) => ({ value: x.key, label: `${x.label} · ${count(x.key)}` }))} />
        {shown.map(({ v, r }) => (
          <Row
            key={v.d.id} avatar={v.d.brand.name} title={brandWithAgency(v.d)}
            sub={v.d.is_sample ? `Sample · ${r.sub}` : r.sub} amount={dealAmounts(v)} chip={{ label: r.chip, tone: r.tone }}
          />
        ))}
        {shown.length === 0 && (
          <Card><Txt color={c.muted}>{rows.length ? "No deals in this view." : "No deals yet. Your paid collabs will show up here."}</Txt></Card>
        )}
      </>)}
    </Screen>
  );
}
