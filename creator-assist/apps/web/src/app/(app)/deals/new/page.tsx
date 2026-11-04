import { Top } from "@/components/ui";
import { webCtx } from "@/server/context";
import { newDealOptions } from "@/server/deals";
import { DealForm } from "./form";

export const metadata = { title: "New paid collab · Creator Assist" };

export default async function NewDeal() {
  const { tax, brands, creator, today } = await newDealOptions(await webCtx());
  return (
    <main className="scr">
      <Top title="New paid collab" fallback="/deals" />
      <DealForm
        tax={tax}
        creator={creator}
        brands={brands.map((b) => ({
          name: b.name, contact_name: b.contact_name ?? "", contact_email: b.contact_email ?? "", contact_whatsapp: b.contact_whatsapp ?? "",
          state: b.state ?? "", gstin: b.gstin ?? "", agency_name: b.agency_name ?? "", legal_name: b.legal_name ?? "",
        }))}
        today={today}
      />
    </main>
  );
}
