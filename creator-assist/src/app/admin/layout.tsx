import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { loadQueues } from "@/lib/admin/data";
import { AdminNav } from "./nav";

export const metadata: Metadata = { title: "Admin · Creator Assist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const a = await requireAdmin(); // 404 for anyone not in `admins`
  const queued = (await loadQueues(a.db, { sample: false, admins: false })).filter((q) => q.status === "new").length;
  return (
    <div className="ad-shell">
      <AdminNav queued={queued} role={a.role} />
      <div className="ad-main">{children}</div>
    </div>
  );
}
