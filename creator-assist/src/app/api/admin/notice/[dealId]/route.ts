import { noticePdfForDeal, requireAdmin } from "@/lib/admin";

export const runtime = "nodejs";

/** Any creator's legal notice, for the admin dashboard (owner only). */
export async function GET(_: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const { admin } = await requireAdmin();
  const r = await noticePdfForDeal(admin, (await params).dealId);
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(r.pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${r.filename}"`, "Cache-Control": "private, no-store" },
  });
}
