// Push notifications: device registration, preferences, and each trigger, against a local
// mock of the Expo push service. Start the app with
//   EXPO_PUSH_URL=http://127.0.0.1:4011/push PUSH_ANY_HOUR=1
// (PUSH_ANY_HOUR lifts the 21:00–09:00 IST quiet hours so the test doesn't depend on the clock).
// Needs local Supabase + app on :3000, on a fresh `supabase db reset`.
const fs = require("fs");
const http = require("http");
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const API = BASE + "/api/v1";
const env = Object.fromEntries(fs.readFileSync(__dirname + "/../.env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const SB = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
const sql = (q) => execSync(`docker exec supabase_db_creator-assist psql -U postgres -tAc "${q}"`).toString().trim();
let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };
const ist = (d = 0) => new Date(Date.now() + 5.5 * 3600e3 + d * 86400e3).toISOString().slice(0, 10);
const today = ist();

// ---- mock Expo push service
const pushed = [];
const DEAD = "ExponentPushToken[deaddevice000000]";
const mock = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const msgs = JSON.parse(b || "[]");
    pushed.push(...msgs);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ data: msgs.map((m) => (m.to === DEAD ? { status: "error", details: { error: "DeviceNotRegistered" } } : { status: "ok", id: "x" })) }));
  });
}).listen(4011);

