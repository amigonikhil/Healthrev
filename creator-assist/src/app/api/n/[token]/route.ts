import { toTax, loadDeal } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { viewDeal } from "@/lib/deal-view";
import { dealFromNoticeToken, noticeFor } from "@/lib/notice-data";
import { noticePdf } from "@/lib/notice-pdf";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DB } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const runtime = "nodejs";

// The brand's copy of a legal notice, linked from the creator's WhatsApp message.
// Only served once the creator has actually sent the notice.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = dealFromNoticeToken((await params).token);
  if (!id) return new Response("Not found", { status: 404 });
  const db = createAdminClient() as unknown as DB;
  const deal = await loadDeal(db, id);
  if (!deal?.invoice || !deal.escalations.some((e) => e.type === "lawyer_notice" && e.status === "sent")) return new Response("Not found", { status: 404 });
  const [{ data: profile }, { data: tax }] = await Promise.all([
    db.from("profiles").select("*").eq("id", deal.user_id).single<Profile>(),
    db.from("tax_config").select("*").eq("user_id", deal.user_id).maybeSingle(),
  ]);
  if (!profile) return new Response("Not found", { status: 404 });
  const pdf = await noticePdf(noticeFor(viewDeal(deal, profile, toTax(tax), todayIST()), profile, toTax(tax)));
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Legal-notice-${deal.invoice.number.replace(/\//g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
