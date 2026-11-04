import { adminLog, requireAdmin } from "@/lib/admin/auth";
import { redact } from "@/lib/admin/privacy";
import { inRange, parseRange } from "@/lib/admin/range";

// Feedback as CSV (admins only, logged). Messages are redacted like the inbox.
export async function GET(req: Request) {
  const a = await requireAdmin();
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const r = parseRange(sp);
  const { data } = await a.db.from("feedback").select("id, user_id, screen, message, status, tags, created_at").order("created_at", { ascending: false }).limit(10000);
  const { data: people } = await a.db.from("profiles").select("id, name");
  const name = new Map((people ?? []).map((p) => [p.id, p.name]));
  const rows = (data ?? []).filter((x) => inRange(x.created_at, r) && (!sp.screen || x.screen === sp.screen) && (!sp.status || x.status === sp.status) && (!sp.tag || (x.tags ?? []).includes(sp.tag)));
  const cell = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [["created_at", "creator", "screen", "status", "tags", "message"].join(","),
    ...rows.map((x) => [x.created_at, x.user_id ? name.get(x.user_id) ?? "Deleted account" : "Not signed in", x.screen, x.status, (x.tags ?? []).join("; "), redact(x.message)].map(cell).join(","))].join("\n");
  await adminLog(a, "export", "feedback", null, { rows: rows.length, ...sp });
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="feedback-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
