import "server-only";
import { createClient as createTokenClient, type User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Profile } from "@creator-assist/shared/types";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";
import { track as trackEvent, type EventName } from "@/lib/events";
import { dbFetch } from "@/lib/supabase/fetch";
import { createClient as createCookieClient, type DB } from "@/lib/supabase/server";

// Who is calling, as which client. Every service takes one of these, so the web app
// (server components and actions, signed in by cookie) and the mobile apps (the
// /api/v1 routes, signed in by a Supabase JWT) run exactly the same code. The DB
// client always acts as the signed-in user: row-level security applies to both.

export type Platform = "web" | "ios" | "android";
export type Ctx = { db: DB; user: User; platform: Platform };
export type ProfileCtx = Ctx & { profile: Profile };

/** An expected failure with a message the creator can act on (shown in a form, or as JSON from the API). */
export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}
export function fail(status: number, message: string, code?: string): never {
  throw new ApiError(status, message, code);
}

const PLATFORMS: Platform[] = ["web", "ios", "android"];
export const parsePlatform = (v: string | null | undefined): Platform => (PLATFORMS.includes(v as Platform) ? (v as Platform) : "web");

/**
 * Context for an API request: `Authorization: Bearer <Supabase access token>` from the
 * mobile apps (platform from the `X-Client-Platform` header), or the web session cookie.
 * Null when the caller isn't signed in.
 */
export async function ctxFromRequest(req: Request): Promise<Ctx | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (token) {
    const db = createTokenClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: dbFetch },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }) as unknown as DB;
    const { data: { user } } = await db.auth.getUser(token);
    return user ? { db, user, platform: parsePlatform(req.headers.get("x-client-platform")) } : null;
  }
  const db = await createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  return user ? { db, user, platform: "web" } : null;
}

export async function loadProfile(ctx: Ctx): Promise<Profile | null> {
  const { data } = await ctx.db.from("profiles").select("*").eq("id", ctx.user.id).maybeSingle<Profile>();
  return data;
}

/** API: the caller must have finished onboarding. */
export async function withProfile(ctx: Ctx): Promise<ProfileCtx> {
  const profile = await loadProfile(ctx);
  if (!profile) fail(409, "Finish setting up your profile first", "onboarding_required");
  return { ...ctx, profile };
}

// ---------------------------------------------------------------- web (cookie) contexts

/** Web: the signed-in user (and profile, if onboarded), or a redirect to sign-in. Cached per request. */
export const webSession = cache(async (): Promise<Ctx & { profile: Profile | null }> => {
  const db = await createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/signin");
  const ctx: Ctx = { db, user, platform: "web" };
  return { ...ctx, profile: await loadProfile(ctx) };
});

/** Web: the signed-in user if there is one (for screens that also work signed out). */
export async function webOptionalCtx(): Promise<Ctx | null> {
  const db = await createCookieClient();
  const { data: { user } } = await db.auth.getUser();
  return user ? { db, user, platform: "web" } : null;
}

/** Web: an onboarded creator, or a redirect to onboarding. */
export async function webCtx(): Promise<ProfileCtx> {
  const s = await webSession();
  if (!s.profile) redirect("/onboarding");
  return s as ProfileCtx;
}

/** Product event tagged with the caller's platform (ADMIN.md §10). */
export const track = (ctx: Pick<Ctx, "user" | "platform">, name: EventName, opts: { sample?: boolean; screen?: string; props?: Record<string, unknown> } = {}) =>
  trackEvent(ctx.user.id, name, { ...opts, platform: ctx.platform });
