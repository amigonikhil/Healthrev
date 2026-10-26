import { noticePdfForDeal } from "@/lib/notice-render";
import { loadDeal } from "@/lib/data";
import { dealFromNoticeToken } from "@/lib/notice-data";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DB } from "@/lib/supabase/server";

export const runtime = "nodejs";

// The brand's copy of a legal notice, linked from the creator's WhatsApp message.
// Only served once the creator has actually sent the notice.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = dealFromNoticeToken((await params).token);
  if (!id) return new Response("Not found", { status: 404 });
  const db = createAdminClient() as unknown as DB;
  const deal = await loadDeal(db, id);
  if (!deal?.escalations.some((e) => e.type === "lawyer_notice" && e.status === "sent")) return new Response("Not found", { status: 404 });
  const r = await noticePdfForDeal(db, id);
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(r.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.filename}"`, "Cache-Control": "private, no-store" },
  });
}
