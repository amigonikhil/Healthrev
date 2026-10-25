import "server-only";
import { notFound } from "next/navigation";
import { getSession, loadDeal, toTax } from "./data";
import { todayIST } from "./dates";
import { viewDeal } from "./deal-view";
import { isOwner } from "./env";
import { noticeFor } from "./notice-data";
import { noticePdf } from "./notice-pdf";
import { createAdminClient } from "./supabase/admin";
import type { DB } from "./supabase/server";
import type { Profile } from "./types";

/**
 * Gate for the admin dashboard. The service-role client reads every user's
 * rows, so every admin page, route and action must call this first.
 */
export async function requireAdmin() {
  const { user } = await getSession();
  if (!user || !isOwner(user)) notFound();
  return { user, admin: createAdminClient() as unknown as DB };
}

/** Renders a deal's legal notice PDF as of its latest notice, for any user (service role). */
export async function noticePdfForDeal(db: DB, dealId: string): Promise<{ pdf: Buffer; filename: string } | null> {
  const deal = await loadDeal(db, dealId);
  if (!deal?.invoice) return null;
  const [{ data: profile }, { data: tax }] = await Promise.all([
    db.from("profiles").select("*").eq("id", deal.user_id).single<Profile>(),
    db.from("tax_config").select("*").eq("user_id", deal.user_id).maybeSingle(),
  ]);
  if (!profile) return null;
  const t = toTax(tax);
  const pdf = await noticePdf(noticeFor(viewDeal(deal, profile, t, todayIST()), profile, t));
  return { pdf, filename: `Legal-notice-${deal.invoice.number.replace(/\//g, "-")}.pdf` };
}
