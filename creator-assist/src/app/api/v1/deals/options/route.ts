import { DELIVERABLE_GROUPS, USAGE_MAX_MONTHS, USAGE_SCOPES } from "@creator-assist/shared/deliverables";
import { route } from "@/server/http";
import { newDealOptions } from "@/server/deals";

/** What the New deal form needs: rates, defaults, saved brands and the deliverables menu. */
export const GET = route(async (ctx) => ({ ...(await newDealOptions(ctx)), deliverables: DELIVERABLE_GROUPS, usageScopes: USAGE_SCOPES, usageMaxMonths: USAGE_MAX_MONTHS }));
