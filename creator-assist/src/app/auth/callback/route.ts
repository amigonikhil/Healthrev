import { NextResponse, type NextRequest } from "next/server";
import { sameHost } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";

// OAuth (Google) landing: swap the code for a session, then go home. New
// users are sent on to onboarding by the app layout.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(sameHost(req, "/signin?error=1"));
  const db = await createClient();
  const { error } = await db.auth.exchangeCodeForSession(code);
  return NextResponse.redirect(sameHost(req, error ? "/signin?error=1" : "/home"));
}
