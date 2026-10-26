"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/data";

/** Creator dismisses an in-app notice (RLS: only their own). */
export async function dismissNotification(id: string) {
  const { db } = await requireProfile();
  if (!/^[0-9a-f-]{36}$/.test(id)) return;
  await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/", "layout");
}
