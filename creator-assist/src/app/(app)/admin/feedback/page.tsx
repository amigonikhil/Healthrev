import { notFound } from "next/navigation";
import { Top } from "@/components/ui";
import { requireProfile } from "@/lib/data";
import { isOwnerPhone } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Feedback · Creator Assist" };

export default async function FeedbackAdmin() {
  const { user } = await requireProfile();
  // Only the demo owner (by their verified auth phone) can see tester feedback.
  if (!isOwnerPhone(user.phone)) notFound();
  const admin = createAdminClient();
  const { data: rows } = await admin.from("feedback").select("*").order("created_at", { ascending: false }).limit(500);
  const ids = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))];
  const { data: people } = ids.length ? await admin.from("profiles").select("id, name, phone, email").in("id", ids) : { data: [] };
  const who = new Map((people ?? []).map((p) => [p.id, p]));

  return (
    <main className="scr">
      <Top title="Tester feedback" sub={`${rows?.length ?? 0} notes`} fallback="/settings" />
      {(rows ?? []).map((r) => {
        const p = r.user_id ? who.get(r.user_id) : null;
        return (
          <div className="card" key={r.id}>
            <p className="sub">
              {new Date(r.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} · {r.screen}
            </p>
            <p style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.5 }}>{r.message}</p>
            <p className="sub">{p ? `${p.name}${p.phone ? ` · ${p.phone}` : ""}${p.email ? ` · ${p.email}` : ""}` : r.user_id ? "Deleted account" : "Not signed in"}</p>
          </div>
        );
      })}
      {!rows?.length && <p className="sub">No feedback yet.</p>}
    </main>
  );
}
