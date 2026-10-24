import "server-only";
import { audit } from "./audit";
import { createAdminClient } from "./supabase/admin";
import type { Agreement } from "./types";

// Public signing-page lookups. Server-only on purpose: these return OTP state
// and must never be exposed as server actions.

export type PublicAgreement = Agreement & {
  user_id: string; otp_hash: string | null; otp_expires_at: string | null; otp_attempts: number;
  deal: { id: string; status: string; brand: { name: string; legal_name: string | null; contact_email: string | null } };
};

export async function byToken(token: string): Promise<PublicAgreement | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { data } = await createAdminClient().from("agreements")
    .select("*, deal:deals(id, status, brand:brands(name, legal_name, contact_email))")
    .eq("sign_token", token).neq("status", "void").maybeSingle();
  return (data as PublicAgreement) ?? null;
}

/** First open of the signing link: stamp viewed_at and audit it. */
export async function markViewed(a: Pick<PublicAgreement, "id" | "user_id" | "viewed_at" | "status">) {
  if (a.viewed_at || a.status !== "sent") return;
  const admin = createAdminClient();
  const { data } = await admin.from("agreements").update({ viewed_at: new Date().toISOString() }).eq("id", a.id).is("viewed_at", null).select("id").maybeSingle();
  if (data) await audit(admin, a.user_id, "agreement_viewed", "agreement", a.id);
}
