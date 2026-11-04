import { route } from "@/server/http";
import { extractDeal } from "@/server/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Paste a deal: multipart form with `text` and/or `image`. Returns fields for the New deal form; nothing is saved. */
export const POST = route(async (ctx, req) => {
  const form = await req.formData().catch(() => null);
  const file = form?.get("image");
  const deal = await extractDeal(ctx, {
    text: form ? String(form.get("text") ?? "") : "",
    image: file instanceof File && file.size > 0 ? { type: file.type, bytes: await file.arrayBuffer() } : null,
  });
  return { deal };
});
