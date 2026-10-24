import { fmtDate, fmtDateLong } from "./dates";
import { deliverablesProse, USAGE_DURATIONS, USAGE_SCOPES } from "./deliverables";
import { inr } from "./money";
import type { AgreementBody, Brand, Deal, DealDeliverable, Profile, UsageRights } from "./types";

/**
 * Renders the single "Paid collab" template from the deal. The result is stored
 * on the agreement row so the brand signs exactly what was sent.
 */
export function buildAgreement(args: {
  profile: Profile; pan: string | null; brand: Brand; deal: Deal;
  deliverables: DealDeliverable[]; usage: UsageRights | null; date: string;
}): AgreementBody {
  const { profile: p, brand: b, deal: d } = args;
  const creatorIds = [args.pan && `PAN ${args.pan}`, p.gstin && `GSTIN ${p.gstin}`].filter(Boolean).join(", ");
  const brandLegal = b.legal_name || b.name;
  const brandIds = b.gstin ? ` (GSTIN ${b.gstin}, “Brand”)` : " (“Brand”)";
  const agency = d.paid_by === "agency" && b.agency_name ? ` The Brand is represented by ${b.agency_name}, which will pay the Creator’s invoices on the Brand’s behalf.` : "";
  const golive = d.go_live_date ? `, live on or around ${fmtDateLong(d.go_live_date)}` : "";
  const gstText = p.gstin ? " plus GST" : "";
  const advance = d.advance_paise > 0
    ? ` An advance of ${inr(d.advance_paise)} is payable on signing. The full invoice is raised on go-live, showing the advance as received, and the balance is payable within ${d.terms_days} days.`
    : ` The invoice is raised on go-live and is payable within ${d.terms_days} days.`;
  const u = args.usage?.enabled ? args.usage : null;
  const dur = USAGE_DURATIONS.find((x) => x.value === u?.duration)?.prose ?? "";
  const scope = USAGE_SCOPES.find((x) => x.value === u?.scope)?.prose ?? "";
  const usageText = u
    ? (u.duration === "perpetual"
        ? `Brand may use the content in perpetuity, ${scope}, at no extra fee.`
        : `Brand may use the content for ${dur}, ${scope}, at no extra fee. Use beyond that needs a new written agreement.`)
    : "Brand may share the content from the Creator’s posts (for example by reposting), but may not edit it or run it as an ad without a new written agreement.";
  const city = p.city || p.state;

  const clauses: [string, string][] = [
    ["Parties", `${p.name}${creatorIds ? ` (${creatorIds}, “Creator”)` : " (“Creator”)"} and ${brandLegal}${brandIds}.${agency}`],
    ["Deliverables", `${deliverablesProse(args.deliverables)} for ${b.name}${golive}.`],
    ["Fee and payment", `${inr(d.fee_paise)}${gstText} for all deliverables${u ? " and usage rights" : ""}.${advance} Any TDS deducted will be deposited on time and Form 16A shared.`],
  ];
  if (p.udyam_no) clauses.push(["Late payment", "Creator is registered under the MSMED Act, 2006. Late payments attract interest as set out in that Act."]);
  clauses.push(
    ["Approvals", "One round of revisions. Feedback within 2 working days, otherwise the draft is treated as approved."],
    ["Usage rights", usageText],
    ["Disclosure", "Content will be marked as a paid partnership in line with ASCI guidelines."],
    ["Cancellation", "If cancelled after filming starts, 50% of the fee is payable."],
    ["Governing law", `Indian law; courts in ${city} have jurisdiction.`],
    ["Acceptance", "Acceptance via a one-time password sent to the Brand’s email is a valid electronic signature."],
  );
  return {
    title: `${p.name} × ${b.name}`,
    subtitle: `Influencer collaboration agreement · ${fmtDate(args.date)}`,
    clauses: clauses.map(([h, t], i) => [`${i + 1}. ${h}`, t]),
  };
}
