import { CLIENT_EVENTS, track, type EventName } from "@/lib/events";
import { parsePlatform } from "@/server/context";
import { publicRoute } from "@/server/http";

/** Screen views and button taps from the apps. Only known event names, small payloads. */
export const POST = publicRoute(async (ctx, req) => {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return new Response(null, { status: 400 });
  const name = String(b.name ?? "") as EventName;
  if (!CLIENT_EVENTS.includes(name)) return new Response(null, { status: 400 });
  const screen = typeof b.screen === "string" ? b.screen.slice(0, 120) : undefined;
  const anonId = typeof b.anon === "string" ? b.anon.slice(0, 64) : undefined;
  const props: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.props ?? {})) if (["session", "method", "kind", "ref"].includes(k) && typeof v === "string") props[k] = v.slice(0, 64);
  await track(ctx?.user.id ?? null, name, { screen, props, anonId, platform: ctx?.platform ?? parsePlatform(req.headers.get("x-client-platform")) });
  return new Response(null, { status: 204 });
});
