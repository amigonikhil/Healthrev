import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { sameHost } from "@/lib/redirect";
import { track } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";

// Email sign-in link. Uses the token hash from the email, so it works in any
// browser (e.g. Gmail's in-app browser), unlike the PKCE code flow, which only
// works in the browser that asked for the email.
export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = (req.nextUrl.searchParams.get("type") ?? "email") as EmailOtpType;
  if (!tokenHash) return NextResponse.redirect(sameHost(req, "/signin?error=1"));
  const db = await createClient();
  const { data, error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
  if (data.user) await track(data.user.id, "signed_in", { props: { method: "email_link" } });
  return NextResponse.redirect(sameHost(req, error ? "/signin?error=link" : "/home"));
}
