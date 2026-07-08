import { requireAdmin } from "@/lib/auth";
import { PageHeader, PhasePlaceholder } from "@/components/page-header";

export default async function SettingsPage() {
  await requireAdmin();
  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Money config — payout rules and the HDFC rate card (versioned)."
      />
      <PhasePlaceholder
        phase={3}
        note="Admin-only configuration surfaces: payout rule builder (Phase 3) and HDFC rate-card editor (Phase 4). Every money figure stays admin-configurable and versioned by effective date."
      />
    </>
  );
}
