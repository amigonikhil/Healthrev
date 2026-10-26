import "server-only";
import { createAdminClient } from "./supabase/admin";

/** Product events behind the admin metrics (see ADMIN.md §10). Never blocks the user's action. */
export type EventName =
  | "signed_in" | "onboarding_completed" | "sample_loaded" | "sample_cleared"
  | "deal_created" | "agreement_sent" | "agreement_signed" | "invoice_generated" | "invoice_sent"
  | "reminder_sent" | "payment_recorded" | "escalation_opened" | "legal_call_booked"
  | "ais_uploaded" | "filing_option_chosen" | "filing_data_sent" | "ai_call_booked" | "feedback_sent"
  // client-side
  | "page_view" | "signin_opened" | "otp_requested" | "otp_verified" | "whatsapp_clicked";

export const CLIENT_EVENTS: EventName[] = ["page_view", "signin_opened", "otp_requested", "otp_verified", "whatsapp_clicked"];

export async function track(userId: string | null, name: EventName, opts: { sample?: boolean; screen?: string; props?: Record<string, unknown>; anonId?: string } = {}) {
  try {
    await createAdminClient().from("events").insert({
      user_id: userId, event_name: name, is_sample: !!opts.sample, screen: opts.screen ?? null,
      properties: opts.props ?? {}, anon_id: opts.anonId ?? null,
    });
  } catch (e) {
    console.error("event insert failed", name, e);
  }
}
