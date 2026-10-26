"use server";

import { revalidatePath } from "next/cache";
import type { ReminderTemplates, TaxDefaults } from "@/lib/app-settings";
import { adminLog, requireAdmin, requireOwner } from "@/lib/admin/auth";
import { QUEUE_STATUSES, type QueueKind, type QueueStatus } from "@/lib/admin/data";
import { waLink } from "@/lib/messages";

type Res = { ok: boolean; message: string };

// Admins can only change queue status/notes and feedback triage. They never edit deals, invoices or payments.
const SOURCE: Record<QueueKind, { table: string; label: string; link: string }> = {
  lawyer_notice: { table: "escalations", label: "legal notice", link: "/deals" },
  ai_call: { table: "ai_call_bookings", label: "AI call booking", link: "/tax" },
  filing: { table: "filings", label: "filing request", link: "/tax" },
  ais_upload: { table: "ais_uploads", label: "AIS upload", link: "/tax" },
  legal_call: { table: "legal_call_bookings", label: "legal team call", link: "/deals" },
};
const NOTICE: Record<QueueStatus, (l: string) => string> = {
  new: (l) => `Your ${l} is back in the queue`,
  in_review: (l) => `Our team is reviewing your ${l}`,
  done: (l) => `Your ${l} has been handled`,
  rejected: (l) => `We couldn't take your ${l} forward. Reply to our email or use Feedback if you have questions.`,
};
const UUID = /^[0-9a-f-]{36}$/;

export async function setQueueStatus(kind: QueueKind, id: string, status: QueueStatus, note: string): Promise<Res> {
  const a = await requireAdmin();
  const src = SOURCE[kind];
  if (!src || !UUID.test(id) || !QUEUE_STATUSES.includes(status)) return { ok: false, message: "Not allowed" };
  const { data: row } = await a.db.from(src.table).select("user_id").eq("id", id).maybeSingle();
  if (!row) return { ok: false, message: "Not found" };
  const { data: before } = await a.db.from("queue_state").select("status, note").eq("kind", kind).eq("source_id", id).maybeSingle();
  const prev = (before?.status ?? "new") as QueueStatus;
  const cleanNote = note.trim().slice(0, 2000) || null;
  const { error } = await a.db.from("queue_state").upsert(
    { kind, source_id: id, user_id: row.user_id, status, note: cleanNote, updated_by: a.userId, updated_at: new Date().toISOString() },
    { onConflict: "kind,source_id" },
  );
  if (error) return { ok: false, message: error.message };
  if (prev !== status) {
    // The creator sees this as an in-app notice. Internal notes are never sent to them.
    await a.db.from("notifications").insert({ user_id: row.user_id, title: NOTICE[status](src.label), link: src.link });
  }
  await adminLog(a, "change_status", kind, id, { from: prev, to: status, note_changed: (before?.note ?? null) !== cleanNote });
  revalidatePath("/admin", "layout");
  return { ok: true, message: prev !== status ? `Marked ${status.replace("_", " ")} · creator notified` : "Note saved" };
}

const FB_STATUS = ["new", "seen", "planned", "done", "wont_do"];
const FB_TAGS = ["bug", "confusing", "feature request", "design", "praise"];
export async function setFeedback(id: string, patch: { status?: string; tags?: string[] }): Promise<Res> {
  const a = await requireAdmin();
  if (!UUID.test(id)) return { ok: false, message: "Bad id" };
  const upd: { status?: string; tags?: string[] } = {};
  if (patch.status !== undefined) { if (!FB_STATUS.includes(patch.status)) return { ok: false, message: "Bad status" }; upd.status = patch.status; }
  if (patch.tags !== undefined) { if (patch.tags.some((t) => !FB_TAGS.includes(t))) return { ok: false, message: "Bad tag" }; upd.tags = [...new Set(patch.tags)]; }
  const { error } = await a.db.from("feedback").update(upd).eq("id", id);
  if (error) return { ok: false, message: error.message };
  await adminLog(a, "triage_feedback", "feedback", id, upd);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Saved" };
}

/** Owner only: unmask a creator's phone (logged). */
export async function revealPhone(userId: string): Promise<Res> {
  const a = await requireOwner();
  const { data } = await a.db.from("profiles").select("phone").eq("id", userId).maybeSingle();
  await adminLog(a, "reveal_phone", "creator", userId);
  return data?.phone ? { ok: true, message: data.phone } : { ok: false, message: "No phone on file" };
}

