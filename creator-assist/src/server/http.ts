import "server-only";
import { NextResponse } from "next/server";
import { ApiError, ctxFromRequest, fail, withProfile, type Ctx, type ProfileCtx } from "./context";

// Thin HTTP layer for /api/v1: authenticate, call a service, return JSON. Business
// rules live in the services, so the web app (calling them directly) and the mobile
// apps (calling these routes) behave identically.

type Params = Record<string, string>;
type Next = { params: Promise<Params> };
const NO_STORE = { "Cache-Control": "private, no-store" };

function respond(result: unknown): Response {
  if (result instanceof Response) return result;
  return NextResponse.json(result ?? { ok: true }, { headers: NO_STORE });
}

function failure(e: unknown): Response {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message, ...(e.code ? { code: e.code } : {}) }, { status: e.status, headers: NO_STORE });
  // Unexpected: log the error type and message only (never request bodies, which can hold PAN or bank details).
  console.error("api error", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500, headers: NO_STORE });
}

const unauthorized = () => NextResponse.json({ error: "Sign in again to continue", code: "unauthorized" }, { status: 401, headers: NO_STORE });

/** A route for an onboarded creator (the default). */
export function route(fn: (ctx: ProfileCtx, req: Request, p: Params) => Promise<unknown>) {
  return async (req: Request, next: Next) => {
    try {
      const ctx = await ctxFromRequest(req);
      if (!ctx) return unauthorized();
      return respond(await fn(await withProfile(ctx), req, await next.params));
    } catch (e) { return failure(e); }
  };
}

/** A route for any signed-in user, onboarded or not (session start, onboarding, account deletion). */
export function userRoute(fn: (ctx: Ctx, req: Request, p: Params) => Promise<unknown>) {
  return async (req: Request, next: Next) => {
    try {
      const ctx = await ctxFromRequest(req);
      if (!ctx) return unauthorized();
      return respond(await fn(ctx, req, await next.params));
    } catch (e) { return failure(e); }
  };
}

/** A route that works signed in or not (config, sign-in codes, anonymous feedback and events). */
export function publicRoute(fn: (ctx: Ctx | null, req: Request, p: Params) => Promise<unknown>) {
  return async (req: Request, next: Next) => {
    try {
      return respond(await fn(await ctxFromRequest(req), req, await next.params));
    } catch (e) { return failure(e); }
  };
}

/** The JSON request body, or a 400. */
export async function body<T>(req: Request): Promise<T> {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") fail(400, "Send the request as a JSON object");
  return b as T;
}

/** A PDF download (or inline view). */
export const pdfResponse = ({ pdf, filename }: { pdf: Buffer; filename: string }, disposition: "attachment" | "inline" = "attachment") =>
  new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${disposition}; filename="${filename}"`, ...NO_STORE },
  });
