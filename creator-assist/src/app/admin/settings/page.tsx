import { requireAdmin } from "@/lib/admin/auth";
import { maskEmail, maskPhone } from "@/lib/admin/privacy";
import { inRange, parseRange, type SP } from "@/lib/admin/range";
import { getSetting, reminderTemplates, type TaxDefaults } from "@/lib/app-settings";
import { fmtDate, fmtTimeIST, istDate } from "@/lib/dates";
import { AddAdmin, AdminRow, RangePicker, TaxDefaultsForm, TemplatesForm } from "../controls";

const BUILT_IN: TaxDefaults = { gst_rate: 18, tds_rate: 10, rbi_bank_rate: 5.5, msme_multiple: 3 };

export default async function AdminSettings({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const a = await requireAdmin();
  const owner = a.role === "owner";
  const r = parseRange(sp);
  const [{ data: admins }, { data: profiles }, taxDefaults, templates, { data: settingsRows }, { data: log }] = await Promise.all([
    a.db.from("admins").select("user_id, role, created_at").order("created_at"),
    a.db.from("profiles").select("id, name, phone, email"),
    getSetting<TaxDefaults>("tax_defaults"),
    reminderTemplates(),
    a.db.from("app_settings").select("key, updated_by, updated_at"),
    a.db.from("admin_audit_log").select("*").order("at", { ascending: false }).limit(500),
  ]);
  const who = new Map((profiles ?? []).map((p) => [p.id, p]));
  const changed = (key: string) => {
    const row = settingsRows?.find((s) => s.key === key);
    return row ? `Last changed by ${who.get(row.updated_by)?.name ?? "an admin"} · ${fmtDate(istDate(row.updated_at))}` : "Not changed yet (built-in values)";
  };
  const entries = (log ?? []).filter((l) => inRange(l.at, r));
  return (
    <main className="ad-page">
      <header className="ad-head"><h1>Settings</h1><RangePicker showToggles={false} /></header>
      <section className="ad-card">
        <h2>Admins {owner ? "" : <small>only owners can change these</small>}</h2>
        <div className="ad-table-wrap"><table className="ad-table">
          <thead><tr><th>Name</th><th>Contact</th><th>Role</th><th>Since</th><th /></tr></thead>
          <tbody>{(admins ?? []).map((ad) => { const p = who.get(ad.user_id); return (
            <tr key={ad.user_id}><td>{p?.name ?? "—"}</td><td>{p?.phone ? maskPhone(p.phone) : maskEmail(p?.email)}</td><td>{ad.role}</td><td>{fmtDate(istDate(ad.created_at))}</td>
              <td>{owner ? <AdminRow userId={ad.user_id} role={ad.role} self={ad.user_id === a.userId} /> : null}</td></tr>); })}</tbody>
        </table></div>
        {owner && <AddAdmin />}
      </section>
      <section className="ad-card">
        <h2>Default rates for new creators</h2>
        <p className="sub">{changed("tax_defaults")}. Existing creators keep their own rates (they can edit them in their Settings).</p>
        <TaxDefaultsForm value={taxDefaults ?? BUILT_IN} canEdit={owner} />
      </section>
      <section className="ad-card">
        <h2>Payment reminder messages</h2>
        <p className="sub">{changed("reminder_templates")}</p>
        <TemplatesForm value={templates} canEdit={owner} />
      </section>
      <section className="ad-card">
        <h2>Admin audit log <small>{entries.length} actions · {r.label.toLowerCase()}</small></h2>
        <div className="ad-table-wrap"><table className="ad-table">
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
          <tbody>
            {entries.slice(0, 300).map((l) => (
              <tr key={l.id}><td>{fmtDate(istDate(l.at))}, {fmtTimeIST(l.at)}</td><td>{who.get(l.admin_id)?.name ?? "—"}</td><td>{l.action.replace(/_/g, " ")}</td>
                <td>{l.target_type}{l.target_type === "creator" ? ` · ${who.get(l.target_id)?.name ?? ""}` : ""}</td><td className="sub">{Object.entries(l.meta ?? {}).filter(([k]) => !["before", "after"].includes(k)).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}</td></tr>
            ))}
            {!entries.length && <tr><td colSpan={5} className="sub">No admin actions in this range.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </main>
  );
}
