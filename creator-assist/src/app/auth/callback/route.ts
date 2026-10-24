import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Magic-link fallback for email sign-in (the OTP code is the primary path).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (code) {
    const db = await createClient();
    await db.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL("/home", req.url));
}
