"use server";

import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { encrypt, last4, maskPan } from "@/lib/crypto";
import { getTax } from "@/lib/data";
import { todayIST } from "@/lib/dates";
import { demoOwner, isOwner, normPhone } from "@/lib/env";
import { defaultPrefix } from "@/lib/invoice";
import { seedDemoData } from "@/lib/seed";
import { stateByName } from "@/lib/states";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { ACCT_RE, bankFromIfsc, EMAIL_RE, GSTIN_RE, IFSC_RE, PAN_RE, str, UDYAM_RE, up, UPI_RE } from "@/lib/validate";

export type FormState = { error?: string } | undefined;

type ProfileFields = Partial<Omit<Profile, "id">>;

/** Validates the profile form. With `editing`, blank PAN/bank keep the stored values. */
function readProfileForm(f: FormData, editing: boolean): { fields: ProfileFields; error?: string } {
  const name = str(f.get("name"));
  const state = stateByName(str(f.get("state")));
  const pan = up(f.get("pan"));
  const gstin = up(f.get("gstin"));
  const udyam = up(f.get("udyam"));
  const acct = str(f.get("bank_account")).replace(/\s/g, "");
  const ifsc = up(f.get("ifsc"));
  const upi = str(f.get("upi"));
  const email = str(f.get("email"));

  if (!name) return { fields: {}, error: "Enter your full name as on PAN" };
  if (!state) return { fields: {}, error: "Choose your state" };
  if (!(editing && !pan) && !PAN_RE.test(pan)) return { fields: {}, error: "PAN should look like ABCDE1234F" };
  if (gstin && !GSTIN_RE.test(gstin)) return { fields: {}, error: "GSTIN doesn't look right (15 characters, e.g. 36ABCDE1234F1Z5)" };
  if (gstin && gstin.slice(0, 2) !== state.code) return { fields: {}, error: `GSTIN starts with ${gstin.slice(0, 2)}, but ${state.name} is ${state.code}` };
  if (udyam && !UDYAM_RE.test(udyam)) return { fields: {}, error: "Udyam number should look like UDYAM-TS-02-0012345" };
  if (!(editing && !acct) && !ACCT_RE.test(acct)) return { fields: {}, error: "Bank account number should be 9–18 digits" };
  if (!IFSC_RE.test(ifsc)) return { fields: {}, error: "IFSC should look like HDFC0001234" };
  if (upi && !UPI_RE.test(upi)) return { fields: {}, error: "UPI ID should look like name@bank" };
  if (email && !EMAIL_RE.test(email)) return { fields: {}, error: "Email doesn't look right" };

  const fields: ProfileFields = {
    name, state: state.name, state_code: state.code, gstin: gstin || null, udyam_no: udyam || null,
    ifsc, bank_name: bankFromIfsc(ifsc), upi: upi || null,
    handle: str(f.get("handle")).replace(/^@?/, "@").replace(/^@$/, "") || null,
    email: email || null, city: str(f.get("city")) || null, address: str(f.get("address")) || null,
  };
  if (pan) Object.assign(fields, { pan_enc: encrypt(pan), pan_masked: maskPan(pan) });
  if (acct) Object.assign(fields, { bank_account_enc: encrypt(acct), bank_account_last4: last4(acct) });
  return { fields };
}

export async function createProfile(_: FormState, f: FormData): Promise<FormState> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/signin");
  if (f.get("consent") !== "on") return { error: "Please tick the consent box to continue" };

  const { fields, error } = readProfileForm(f, false);
  if (error) return { error };
  const phone = user.phone ? "+" + normPhone(user.phone) : str(f.get("phone")) || null;

  const { error: e1 } = await db.from("profiles").insert({
    id: user.id, ...fields, phone, email: fields.email ?? user.email ?? null,
    invoice_prefix: defaultPrefix(fields.name!), consent_at: new Date().toISOString(),
  });
  if (e1 && e1.code !== "23505") return { error: "Could not save your details: " + e1.message };
  await db.from("tax_config").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

  // The owner always gets the demo set, even if they onboard by hand.
  if (isOwner(user)) await seedFor(db, user.id, f.get("pan") ? up(f.get("pan")) : null);
  redirect("/home");
}

async function seedFor(db: Awaited<ReturnType<typeof createClient>>, userId: string, pan: string | null) {
  const { data: profile } = await db.from("profiles").select("*").eq("id", userId).single<Profile>();
  if (!profile) return;
  const tax = await getTax(db);
  const seeded = await seedDemoData(db, { userId, profile, pan, tax, today: todayIST() });
  if (seeded) await audit(db, userId, "sample_seeded", "profile", userId);
}

/**
 * First sign-in for DEMO_OWNER_PHONE: create the profile from env vars with
 * sample PAN/GSTIN/Udyam/bank values (never the owner's real ones) and seed
 * the demo dataset. Called from the onboarding page; returns false for
 * everyone else.
 */
export async function provisionOwnerIfNeeded(): Promise<boolean> {
  const owner = demoOwner();
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!owner || !user || !isOwner(user)) return false;

  const state = stateByName(owner.state) ?? stateByName("Telangana")!;
  const samplePan = "ABCDE1234F";
  const { error } = await db.from("profiles").insert({
    id: user.id,
    name: owner.name,
    handle: owner.handle ? owner.handle.replace(/^@?/, "@") : null,
    phone: "+" + normPhone(user.phone || owner.phone),
    email: owner.email || user.email || null,
    city: owner.city,
    address: null,
    state: state.name,
    state_code: state.code,
    pan_enc: encrypt(samplePan),
    pan_masked: maskPan(samplePan),
    gstin: `${state.code}ABCDE1234F1Z5`,
    udyam_no: `UDYAM-${state.abbr}-02-0012345`,
    bank_name: "HDFC Bank",
    bank_account_enc: encrypt("50100012344417"),
    bank_account_last4: "4417",
    ifsc: "HDFC0001234",
    upi: `${owner.name.split(/\s+/)[0]!.toLowerCase().replace(/[^a-z]/g, "") || "creator"}@hdfcbank`,
    invoice_prefix: defaultPrefix(owner.name),
    consent_at: new Date().toISOString(),
  });
  if (error && error.code !== "23505") throw new Error("Could not create the demo profile: " + error.message);
  await db.from("tax_config").upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });
  await seedFor(db, user.id, samplePan);
  return true;
}

export async function updateProfile(_: FormState, f: FormData): Promise<FormState> {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/signin");
  const { fields, error } = readProfileForm(f, true);
  if (error) return { error };
  const prefix = up(f.get("invoice_prefix")).replace(/[^A-Z0-9-]/g, "");
  if (!prefix || prefix.length > 8) return { error: "Invoice prefix should be 1–8 letters or numbers" };
  const { error: e } = await db.from("profiles").update({ ...fields, invoice_prefix: prefix }).eq("id", user.id);
  if (e) return { error: e.message };
  await audit(db, user.id, "settings_updated", "profile", user.id, { section: "profile" });
  redirect("/settings?t=" + encodeURIComponent("Profile saved"));
}
