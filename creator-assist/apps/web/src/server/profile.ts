import "server-only";
import type { Me, OnboardInput, ProfileInput, UpdateProfileInput } from "@creator-assist/shared/api";
import { todayIST } from "@creator-assist/shared/dates";
import { defaultPrefix } from "@creator-assist/shared/invoice";
import { stateByName } from "@creator-assist/shared/states";
import type { Profile } from "@creator-assist/shared/types";
import { ACCT_RE, bankFromIfsc, EMAIL_RE, GSTIN_RE, IFSC_RE, PAN_RE, UDYAM_RE, UPI_RE } from "@creator-assist/shared/validate";
import { getSetting, type TaxDefaults } from "@/lib/app-settings";
import { audit } from "@/lib/audit";
import { encrypt, last4, maskPan } from "@/lib/crypto";
import { getTax } from "@/lib/data";
import { demoOwner, isOwner, normPhone } from "@/lib/env";
import { seedDemoData } from "@/lib/seed";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, loadProfile, track, type Ctx } from "./context";

type ProfileFields = Partial<Omit<Profile, "id">>;
const t = (s: string | null | undefined) => (s ?? "").trim();
const T = (s: string | null | undefined) => t(s).toUpperCase();

/** Validates profile details. With `editing`, a blank PAN or bank account keeps the stored (encrypted) value. */
function profileFields(input: ProfileInput, editing: boolean): ProfileFields {
  const name = t(input.name);
  const state = stateByName(t(input.state));
  const pan = T(input.pan);
  const gstin = T(input.gstin);
  const udyam = T(input.udyam);
  const acct = t(input.bankAccount).replace(/\s/g, "");
  const ifsc = T(input.ifsc);
  const upi = t(input.upi);
  const email = t(input.email);

  if (!name) fail(400, "Enter your full name as on PAN");
  if (!state) fail(400, "Choose your state");
  if (!(editing && !pan) && !PAN_RE.test(pan)) fail(400, "PAN should look like ABCDE1234F");
  if (gstin && !GSTIN_RE.test(gstin)) fail(400, "GSTIN doesn't look right (15 characters, e.g. 36ABCDE1234F1Z5)");
  if (gstin && gstin.slice(0, 2) !== state.code) fail(400, `GSTIN starts with ${gstin.slice(0, 2)}, but ${state.name} is ${state.code}`);
  if (udyam && !UDYAM_RE.test(udyam)) fail(400, "Udyam number should look like UDYAM-TS-02-0012345");
  if (!(editing && !acct) && !ACCT_RE.test(acct)) fail(400, "Bank account number should be 9–18 digits");
  if (!IFSC_RE.test(ifsc)) fail(400, "IFSC should look like HDFC0001234");
  if (upi && !UPI_RE.test(upi)) fail(400, "UPI ID should look like name@bank");
  if (email && !EMAIL_RE.test(email)) fail(400, "Email doesn't look right");

  const fields: ProfileFields = {
    name, state: state.name, state_code: state.code, gstin: gstin || null, udyam_no: udyam || null,
    ifsc, bank_name: bankFromIfsc(ifsc), upi: upi || null,
    handle: t(input.handle).replace(/^@?/, "@").replace(/^@$/, "") || null,
    email: email || null, city: t(input.city) || null, address: t(input.address) || null,
  };
  // PAN and bank account are only ever stored encrypted, with a masked copy for display.
  if (pan) Object.assign(fields, { pan_enc: encrypt(pan), pan_masked: maskPan(pan) });
  if (acct) Object.assign(fields, { bank_account_enc: encrypt(acct), bank_account_last4: last4(acct) });
  return fields;
}

/** The signed-in user, their profile (null until onboarded) and rates. */
/** The profile as sent to the apps: the PAN and bank ciphertext stays on the server (masked values are kept). */
export const clientProfile = (p: Profile): Profile => ({ ...p, pan_enc: null, bank_account_enc: null });

