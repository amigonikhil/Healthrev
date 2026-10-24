import { loadDeal } from "@/lib/data";
import { renderInvoicePdf } from "@/lib/invoice-data";
import { createClient } from "@/lib/supabase/server";
import type { Invoice, Profile } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const [{ data: inv }, { data: profile }] = await Promise.all([
    db.from("invoices").select("*").eq("id", id).maybeSingle<Invoice>(),
    db.from("profiles").select("*").eq("id", user.id).single<Profile>(),
  ]);
  if (!inv || !profile) return new Response("Not found", { status: 404 });
  const deal = await loadDeal(db, inv.deal_id);
  if (!deal) return new Response("Not found", { status: 404 });
  const pdf = await renderInvoicePdf(inv, profile, deal);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${inv.number.replace(/\//g, "-")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
