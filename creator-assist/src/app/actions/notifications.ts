"use server";

import { revalidatePath } from "next/cache";
import { webCtx } from "@/server/context";
import { dismissNotification as dismiss } from "@/server/misc";

/** Creator dismisses an in-app notice (RLS: only their own). */
export async function dismissNotification(id: string) {
  await dismiss(await webCtx(), id);
  revalidatePath("/", "layout");
}
