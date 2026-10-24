import { byToken } from "@/lib/sign";
import { agreementPdf } from "@/lib/pdf";
import type { AgreementBody } from "@/lib/types";

export const runtime = "nodejs";

// The brand's copy of a signed agreement, by signing token.
export async function GET(_: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const a = await byToken(token);
  if (!a || a.status !== "signed") return new Response("Not found", { status: 404 });
  const pdf = await agreementPdf({ body: a.body as AgreementBody, agreement: a, brandName: a.deal.brand.legal_name || a.deal.brand.name });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Agreement - ${a.deal.brand.name.replace(/[^\w .-]/g, "")}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
