"use server";

import { redirect } from "next/navigation";
import type { CreateDealInput } from "@creator-assist/shared/api";
import { ALL_DELIVERABLES, deliverableKey } from "@creator-assist/shared/deliverables";
import { parseRupees } from "@creator-assist/shared/money";
import { str } from "@creator-assist/shared/validate";
import { webCtx } from "@/server/context";
import { createDeal as create, markAdvanceReceived as markAdvance } from "@/server/deals";
import { formError } from "@/server/forms";

export type DealFormState = { error?: string } | undefined;

const on = (f: FormData, k: string) => f.get(k) === "on";

/** The New deal form, as the API's CreateDealInput. */
function dealInput(f: FormData): CreateDealInput {
  return {
    brand: str(f.get("brand")), paidBy: f.get("paid_by") === "agency" ? "agency" : "brand", agency: str(f.get("agency")),
    contactName: str(f.get("contact_name")), contactEmail: str(f.get("contact_email")), contactWhatsapp: str(f.get("contact_whatsapp")),
    brandState: str(f.get("brand_state")), brandGstin: str(f.get("brand_gstin")), brandLegal: str(f.get("brand_legal")),
    feePaise: parseRupees(str(f.get("fee"))),
    gstMode: str(f.get("gst_mode")) as CreateDealInput["gstMode"],
    tds: on(f, "tds_on") ? { rate: parseFloat(str(f.get("tds_rate"))) } : null,
    advance: on(f, "advance_on") ? { paise: parseRupees(str(f.get("advance"))), received: on(f, "advance_received") } : null,
    goLive: str(f.get("go_live")) || null,
    termsDays: parseInt(str(f.get("terms")), 10),
    deliverables: ALL_DELIVERABLES.flatMap((d) => {
      const k = deliverableKey(d);
      return on(f, `dl:${k}`) ? [{ platform: d.platform, type: d.type, quantity: parseInt(str(f.get(`q:${k}`)), 10) || d.defaultQty }] : [];
    }),
    usage: on(f, "usage_on") ? { duration: str(f.get("usage_duration")) || "3m", scope: str(f.get("usage_scope")) || "organic_paid" } : null,
  };
}

export async function createDeal(_: DealFormState, f: FormData): Promise<DealFormState> {
  const ctx = await webCtx();
  let id: string;
  try {
    ({ id } = await create(ctx, dealInput(f)));
  } catch (e) {
    return formError(e);
  }
  redirect(f.get("intent") === "agreement" ? `/deals/${id}/agreement` : `/deals/${id}?t=${encodeURIComponent("Deal saved")}`);
}

export async function markAdvanceReceived(dealId: string) {
  await markAdvance(await webCtx(), dealId);
  redirect(`/deals/${dealId}?t=${encodeURIComponent("Advance marked as received")}`);
}
