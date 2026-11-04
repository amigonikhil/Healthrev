"use server";

import { redirect } from "next/navigation";
import { webCtx } from "@/server/context";
import { clearSampleData as clear, loadSampleData } from "@/server/settings";

export async function trySampleData() {
  const message = await loadSampleData(await webCtx());
  redirect("/home?t=" + encodeURIComponent(message));
}

export async function clearSampleData() {
  const message = await clear(await webCtx());
  redirect("/settings?t=" + encodeURIComponent(message));
}