async function newUser(email, platform) {
  const h = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const u = await (await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: h, body: JSON.stringify({ email, password: "Test-pass-123!", email_confirm: true, user_metadata: { platform } }) })).json();
  const s = await (await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "Test-pass-123!" }) })).json();
  return { id: u.id, token: s.access_token };
}
function client(token, platform) {
  const call = async (method, path, body) => {
    const headers = { "X-Client-Platform": platform, Authorization: `Bearer ${token}` };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch { /* */ }
    return { status: res.status, json };
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b ?? {}), put: (p, b) => call("PUT", p, b), del: (p, b) => call("DELETE", p, b) };
}
const cron = async () => (await fetch(BASE + "/api/cron/reminders", { headers: { Authorization: `Bearer ${env.CRON_SECRET}` } })).json();
const deal = (brand, terms, whatsapp) => ({
  brand, paidBy: "brand", contactName: "Priya Nair", contactEmail: `priya@${brand.toLowerCase().replace(/\W/g, "")}.example`, contactWhatsapp: whatsapp,
  brandState: "Karnataka", feePaise: 2000000, gstMode: "add", tds: { rate: 10 }, advance: null, goLive: null, termsDays: terms,
  deliverables: [{ platform: "Instagram", type: "Reel", quantity: 1 }], usage: null,
});
const since = (n) => pushed.slice(n);
const waitFor = async (pred, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (pred()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

(async () => {
  const a = await newUser(`push-${Date.now()}@example.com`, "ios");
  const c = client(a.token, "ios");
  await c.post("/profile", { name: "Asha Rao", state: "Telangana", pan: "ABCPR1234Q", bankAccount: "123456789012", ifsc: "HDFC0001234", email: "asha@example.com", consent: true });

  console.log("Device registration and preferences");
  let r = await c.post("/push/tokens", { token: "not-a-token", platform: "ios" });
  ok(r.status === 400, "rejects something that isn't an Expo push token");
  const TOKEN = "ExponentPushToken[iphoneOfAsha0001]";
  r = await c.post("/push/tokens", { token: TOKEN, platform: "ios" });
  ok(r.status === 200 && sql(`select count(*) from push_tokens where user_id='${a.id}'`) === "1", "registers the phone");
  r = await c.post("/push/tokens", { token: TOKEN, platform: "ios" });
  ok(sql(`select count(*) from push_tokens where token='${TOKEN}'`) === "1", "registering again doesn't duplicate");
  r = await c.put("/push/prefs", { prefs: { overdue: false, junk: true } });
  ok(r.status === 200 && r.json.prefs.overdue === false && r.json.prefs.payment_due_today === true && !("junk" in r.json.prefs), "prefs saved (unknown keys dropped, missing = on)");
  const me = await c.get("/me");
  ok(me.json.profile.push_prefs.overdue === false, "prefs come back on /me");

  console.log("Payment due today (and once only)");
  const d1 = (await c.post("/deals", deal("Due Today Co", 30, "+91 90000 11111"))).json.id;
  await c.post(`/deals/${d1}/invoice`, { invoiceDate: ist(-30), email: false });
  // Park the ladder in the future so the WhatsApp check below doesn't depend on the time of day.
  sql(`update reminders set scheduled_at = now() + interval '2 days' where deal_id='${d1}'`);
  let n = pushed.length;
  let out = await cron();
  let got = since(n).filter((m) => m.data?.kind === "payment_due_today");
  ok(got.length === 1 && got[0].to === TOKEN && got[0].title === "Due Today Co's payment is due today" && got[0].data.url === `/deals/${d1}`, "push: due today, opens the deal");
  ok(!/ABCPR|123456789012|\b\d{6}\b/.test(JSON.stringify(got[0])), "no PAN, bank or codes in the push");
  n = pushed.length;
  await cron();
  ok(since(n).filter((m) => m.data?.kind === "payment_due_today").length === 0, "the same event never notifies twice");

  console.log("WhatsApp reminder due");
  sql(`update reminders set scheduled_at = now() - interval '1 hour' where deal_id='${d1}' and stage='friendly'`);
  n = pushed.length;
  await cron();
  got = since(n).filter((m) => m.data?.kind === "whatsapp_due");
  ok(got.length === 1 && got[0].data.url === `/deals/${d1}/reminders` && got[0].body.startsWith("Due Today Co:"), "push: WhatsApp reminder due, opens Reminders");

  console.log("Overdue respects the switch");
  const d2 = (await c.post("/deals", deal("Late Pay Ltd", 30, null))).json.id;
  await c.post(`/deals/${d2}/invoice`, { invoiceDate: ist(-31), email: false });
  n = pushed.length;
  out = await cron();
  ok(since(n).filter((m) => m.data?.kind === "overdue").length === 0, "overdue switched off: no push");
  await c.put("/push/prefs", { prefs: { overdue: true } });
  n = pushed.length;
  await cron();
  got = since(n).filter((m) => m.data?.kind === "overdue");
  ok(got.length === 1 && got[0].title === "Late Pay Ltd is overdue", "switched back on: overdue push");

  console.log("Agreement signed (brand signs on the web)");
  const d3 = (await c.post("/deals", deal("Signed Studio", 45, null))).json.id;
  const link = (await c.post(`/deals/${d3}/agreement`, { email: false, whatsapp: false })).json.link.replace(/^https?:\/\/[^/]+/, BASE);
  const b = await chromium.launch();
  const bp = await (await b.newContext()).newPage();
  await bp.goto(link);
  await bp.getByLabel("Your name").fill("Sameer Rao");
  await bp.getByLabel("Your work email").fill("sameer@signed.example");
  await bp.getByRole("button", { name: "Send OTP to email" }).click();
  await bp.waitForSelector("p[role=status]");
  const code = (await bp.locator("p[role=status]").innerText()).match(/(\d{6})/)[1];
  await bp.getByLabel("Email OTP").fill(code);
  await bp.getByLabel(/I accept on behalf of/).check();
  n = pushed.length;
  await bp.getByRole("button", { name: "Accept and sign" }).click();
  await waitFor(() => since(n).some((m) => m.data?.kind === "agreement_signed"));
  await b.close();
  got = since(n).filter((m) => m.data?.kind === "agreement_signed");
  ok(got.length === 1 && got[0].title === "Signed Studio signed your agreement" && got[0].data.url === `/deals/${d3}`, "push: agreement signed, straight away");

  console.log("TDS missing from AIS");
  await c.post(`/deals/${d2}/payments`, { amountPaise: 2160000, tdsPaise: 200000, receivedOn: today });
  sql(`update profiles set ais_updated_at = now() where id='${a.id}'`);
  n = pushed.length;
  await cron();
  got = since(n).filter((m) => m.data?.kind === "tds_mismatch");
  ok(got.length === 1 && got[0].data.url === "/tax" && got[0].body.includes("isn't showing yet"), "push: TDS missing from AIS");

  console.log("Sample data never notifies");
  await c.post("/sample");
  n = pushed.length;
  await cron();
  ok(!since(n).some((m) => /Glow Labs|Voltra|FitFuel|Zenvolt|Urban Roots/.test(m.title + m.body)), "no pushes about sample deals");

  console.log("Dead devices and sign-out");
  await c.post("/push/tokens", { token: DEAD, platform: "android" });
  const d4 = (await c.post("/deals", deal("Another Due Co", 30, null))).json.id;
  await c.post(`/deals/${d4}/invoice`, { invoiceDate: ist(-30), email: false });
  await cron();
  ok(sql(`select count(*) from push_tokens where token='${DEAD}'`) === "0", "a device the push service no longer knows is forgotten");
  r = await c.del("/push/tokens", { token: TOKEN });
  ok(r.status === 200 && sql(`select count(*) from push_tokens where user_id='${a.id}'`) === "0", "sign-out removes the phone");

  console.log("Another creator can't take over or remove a device's token");
  const bUser = await newUser(`push-b-${Date.now()}@example.com`, "android");
  const cb = client(bUser.token, "android");
  await cb.post("/profile", { name: "Ben", state: "Karnataka", pan: "ABCPB1234Q", bankAccount: "223456789012", ifsc: "HDFC0001234", consent: true });
  await c.post("/push/tokens", { token: TOKEN, platform: "ios" });
  await cb.del("/push/tokens", { token: TOKEN });
  ok(sql(`select user_id from push_tokens where token='${TOKEN}'`) === a.id, "B can't delete A's device");
  const direct = await (await fetch(`${SB}/rest/v1/push_tokens?select=token`, { headers: { apikey: ANON, Authorization: `Bearer ${bUser.token}` } })).json();
  ok(Array.isArray(direct) && direct.length === 0, "RLS: B can't read A's push tokens");
  const log = await (await fetch(`${SB}/rest/v1/push_log?select=*`, { headers: { apikey: ANON, Authorization: `Bearer ${a.token}` } })).json();
  ok(Array.isArray(log) && log.length === 0, "push_log isn't readable from the apps");

  mock.close();
  console.log(failures ? `\n${failures} FAILED` : "\nALL PUSH CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); mock.close(); process.exit(1); });
