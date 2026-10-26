import { NextResponse, type NextRequest } from "next/server";
import { CLIENT_EVENTS, track, type EventName } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

// Screen views and sign-in steps from the browser. Only known event names, small payloads.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return new NextResponse(null, { status: 400 });
  const name = String(body.name ?? "") as EventName;
  if (!CLIENT_EVENTS.includes(name)) return new NextResponse(null, { status: 400 });
  const screen = typeof body.screen === "string" ? body.screen.slice(0, 120) : undefined;
  const anonId = typeof body.anon === "string" ? body.anon.slice(0, 64) : undefined;
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.props ?? {})) if (["session", "method", "kind", "ref"].includes(k) && typeof v === "string") props[k] = v.slice(0, 64);
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  await track(user?.id ?? null, name, { screen, props, anonId });
  return new NextResponse(null, { status: 204 });
}
