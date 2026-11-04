import "server-only";
import { todayIST } from "@creator-assist/shared/dates";
import { isEmptyExtraction, normalizeExtraction, type PastedDeal } from "@creator-assist/shared/pasted-deal";
import { extractDealFields, type ExtractInput } from "@/lib/deal-extract";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, track, type ProfileCtx } from "./context";

const MAX_TEXT = 20_000;
const MAX_IMAGE = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const PER_HOUR = 20;

/**
 * "Paste deal": pasted text and/or a screenshot in, New deal fields out, for the creator
 * to review. The paste is read in memory and sent to Claude; it is never saved or
 * logged. Only a count-only event is recorded (for the hourly limit and admin metrics).
 */
export async function extractDeal(ctx: ProfileCtx, raw: { text?: string | null; image?: { type: string; bytes: ArrayBuffer } | null }): Promise<PastedDeal> {
  const input: ExtractInput = {};
  const text = (raw.text ?? "").trim();
  if (text) {
    if (text.length > MAX_TEXT) fail(400, "That's a lot of text. Paste just the part about this deal.");
    input.text = text;
  }
  if (raw.image && raw.image.bytes.byteLength > 0) {
    const type = IMAGE_TYPES.find((t) => t === raw.image!.type);
    if (!type) fail(400, "Use a JPG, PNG or WebP screenshot.");
    if (raw.image.bytes.byteLength > MAX_IMAGE) fail(400, "That screenshot is too large. Try a smaller one.");
    input.image = { mediaType: type, base64: Buffer.from(raw.image.bytes).toString("base64") };
  }
  if (!input.text && !input.image) fail(400, "Paste a message or add a screenshot.");

  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await createAdminClient().from("events").select("id", { count: "exact", head: true })
    .eq("user_id", ctx.user.id).eq("event_name", "deal_pasted").gte("created_at", since);
  if ((count ?? 0) >= PER_HOUR) fail(429, "You've pasted a lot of deals this hour. Try again later, or fill in the form yourself.", "rate_limited");

  const today = todayIST();
  const res = await extractDealFields(input, today);
  const source = input.image ? (input.text ? "both" : "image") : "text";
  if (!res.ok) {
    if (!res.notConfigured) await track(ctx, "deal_pasted", { props: { source, ok: false } });
    fail(res.notConfigured ? 503 : 502, res.error, res.notConfigured ? "not_configured" : undefined);
  }
  const deal = normalizeExtraction(res.raw, today);
  const empty = isEmptyExtraction(deal);
  await track(ctx, "deal_pasted", { props: { source, ok: !empty, unsure: deal.unsure.length } });
  if (empty) fail(422, "We couldn't find deal details in that. Paste the brand's message about the collab, or fill in the form yourself.");
  return deal;
}
