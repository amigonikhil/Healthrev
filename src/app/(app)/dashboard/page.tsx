import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Live counts — proves the schema + RLS wiring end-to-end (zero until ingest).
  const [{ count: caseCount }, { count: staffCount }] = await Promise.all([
    supabase.from("cases").select("*", { count: "exact", head: true }),
    supabase.from("staff").select("*", { count: "exact", head: true }),
  ]);

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.full_name ?? profile.email}`}
        subtitle="Live operations overview. Full MIS lands in Phase 5."
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Cases (all months)" value={caseCount ?? 0} />
        <Kpi label="Active staff / DRAs" value={staffCount ?? 0} />
        <Kpi label="Collections (₹)" value="—" />
        <Kpi label="Resolution %" value="—" />
      </div>

      <div className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-semibold">Build status</h2>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>
            <span className="font-medium text-foreground">Phase 1 — Foundation:</span>{" "}
            schema, RLS, auth, roles, audit log, app shell.{" "}
            <span className="text-green-600">Ready.</span>
          </li>
          <li>Phase 2 — Ingestion + case management (HDFC allocation upload).</li>
          <li>Phase 3 — Payout engine (configurable rules).</li>
          <li>Phase 4 — Billing engine (HDFC rate card + reconcile) + P&amp;L.</li>
          <li>Phase 5 — MIS dashboards + Excel export.</li>
        </ul>
      </div>
    </>
  );
}
