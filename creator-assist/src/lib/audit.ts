import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "agreement_sent" | "agreement_viewed" | "agreement_signed" | "invoice_generated" | "invoice_sent"
  | "reminder_sent" | "payment_recorded" | "advance_recorded" | "escalation_created" | "legal_notice_sent" | "sample_seeded"
  | "sample_cleared" | "data_exported" | "settings_updated" | "ais_uploaded" | "filing_data_sent" | "ai_call_booked";

export async function audit(
  db: SupabaseClient,
  userId: string,
  action: AuditAction,
  entity?: string,
  entityId?: string | null,
  meta: Record<string, unknown> = {},
) {
  const { error } = await db.from("audit_log").insert({ user_id: userId, action, entity, entity_id: entityId ?? null, meta });
  if (error) console.error("audit_log insert failed", action, error.message);
}
