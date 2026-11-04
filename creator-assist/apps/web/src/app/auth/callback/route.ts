import { NextResponse, type NextRequest } from "next/server";
import { sameHost } from "@/lib/redirect";
import { track } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) landing: swap the code for a session, then go home. New
// users are sent on to onboarding by the app layout.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(sameHost(req, "/signin?error=1"));
  const db = await createClient();
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (data.user) await track(data.user.id, "signed_in", { props: { method: data.user.app_metadata?.provider ?? "oauth" } });
  return NextResponse.redirect(sameHost(req, error ? "/signin?error=1" : "/home"));
}
