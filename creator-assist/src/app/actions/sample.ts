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
