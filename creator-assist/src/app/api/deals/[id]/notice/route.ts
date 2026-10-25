import { loadDealView } from "@/lib/data";
import { noticeFor } from "@/lib/notice-data";
import { noticePdf } from "@/lib/notice-pdf";

export const runtime = "nodejs";

/** Lawyer notice PDF on the advocate's letterhead (draft until the advocate issues it). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { v, profile } = await loadDealView(id);
  if (!v.d.invoice || v.remaining <= 0) return new Response("No unpaid invoice on this deal", { status: 404 });
  const pdf = await noticePdf(noticeFor(v, profile));
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Legal-notice-${v.d.invoice.number.replace(/\//g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
