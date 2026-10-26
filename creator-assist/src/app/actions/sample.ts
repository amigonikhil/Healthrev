"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { decrypt } from "@/lib/crypto";
import { getTax, requireProfile } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { seedDemoData } from "@/lib/seed";

export async function trySampleData() {
  const { db, user, profile } = await requireProfile();
  const tax = await getTax(db);
  const seeded = await seedDemoData(db, { userId: user.id, profile, pan: decrypt(profile.pan_enc), tax, today: todayIST() });
  if (seeded) await audit(db, user.id, "sample_seeded", "profile", user.id);
  redirect("/home?t=" + encodeURIComponent(seeded ? "Sample data loaded" : "Sample data is already loaded"));
}

export async function clearSampleData() {
  const { db, user } = await requireProfile();
  const { error } = await db.rpc("clear_sample");
  if (error) throw new Error("Could not clear sample data: " + error.message);
  await audit(db, user.id, "sample_cleared", "profile", user.id);
  redirect("/settings?t=" + encodeURIComponent("Sample data cleared"));
}

/** Floating sample-data switch: loads or clears the demo set without leaving the app. */
export async function setSampleData(on: boolean): Promise<string> {
  const { db, user, profile } = await requireProfile();
  if (on) {
    const seeded = await seedDemoData(db, { userId: user.id, profile, pan: decrypt(profile.pan_enc), tax: await getTax(db), today: todayIST() });
    if (seeded) await audit(db, user.id, "sample_seeded", "profile", user.id);
    return seeded ? "Sample data loaded" : "Sample data is already loaded";
  }
  const { error } = await db.rpc("clear_sample");
  if (error) return "Could not clear sample data: " + error.message;
  await audit(db, user.id, "sample_cleared", "profile", user.id);
  return "Sample data cleared";
}
