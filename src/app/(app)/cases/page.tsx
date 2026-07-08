import { requireProfile } from "@/lib/auth";
import { PageHeader, PhasePlaceholder } from "@/components/page-header";

export default async function CasesPage() {
  await requireProfile();
  return (
    <>
      <PageHeader
        title="Cases"
        subtitle="Master case ledger from HDFC allocation files."
      />
      <PhasePlaceholder
        phase={2}
        note="Upload the monthly HDFC allocation .xlsx, preview & commit the DATA sheet, then filter and live-edit cases (status, receipts, PTP/RTP, repo/settlement/foreclosure)."
      />
    </>
  );
}
