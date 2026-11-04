// /api/v1 as the mobile apps use it: Supabase JWT in `Authorization: Bearer`, platform
// in `X-Client-Platform`. Runs a creator's whole flow, then has a second creator try to
// read and change the first one's data (must fail: RLS). Needs local Supabase + app on :3000.
const fs = require("fs");
const { execSync } = require("child_process");
const BASE = "http://localhost:3000/api/v1";
const env = Object.fromEntries(fs.readFileSync(__dirname + "/../.env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const SB = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const sql = (q) => execSync(`docker exec supabase_db_creator-assist psql -U postgres -tAc "${q}"`).toString().trim();
let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };
const today = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

async function newUser(email, platform) {
  const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: h, body: JSON.stringify({ email, password: "Test-pass-123!", email_confirm: true, user_metadata: { platform } }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Test-pass-123!" }) })).json();
  if (!s.access_token) throw new Error("sign-in failed: " + JSON.stringify(s));
  return { id: u.id, token: s.access_token };
}

function client(token, platform) {
  const call = async (method, path, body, raw) => {
    const headers = { "X-Client-Platform": platform };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const res = await fetch(BASE + path, { method, headers, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined, redirect: "manual" });
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, json, text };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b ?? {}), put: (p, b) => call("PUT", p, b), patch: (p, b) => call("PATCH", p, b), del: (p, b) => call("DELETE", p, b), raw: (p) => call("GET", p, null, true) };
}

const profile = (pan, acct) => ({
  name: "Asha Rao", state: "Telangana", pan, gstin: `36${pan}1Z5`, bankAccount: acct, ifsc: "HDFC0001234", upi: "asha@hdfcbank",
  email: "asha@example.com", handle: "ashacreates", city: "Hyderabad", consent: true,
});
const dealInput = {
  brand: "Glow Labs", paidBy: "brand", contactName: "Priya Nair", contactEmail: "priya@glow.example", contactWhatsapp: "+91 98765 43210",
  brandState: "Karnataka", feePaise: 4500000, gstMode: "add", tds: { rate: 10 }, advance: { paise: 1500000, received: true },
  goLive: null, termsDays: 30, deliverables: [{ platform: "Instagram", type: "Reel", quantity: 2 }, { platform: "Instagram", type: "Story", quantity: 3 }],
  usage: { duration: "3m", scope: "organic_paid" },
};

