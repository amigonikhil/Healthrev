import type { FeatureFlag } from "@creator-assist/shared/api";
import { useSession } from "@/session";

/** Remote switch from /config. Off until the server says on: an off feature isn't shown at all. */
export function useFlag(f: FeatureFlag): boolean {
  return useSession().config?.flags[f] === true;
}
