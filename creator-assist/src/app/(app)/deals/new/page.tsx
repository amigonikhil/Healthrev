import { Top } from "@/components/ui";
import { getTax, loadBrands, requireProfile } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { DealForm } from "./form";

export const metadata = { title: "New paid collab · Creator Assist" };

export default async function NewDeal() {
  const { db, profile } = await requireProfile();
  const [tax, brands] = await Promise.all([getTax(db), loadBrands(db)]);
  return (
    <main className="scr">
      <Top title="New paid collab" fallback="/deals" />
      <DealForm
        tax={tax}
        creator={{ stateCode: profile.state_code, registered: !!profile.gstin, terms: profile.default_terms_days, msme: !!profile.udyam_no }}
        brands={brands.map((b) => ({
          name: b.name, contact_name: b.contact_name ?? "", contact_email: b.contact_email ?? "", contact_whatsapp: b.contact_whatsapp ?? "",
          state: b.state ?? "", gstin: b.gstin ?? "", agency_name: b.agency_name ?? "", legal_name: b.legal_name ?? "",
        }))}
        today={todayIST()}
      />
    </main>
  );
}
