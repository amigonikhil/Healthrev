import { requireAdmin } from "@/lib/auth";
import { PageHeader, PhasePlaceholder } from "@/components/page-header";

export default async function BillingPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Billing (HDFC)"
        subtitle="Compute the monthly bill from the rate card, then reconcile payments."
      />
      <PhasePlaceholder
        phase={4}
        note="Define a versioned HDFC rate card, compute a draft bill with a line-item breakdown (bucket %s, RB %s, SETT/FC/REPO counts), raise it, and reconcile payments (billed vs received vs outstanding). P&L = bill − payouts − expenses."
      />
    </>
  );
}
