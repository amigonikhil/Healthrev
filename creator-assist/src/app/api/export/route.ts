import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const TABLES = ["brands", "deals", "deal_deliverables", "usage_rights", "agreements", "invoices", "payments", "reminders", "escalations", "ais_entries", "filings", "ai_call_bookings", "legal_call_bookings", "tax_config", "audit_log"] as const;

// "Export my data": everything the user owns, as one JSON file. RLS scopes every query.
export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { data: profile } = await db.from("profiles").select("*").eq("id", user.id).single();
  const out: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    note: "Money values are in paise (₹1 = 100 paise).",
    profile: profile && {
      ...profile, pan: decrypt(profile.pan_enc), bank_account: decrypt(profile.bank_account_enc), pan_enc: undefined, bank_account_enc: undefined,
    },
  };
  for (const t of TABLES) {
    const { data } = await db.from(t).select("*");
    out[t] = (data ?? []).map((r: Record<string, unknown>) => (t === "agreements" ? { ...r, otp_hash: undefined } : r));
  }
  await audit(db, user.id, "data_exported", "profile", user.id);
  return new Response(JSON.stringify(out, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="creator-assist-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
