import { agreementPdf } from "@/lib/pdf";
import { createClient } from "@/lib/supabase/server";
import type { Agreement } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await createClient();
  const { data: a } = await db.from("agreements").select("*, deal:deals(brand:brands(name, legal_name))").eq("id", id).maybeSingle();
  if (!a) return new Response("Not found", { status: 404 });
  const brand = (a as { deal: { brand: { name: string; legal_name: string | null } } }).deal.brand;
  const pdf = await agreementPdf({ body: (a as Agreement).body, agreement: a as Agreement, brandName: brand.legal_name || brand.name });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Agreement - ${brand.name.replace(/[^\w .-]/g, "")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
