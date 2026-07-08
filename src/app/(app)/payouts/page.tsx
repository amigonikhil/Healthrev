import { requireAdmin } from "@/lib/auth";
import { PageHeader, PhasePlaceholder } from "@/components/page-header";

export default async function PayoutsPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Payouts"
        subtitle="Configurable payout engine — fixed, commission, bucket-tiered, per-event."
      />
      <PhasePlaceholder
        phase={3}
        note="Build payout rules per staff/role, preview and lock a monthly run, and see every figure's component breakdown. No rates are hardcoded — all live in config tables."
      />
    </>
  );
}