(async () => {
  const stamp = Date.now();
  console.log("Public endpoints and auth");
  const anon = client(null, "ios");
  const cfg = await anon.get("/config");
  ok(cfg.status === 200 && cfg.json.flags.lawyer_notice === false && cfg.json.flags.file_with_us === false && cfg.json.flags.deal_from_chat === false, "config: launch-scope flags exist and are off");
  ok(cfg.json.minAppVersion?.ios === "1.0.0" && cfg.json.minAppVersion?.android === "1.0.0", "config: minimum app version");
  const deliverables = await anon.get("/deliverables");
  ok(deliverables.status === 200 && deliverables.json.groups.some((g) => g.items.some((i) => i.type === "Reel")), "deliverables menu");
  const noAuth = await anon.get("/me");
  ok(noAuth.status === 401 && noAuth.json.code === "unauthorized", "no token → 401 JSON, not a redirect");
  const badToken = await client("not-a-real-token", "ios").get("/deals");
  ok(badToken.status === 401, "bad token → 401");

  console.log("Creator A on iOS: onboarding");
  // The apps pass their platform in the sign-up metadata, as signInWithOtp({ options: { data: { platform } } }) does.
  const A = await newUser(`api-a-${stamp}@example.com`, "ios");
  const a = client(A.token, "ios");
  let r = await a.get("/me");
  ok(r.status === 200 && r.json.user.id === A.id && r.json.profile === null, "me: signed in, not onboarded");
  r = await a.get("/deals");
  ok(r.status === 409 && r.json.code === "onboarding_required", "deals before onboarding → 409 onboarding_required");
  r = await a.post("/profile", { ...profile("BADPAN", "123456789012") });
  ok(r.status === 400 && r.json.error === "PAN should look like ABCDE1234F", "onboarding validation message matches the web form");
  r = await a.post("/profile", profile("ABCPR1234Q", "123456789012"));
  ok(r.status === 200 && r.json.profile.pan_masked === "ABCPR••••Q" && r.json.profile.bank_account_last4 === "9012", "onboarded; PAN and bank shown masked");
  const stored = sql(`select pan_enc || ' ' || bank_account_enc from profiles where id='${A.id}'`);
  ok(stored.startsWith("v1.") && !stored.includes("ABCPR1234Q") && !stored.includes("123456789012"), "PAN and bank account stored encrypted");
  ok(r.json.profile.pan_enc === null && r.json.profile.bank_account_enc === null, "onboarding response carries no PAN/bank ciphertext");
  r = await a.get("/me");
  ok(r.json.profile.pan_masked === "ABCPR••••Q" && r.json.profile.pan_enc === null && r.json.profile.bank_account_enc === null && !JSON.stringify(r.json).includes(stored.split(" ")[0]), "me: masked PAN only, no ciphertext");

  console.log("Deal → agreement → invoice → reminders → payment");
  r = await a.post("/deals", { ...dealInput, deliverables: [] });
  ok(r.status === 400 && r.json.error === "Pick at least one deliverable", "deal validation");
  r = await a.post("/deals", dealInput);
  ok(r.status === 200 && /^[0-9a-f-]{36}$/.test(r.json.id), "deal created");
  const dealId = r.json.id;
  r = await a.get(`/deals/${dealId}`);
  ok(r.status === 200 && r.json.deal.total === 5310000 && r.json.deal.remaining === 3810000, "deal view: ₹53,100 total, ₹38,100 due after the ₹15,000 advance");
  ok(r.json.deal.d.usage.duration === "3m" && r.json.deal.d.deliverables.length === 2, "usage rights and deliverables saved");
  r = await a.get("/home");
  ok(r.status === 200 && r.json.empty === false && r.json.attention.length === 1, "home summary");
  r = await a.get("/brands");
  ok(r.status === 200 && r.json.brands[0].brand.name === "Glow Labs" && r.json.brands[0].amount.due === 3810000, "brands list with labelled amount");
  r = await a.get("/deals/options");
  ok(r.status === 200 && r.json.creator.registered === true && r.json.deliverables.length > 0, "new-deal options");

  r = await a.get(`/deals/${dealId}/agreement`);
  ok(r.status === 200 && r.json.agreement === null && r.json.body.clauses.length > 3, "agreement preview before sending");
  r = await a.post(`/deals/${dealId}/agreement`, { email: false, whatsapp: true });
  ok(r.status === 200 && r.json.link.includes("/s/") && r.json.wa.startsWith("https://wa.me/919876543210?text="), "send for e-sign: web signing link + WhatsApp link");
  const signToken = r.json.link.split("/s/")[1];
  const agreementId = sql(`select id from agreements where deal_id='${dealId}'`);

  r = await a.get(`/deals/${dealId}/invoice`);
  ok(r.status === 200 && r.json.invoice.draft === true && r.json.invoice.balance_due_paise === 3810000, "invoice preview");
  r = await a.post(`/deals/${dealId}/invoice`, { invoiceDate: today, email: false });
  const fy = today.slice(5, 7) >= "04" ? `${today.slice(0, 4)}-${String(Number(today.slice(2, 4)) + 1).padStart(2, "0")}` : `${Number(today.slice(0, 4)) - 1}-${today.slice(2, 4)}`;
  ok(r.status === 200 && r.json.invoice.number === `AR/${fy}/001` && r.json.invoice.igst_paise === 810000, `invoice AR/${fy}/001 with IGST`);
  const invoiceId = r.json.invoice.id;
  const pdf = await a.raw(`/invoices/${invoiceId}/pdf`);
  ok(pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf" && (await pdf.arrayBuffer()).byteLength > 5000, "invoice PDF");
  r = await a.get(`/deals/${dealId}/reminders`);
  ok(r.status === 200 && r.json.ladder.length === 3 && r.json.stage === "friendly", "3 reminders scheduled");
  r = await a.post("/reminders/whatsapp", { dealId, kind: "payment", stage: "friendly", lang: "en", message: "Hi Priya, gentle reminder…" });
  ok(r.status === 200, "WhatsApp reminder logged");
  r = await a.post("/reminders/email", { dealId, kind: "payment", stage: "follow_up", lang: "en", message: "Hi Priya…", cc: false });
  ok(r.status === 200 && typeof r.json.message === "string", "email reminder: " + r.json?.message);

  r = await a.post(`/deals/${dealId}/payments`, { amountPaise: 1800000, tdsPaise: 200000, receivedOn: today });
  ok(r.status === 200 && r.json.settled === false, "part payment recorded");
  r = await a.post(`/deals/${dealId}/payments`, { amountPaise: 1560000, tdsPaise: 250000, receivedOn: today, utr: "UTR123" });
  ok(r.status === 200 && r.json.settled === true, "balance paid → deal settled");
  r = await a.get(`/deals/${dealId}`);
  ok(r.json.deal.phase === "paid", "deal shows as paid");
  ok(Number(sql(`select count(*) from reminders where deal_id='${dealId}' and kind='payment' and sent_at is null and cancelled_at is null`)) === 0, "pending reminders cancelled");

  console.log("Tax hub, AIS, settings, sample data, feedback, export");
  r = await a.get("/tax");
  ok(r.status === 200 && r.json.hub.tdsExpected === 450000 && r.json.missing.length === 1, "tax hub: ₹4,500 TDS expected, missing from AIS");
  r = await a.post("/tax/ais/entries", { deductor: "Glow Labs", amountPaise: 450000 });
  ok(r.status === 200, "AIS entry added");
  r = await a.get("/tax");
  ok(r.json.missing.length === 0, "TDS now matched");
  const ais = new FormData();
  ais.set("file", new Blob([JSON.stringify({ TDS: [{ deductorName: "Glow Labs", tan: "BLRG12345A", amount: 4500 }] })], { type: "application/json" }), "ais.json");
  r = await a.post("/tax/ais", ais);
  ok(r.status === 200 && typeof r.json.message === "string", "AIS upload: " + r.json?.message);
  r = await a.put("/settings/rates", { gstRate: 18, tdsRate: 10, rbiBankRate: 5.5, msmeMultiple: 30, lateInterestRate: 10, lateInterestPeriod: "week", noticeLegalFeePaise: 500000 });
  ok(r.status === 400 && r.json.error === "Check the msme multiple", "rates validation");
  r = await a.put("/settings/reminders", { everyHours: 12, whatsapp: true, email: true, language: "hi", termsDays: 30 });
  ok(r.status === 200, "reminder settings saved");
  r = await a.post("/sample");
  ok(r.status === 200 && r.json.message === "Sample data loaded", "sample data loaded");
  r = await a.get("/deals");
  ok(r.json.deals.length === 6 && r.json.deals.filter((v) => v.d.is_sample).length === 5, "5 sample deals, clearly marked");
  r = await a.del("/sample");
  r = await a.get("/deals");
  ok(r.json.deals.length === 1 && !r.json.deals[0].d.is_sample, "clear sample data keeps the real deal");
  r = await a.post("/feedback", { screen: "/home", message: "From the API test" });
  ok(r.status === 200, "feedback");
  r = await a.get("/account/export");
  ok(r.status === 200 && r.json.profile.pan === "ABCPR1234Q" && r.json.deals.length === 1 && r.json.payments.length === 2, "export: own data, PAN decrypted for the owner");

  const platforms = sql(`select string_agg(distinct coalesce(properties->>'platform','(none)'), ',') from events where user_id='${A.id}'`);
  ok(platforms === "ios", "every event from this creator has platform=ios: " + platforms);

  console.log("Creator B on Android tries to reach A's data (RLS)");
  const B = await newUser(`api-b-${stamp}@example.com`, "android");
  const b = client(B.token, "android");
  r = await b.post("/profile", profile("ABCPS9876Q", "987654321098"));
  ok(r.status === 200, "B onboarded");
  r = await b.get("/deals");
  ok(r.status === 200 && r.json.deals.length === 0, "B's deal list doesn't include A's deal");
  for (const [what, res] of [
    ["read A's deal", await b.get(`/deals/${dealId}`)],
    ["read A's agreement", await b.get(`/deals/${dealId}/agreement`)],
    ["download A's invoice PDF", await b.get(`/invoices/${invoiceId}/pdf`)],
    ["download A's agreement PDF", await b.get(`/agreements/${agreementId}/pdf`)],
    ["record a payment on A's deal", await b.post(`/deals/${dealId}/payments`, { amountPaise: 100, tdsPaise: 0 })],
    ["send A's agreement", await b.post(`/deals/${dealId}/agreement`, { email: false, whatsapp: false })],
    ["generate A's invoice", await b.post(`/deals/${dealId}/invoice`, { invoiceDate: today, email: false })],
  ]) ok(res.status === 404, `B can't ${what} (${res.status})`);
  r = await b.post("/reminders/email", { dealId, kind: "payment", stage: "friendly", lang: "en", message: "x", cc: false });
  ok(r.status === 200 && r.json.message === "Not found", "B can't email a reminder for A's deal");
  const direct = await (await fetch(`${SB}/rest/v1/deals?select=id`, { headers: { apikey: ANON, Authorization: `Bearer ${B.token}` } })).json();
  ok(Array.isArray(direct) && direct.length === 0, "direct database read with B's token returns nothing of A's");
  const directProfile = await (await fetch(`${SB}/rest/v1/profiles?select=pan_enc&id=eq.${A.id}`, { headers: { apikey: ANON, Authorization: `Bearer ${B.token}` } })).json();
  ok(Array.isArray(directProfile) && directProfile.length === 0, "B can't read A's profile (PAN/bank) directly");
  const evB = sql(`select string_agg(distinct properties->>'platform', ',') from events where user_id='${B.id}'`);
  ok(evB === "android", "B's events have platform=android: " + evB);

  console.log("Delete account");
  r = await b.del("/account", { confirm: "nope" });
  ok(r.status === 400 && r.json.error === "Type DELETE to confirm", "delete needs confirmation");
  r = await b.del("/account", { confirm: "DELETE" });
  ok(r.status === 200, "B deleted their account");
  ok(sql(`select count(*) from auth.users where id='${B.id}'`) === "0" && sql(`select count(*) from profiles where id='${B.id}'`) === "0", "B's user and profile are gone");
  r = await b.get("/me");
  ok(r.status === 401, "B's old token no longer works");
  ok(sql(`select count(*) from deals where id='${dealId}'`) === "1", "A's data untouched");
  ok(signToken.length > 20, "signing link token issued (brand signs on the web)");

  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL API v1 CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
