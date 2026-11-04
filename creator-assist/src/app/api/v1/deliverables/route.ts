import { DELIVERABLE_GROUPS, USAGE_MAX_MONTHS, USAGE_SCOPES } from "@creator-assist/shared/deliverables";
import { publicRoute } from "@/server/http";

/** The deliverables menu (also available to the apps directly from @creator-assist/shared). */
export const GET = publicRoute(async () => ({ groups: DELIVERABLE_GROUPS, usageScopes: USAGE_SCOPES, usageMaxMonths: USAGE_MAX_MONTHS }));
