import { Top } from "@/components/ui";
import { webCtx } from "@/server/context";
import { noticeView } from "@/server/escalations";
import { orRedirect } from "@/server/forms";
import { NoticePaper } from "./paper";
import { NoticeSend } from "./send";

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, notice: n, waHref, emailTo } = await orRedirect(noticeView(await webCtx(), id), `/deals/${id}/escalate`);
  const d = v.d;
  return (
    <main className="scr">
      <Top title="Legal notice" fallback={`/deals/${id}/escalate`} />
      <NoticePaper n={n} />
      <a className="sub" href={`/api/v1/deals/${id}/notice/pdf`} target="_blank" rel="noopener">Open as PDF</a>
      <NoticeSend dealId={id} waHref={waHref} email={emailTo} sample={d.is_sample} />
    </main>
  );
}
