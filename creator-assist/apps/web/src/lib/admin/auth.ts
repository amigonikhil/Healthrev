import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isOwner } from "../env";
import { createAdminClient } from "../supabase/admin";
import { createClient, type DB } from "../supabase/server";

export type AdminRole = "owner" | "support";
export type AdminCtx = { userId: string; email: string | null; role: AdminRole; db: DB };

/**
 * Gate for every /admin page, route and action. Non-admins get a 404.
 * The service-role client is created here, server-side only; it never reaches the browser.
 * The demo owner (DEMO_OWNER_PHONE / DEMO_OWNER_EMAIL) is added as `owner` on first visit.
 */
export const requireAdmin = cache(async (): Promise<AdminCtx> => {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) notFound();
  const db = createAdminClient() as unknown as DB;
  let { data: row } = await db.from("admins").select("role").eq("user_id", user.id).maybeSingle();
  if (!row && isOwner(user)) {
    await db.from("admins").upsert({ user_id: user.id, role: "owner" }, { onConflict: "user_id" });
    row = { role: "owner" };
  }
  if (!row) notFound();
  return { userId: user.id, email: user.email ?? null, role: row.role as AdminRole, db };
});

export async function requireOwner(): Promise<AdminCtx> {
  const a = await requireAdmin();
  if (a.role !== "owner") notFound();
  return a;
}

/** Every admin action is written here (ADMIN.md §1). */
export async function adminLog(a: AdminCtx, action: string, targetType: string | null, targetId: string | null, meta: Record<string, unknown> = {}) {
  const { error } = await a.db.from("admin_audit_log").insert({ admin_id: a.userId, action, target_type: targetType, target_id: targetId, meta });
  if (error) console.error("admin_audit_log insert failed", action, error.message);
}

export async function adminIds(db: DB): Promise<string[]> {
  const { data } = await db.from("admins").select("user_id");
  return (data ?? []).map((r) => r.user_id);
}