export async function me(ctx: Ctx): Promise<Me> {
  const profile = await loadProfile(ctx);
  const [tax, admin, sample] = await Promise.all([
    profile ? getTax(ctx.db) : null,
    createAdminClient().from("admins").select("role").eq("user_id", ctx.user.id).maybeSingle(),
    ctx.db.from("deals").select("id", { count: "exact", head: true }).eq("is_sample", true),
  ]);
  return {
    user: { id: ctx.user.id, email: ctx.user.email ?? null, phone: ctx.user.phone ? "+" + normPhone(ctx.user.phone) : null },
    profile: profile && clientProfile(profile), tax, isAdmin: isOwner(ctx.user) || !!admin.data, hasSampleData: (sample.count ?? 0) > 0,
  };
}

/** First call after sign-in: provisions the demo owner's account if this is them, then returns `me`. */
export async function bootstrap(ctx: Ctx): Promise<Me> {
  await provisionOwnerIfNeeded(ctx);
  return me(ctx);
}

export async function onboard(ctx: Ctx, input: OnboardInput): Promise<Profile> {
  const { db, user } = ctx;
  if (!input.consent) fail(400, "Please tick the consent box to continue");
  const fields = profileFields(input, false);
  const phone = user.phone ? "+" + normPhone(user.phone) : t(input.phone) || null;

  const { error: e1 } = await db.from("profiles").insert({
    id: user.id, ...fields, phone, email: fields.email ?? user.email ?? null,
    invoice_prefix: defaultPrefix(fields.name!), consent_at: new Date().toISOString(),
  });
  if (e1 && e1.code !== "23505") fail(500, "Could not save your details: " + e1.message);
  // New creators start from the admin-set default rates (if any); they can change them in Settings.
  const defaults = await getSetting<TaxDefaults>("tax_defaults");
  await db.from("tax_config").upsert({ user_id: user.id, ...(defaults ?? {}) }, { onConflict: "user_id", ignoreDuplicates: true });
  if (!e1) await track(ctx, "onboarding_completed");

  // The owner always gets the demo set, even if they onboard by hand.
  if (isOwner(user)) await seedFor(ctx, T(input.pan) || null);
  return (await loadProfile(ctx))!;
}

async function seedFor(ctx: Ctx, pan: string | null) {
  const profile = await loadProfile(ctx);
  if (!profile) return;
  const tax = await getTax(ctx.db);
  const seeded = await seedDemoData(ctx.db, { userId: ctx.user.id, profile, pan, tax, today: todayIST() });
  if (seeded) await audit(ctx.db, ctx.user.id, "sample_seeded", "profile", ctx.user.id);
}

/**
 * First sign-in for DEMO_OWNER_PHONE: create the profile from env vars with sample
 * PAN/GSTIN/Udyam/bank values (never the owner's real ones) and seed the demo set.
 * Returns false for everyone else.
 */
export async function provisionOwnerIfNeeded(ctx: Ctx): Promise<boolean> {
  const owner = demoOwner();
  const { db, user } = ctx;
  if (!owner || !isOwner(user)) return false;
  if (await loadProfile(ctx)) return false;

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
  await seedFor(ctx, samplePan);
  return true;
}

export async function updateProfile(ctx: Ctx, input: UpdateProfileInput): Promise<Profile> {
  const fields = profileFields(input, true);
  const prefix = T(input.invoicePrefix).replace(/[^A-Z0-9-]/g, "");
  if (!prefix || prefix.length > 8) fail(400, "Invoice prefix should be 1–8 letters or numbers");
  const { error } = await ctx.db.from("profiles").update({ ...fields, invoice_prefix: prefix }).eq("id", ctx.user.id);
  if (error) fail(500, error.message);
  await audit(ctx.db, ctx.user.id, "settings_updated", "profile", ctx.user.id, { section: "profile" });
  const p = await loadProfile(ctx);
  if (!p) fail(409, "Finish setting up your profile first", "onboarding_required");
  return p;
}
