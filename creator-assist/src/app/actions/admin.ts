"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { audit } from "@/lib/audit";

// Status changes from the admin dashboard. Each table only accepts the values
// its check constraint allows; anything else is rejected here first.
const ALLOWED = {
  escalations: ["draft", "in_review", "sent", "closed"],
  legal_call_bookings: ["requested", "confirmed", "done", "cancelled"],
  ai_call_bookings: ["booked", "done", "cancelled"],
  filings: ["pending", "ready", "filed"],
} as const;
type Table = keyof typeof ALLOWED;

export async function setAdminStatus(table: Table, id: string, status: string): Promise<{ ok: boolean; message: string }> {
  const { user, admin } = await requireAdmin();
  if (!(table in ALLOWED) || !(ALLOWED[table] as readonly string[]).includes(status)) return { ok: false, message: "Not allowed" };
  if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, message: "Bad id" };
  const { data: before } = await admin.from(table).select("status, user_id").eq("id", id).maybeSingle();
  if (!before) return { ok: false, message: "Not found" };
  const { error } = await admin.from(table).update({ status }).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await audit(admin, user.id, "admin_status_changed", table, id, { from: before.status, to: status, owner: before.user_id });
  revalidatePath("/admin");
  return { ok: true, message: `Marked ${status.replace("_", " ")}` };
}
