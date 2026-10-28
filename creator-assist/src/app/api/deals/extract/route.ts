import { NextResponse, type NextRequest } from "next/server";
import { todayIST } from "@/lib/dates";
import { extractDealFields, type ExtractInput } from "@/lib/deal-extract";
import { track } from "@/lib/events";
import { isEmptyExtraction, normalizeExtraction } from "@/lib/pasted-deal";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXT = 20_000;
const MAX_IMAGE = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const PER_HOUR = 20;

// "Paste deal": pasted text and/or a screenshot in, New deal fields out. The paste is
// read in memory and sent to Claude; it is never saved or logged. Only a count-only
// event is recorded (for the hourly limit and the admin metrics).
export async function POST(req: NextRequest) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Sign in again to paste a deal." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, error: "Paste a message or add a screenshot." }, { status: 400 });
  const text = String(form.get("text") ?? "").trim();
  const file = form.get("image");
  const input: ExtractInput = {};
  if (text) {
    if (text.length > MAX_TEXT) return NextResponse.json({ ok: false, error: "That's a lot of text. Paste just the part about this deal." }, { status: 400 });
    input.text = text;
  }
  if (file instanceof File && file.size > 0) {
    const type = IMAGE_TYPES.find((t) => t === file.type);
    if (!type) return NextResponse.json({ ok: false, error: "Use a JPG, PNG or WebP screenshot." }, { status: 400 });
    if (file.size > MAX_IMAGE) return NextResponse.json({ ok: false, error: "That screenshot is too large. Try a smaller one." }, { status: 400 });
    input.image = { mediaType: type, base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
  }
  if (!input.text && !input.image) return NextResponse.json({ ok: false, error: "Paste a message or add a screenshot." }, { status: 400 });

  const since = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await createAdminClient().from("events").select("id", { count: "exact", head: true })
    .eq("user_id", user.id).eq("event_name", "deal_pasted").gte("created_at", since);
  if ((count ?? 0) >= PER_HOUR) return NextResponse.json({ ok: false, error: "You've pasted a lot of deals this hour. Try again later, or fill in the form yourself." }, { status: 429 });

  const today = todayIST();
  const res = await extractDealFields(input, today);
  const source = input.image ? (input.text ? "both" : "image") : "text";
  if (!res.ok) {
    if (!res.notConfigured) await track(user.id, "deal_pasted", { props: { source, ok: false } });
    return NextResponse.json({ ok: false, error: res.error }, { status: res.notConfigured ? 503 : 502 });
  }
  const deal = normalizeExtraction(res.raw, today);
  const empty = isEmptyExtraction(deal);
  await track(user.id, "deal_pasted", { props: { source, ok: !empty, unsure: deal.unsure.length } });
  if (empty) return NextResponse.json({ ok: false, error: "We couldn't find deal details in that. Paste the brand's message about the collab, or fill in the form yourself." }, { status: 422 });
  return NextResponse.json({ ok: true, deal }, { headers: { "Cache-Control": "no-store" } });
}
