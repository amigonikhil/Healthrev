import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";

type StaffRow = {
  id: string;
  name: string;
  role: string;
  pay_type: string;
  active: boolean;
  joined_at: string | null;
};

export default async function StaffPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff")
    .select("id, name, role, pay_type, active, joined_at")
    .order("name");

  const staff = (data ?? []) as StaffRow[];

  return (
    <>
      <PageHeader
        title="Staff & DRAs"
        subtitle="Recovery executives and internal staff. Payout rules attach here."
      />

      {staff.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted">
          No staff yet. Run <code>supabase/seed.sql</code> for example rows, or add
          staff (create/edit UI lands with Phase 3).
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Pay type</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 capitalize text-muted">
                    {s.role.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 capitalize text-muted">{s.pay_type}</td>
                  <td className="px-4 py-3 text-muted">{s.joined_at ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        s.active
                          ? "bg-green-100 text-green-700"
                          : "bg-border text-muted"
                      }`}
                    >
                      {s.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
