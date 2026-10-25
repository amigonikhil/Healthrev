import { redirect } from "next/navigation";
import { Top } from "@/components/ui";
import { ADVOCATE, NOTICE_DAYS } from "@/lib/advocate";
import { loadDealView } from "@/lib/data";
import { siteUrl } from "@/lib/env";
import { waLink } from "@/lib/messages";
import { inr } from "@/lib/money";
import { noticeFor, noticeToken } from "@/lib/notice-data";
import { NoticePaper } from "./paper";
import { NoticeSend } from "./send";

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile } = await loadDealView(id);
  if (v.phase !== "overdue") redirect(`/deals/${id}/escalate`);
  const d = v.d;
  const n = noticeFor(v, profile, { fresh: true });
  const link = `${siteUrl()}/api/n/${noticeToken(id)}`;
  const wa = `Dear ${d.brand.contact_name?.split(" ")[0] || "Sir/Madam"}, please find the legal notice issued on behalf of ${profile.name} by ${ADVOCATE.name}, Advocate, ${ADVOCATE.firm}, for the unpaid balance of ${inr(v.remaining)} under invoice ${d.invoice!.number}.\n\nNotice: ${link}\n\nPlease make the payment within ${NOTICE_DAYS} days of receipt.`;
  return (
    <main className="scr">
      <Top title="Legal notice" fallback={`/deals/${id}/escalate`} />
      <NoticePaper n={n} />
      <a className="sub" href={`/api/deals/${id}/notice`} target="_blank" rel="noopener">Open as PDF</a>
      <NoticeSend dealId={id} waHref={d.brand.contact_whatsapp ? waLink(d.brand.contact_whatsapp, wa) : null}
        email={d.is_sample ? profile.email : d.brand.contact_email} sample={d.is_sample} />
    </main>
  );
}