/** Copy email (any admin) or open a WhatsApp check-in (owner only, since it exposes the number). Logged. */
export async function creatorContact(userId: string, what: "email" | "whatsapp"): Promise<Res> {
  const a = what === "whatsapp" ? await requireOwner() : await requireAdmin();
  const { data } = await a.db.from("profiles").select("name, email, phone").eq("id", userId).maybeSingle();
  await adminLog(a, what === "email" ? "copy_email" : "whatsapp_creator", "creator", userId);
  if (what === "email") return data?.email ? { ok: true, message: data.email } : { ok: false, message: "No email on file" };
  if (!data?.phone) return { ok: false, message: "No phone on file" };
  const first = (data.name ?? "").split(" ")[0] || "there";
  return { ok: true, message: waLink(data.phone, `Hi ${first}, this is the Creator Assist team. How's the app working for you so far? Anything confusing or missing? We'd love to hear.`) };
}

// ---------------------------------------------------------------- settings (owner only)
export async function addAdmin(identifier: string, role: string): Promise<Res> {
  const a = await requireOwner();
  if (!["owner", "support"].includes(role)) return { ok: false, message: "Pick a role" };
  const id = identifier.trim().toLowerCase();
  const digits = id.replace(/\D/g, "").slice(-10);
  if (!id.includes("@") && digits.length < 10) return { ok: false, message: "Enter a 10-digit phone number or an email" };
  // Any signed-in account counts (they don't need to have finished onboarding).
  const auth = (a.db as unknown as { auth: { admin: { listUsers: (o: { page: number; perPage: number }) => Promise<{ data: { users: { id: string; email?: string; phone?: string }[] } }> } } }).auth.admin;
  let found: { id: string; email?: string } | undefined;
  for (let page = 1; page < 50 && !found; page++) {
    const { data } = await auth.listUsers({ page, perPage: 1000 });
    found = data.users.find((u) => (id.includes("@") ? u.email?.toLowerCase() === id : (u.phone ?? "").endsWith(digits)));
    if (data.users.length < 1000) break;
  }
  if (!found && !id.includes("@")) {
    const { data: prof } = await a.db.from("profiles").select("id").like("phone", `%${digits}`).limit(1).maybeSingle();
    if (prof) found = { id: prof.id };
  }
  if (!found) return { ok: false, message: "No account with that phone or email. They need to sign in once first." };
  const { data: prof } = await a.db.from("profiles").select("name").eq("id", found.id).maybeSingle();
  const p = { id: found.id, name: prof?.name ?? found.email ?? "They" };
  const { error } = await a.db.from("admins").upsert({ user_id: p.id, role, created_by: a.userId }, { onConflict: "user_id" });
  if (error) return { ok: false, message: error.message };
  await adminLog(a, "add_admin", "admin", p.id, { role });
  revalidatePath("/admin/settings");
  return { ok: true, message: `${p.name} is now ${role}` };
}

export async function updateAdmin(userId: string, role: string | null): Promise<Res> {
  const a = await requireOwner();
  if (userId === a.userId) return { ok: false, message: "You can't change your own access" };
  if (role && !["owner", "support"].includes(role)) return { ok: false, message: "Bad role" };
  const { error } = role
    ? await a.db.from("admins").update({ role }).eq("user_id", userId)
    : await a.db.from("admins").delete().eq("user_id", userId);
  if (error) return { ok: false, message: error.message };
  await adminLog(a, role ? "change_admin_role" : "remove_admin", "admin", userId, { role });
  revalidatePath("/admin/settings");
  return { ok: true, message: role ? `Role set to ${role}` : "Admin removed" };
}

export async function saveTaxDefaults(v: TaxDefaults): Promise<Res> {
  const a = await requireOwner();
  const bad = Object.entries(v).find(([k, n]) => !Number.isFinite(n) || n < 0 || n > (k === "msme_multiple" ? 10 : 100));
  if (bad) return { ok: false, message: `Check ${bad[0].replace(/_/g, " ")}` };
  const { data: before } = await a.db.from("app_settings").select("value").eq("key", "tax_defaults").maybeSingle();
  const { error } = await a.db.from("app_settings").upsert({ key: "tax_defaults", value: v, updated_by: a.userId, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: error.message };
  await adminLog(a, "edit_tax_defaults", "app_settings", "tax_defaults", { before: before?.value ?? null, after: v });
  revalidatePath("/admin/settings");
  return { ok: true, message: "Saved. New creators start with these rates." };
}

export async function saveTemplates(t: ReminderTemplates): Promise<Res> {
  const a = await requireOwner();
  for (const lang of ["en", "te", "hi"] as const) for (const k of ["upcoming", "overdue"] as const) {
    const s = t[lang]?.[k];
    if (typeof s !== "string" || !s.trim() || s.length > 1000) return { ok: false, message: `Fill the ${lang} ${k} message (up to 1000 characters)` };
  }
  const { error } = await a.db.from("app_settings").upsert({ key: "reminder_templates", value: t, updated_by: a.userId, updated_at: new Date().toISOString() });
  if (error) return { ok: false, message: error.message };
  await adminLog(a, "edit_reminder_templates", "app_settings", "reminder_templates");
  revalidatePath("/admin/settings");
  return { ok: true, message: "Templates saved. Reminders use them from now on." };
}
