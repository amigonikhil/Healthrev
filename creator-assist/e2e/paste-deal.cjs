// "Paste deal": paste a brand message (or a screenshot) → Claude extracts the terms →
// New deal form opens prefilled, unsure fields in yellow, nothing saved until the creator saves.
// Claude is replaced by a local mock of POST /v1/messages, so the app must run with
//   ANTHROPIC_API_KEY=test ANTHROPIC_BASE_URL=http://127.0.0.1:4010
// Needs local Supabase + app on :3000.
const http = require("http");
const { execSync } = require("child_process");
const { chromium } = require("playwright");
const MAIL = "http://127.0.0.1:54324";
const BASE = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync(`docker exec supabase_db_creator-assist psql -U postgres -tAc "${q}"`).toString().trim();
let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };

const istToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
const plusDays = (d, n) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const GO_LIVE = plusDays(istToday(), 14);

const empty = {
  brand_name: null, contact_name: null, contact_email: null, contact_whatsapp: null, deliverables: [], other_deliverables: [],
  fee_rupees: null, fee_gst: "not_mentioned", advance_rupees: null, usage_rights: null, go_live_date: null, payment_terms_days: null, unsure: [],
};
const FROM_TEXT = {
  ...empty, brand_name: "Glow Labs", contact_name: "Priya Nair", contact_email: "priya@glowlabs.in", contact_whatsapp: "+91 98765 43210",
  deliverables: [{ key: "Instagram|Reel", quantity: 1 }, { key: "Instagram|Story", quantity: 3 }], other_deliverables: ["Product photos for the website"],
  fee_rupees: 45000, fee_gst: "plus_gst", advance_rupees: 22500, usage_rights: { months: 3, perpetual: false, scope: "organic_paid" },
  go_live_date: GO_LIVE, payment_terms_days: 30, unsure: ["advance"],
};
const FROM_IMAGE = { ...empty, brand_name: "Orbit Audio", deliverables: [{ key: "Instagram|Reel", quantity: 2 }], fee_rupees: 30000, payment_terms_days: 50, unsure: ["fee", "payment_terms"] };

// Mock Claude: answers by what was sent (text / image / junk) and records the requests.
const calls = [];
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const b = JSON.parse(body || "{}");
    calls.push({ headers: req.headers, body: b });
    const content = b.messages?.[0]?.content ?? [];
    const hasImage = content.some((c) => c.type === "image");
    const textBlock = content.find((c) => c.type === "text")?.text ?? "";
    const out = hasImage ? FROM_IMAGE : textBlock.includes("Glow Labs") ? FROM_TEXT : empty;
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: "msg_mock", type: "message", role: "assistant", model: b.model, stop_reason: "end_turn", stop_sequence: null,
      content: [{ type: "text", text: JSON.stringify(out) }], usage: { input_tokens: 100, output_tokens: 100 },
    }));
  });
});

async function otpFor(email) {
  for (let i = 0; i < 20; i++) {
    const l = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
    const m = l.messages?.[0];
    if (m) { const msg = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json(); const c = (msg.Text || msg.HTML).match(/\b(\d{6})\b/); if (c) return c[1]; }
    await sleep(500);
  }
  throw new Error("no OTP email");
}

const PASTE = `Hi Asha! Loved your last reel 😍 This is Priya from Glow Labs (priya@glowlabs.in, +91 98765 43210).
For our serum launch we'd like 1 Reel + 3 Stories, going live in two weeks. Budget is ₹45k + GST.
We usually pay 50% advance and the rest within 30 days of invoice. Usage on our page + ads for 3 months.
Could you also send a few product photos for the website?`;

(async () => {
  await new Promise((r) => mock.listen(4010, "127.0.0.1", r));
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  page.on("pageerror", (e) => { console.log("  PAGE ERROR", e.message); failures++; });
  const email = `paste${Date.now()}@example.com`;

  console.log("Sign up");
  await page.goto(BASE + "/signin");
  if (await page.getByRole("radio", { name: "Email" }).count()) await page.getByRole("radio", { name: "Email" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send OTP" }).click();
  await page.getByLabel("Enter OTP").fill(await otpFor(email));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL("**/onboarding", { timeout: 30000 });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name (as on PAN)").fill("Asha Rao");
  await page.getByLabel("PAN", { exact: true }).fill("ABCPR1234Q");
  await page.locator("select[name=state]").selectOption("Karnataka");
  await page.getByLabel("GSTIN (if registered)").fill("29ABCPR1234Q1Z5");
  await page.getByLabel("Bank account").fill("123456789012");
  await page.getByLabel("IFSC").fill("ICIC0001234");
  await page.getByLabel(/I consent/).check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL("**/home", { timeout: 20000 });
  const uid = sql(`select id from auth.users where email='${email}'`);
  const dealCount = () => Number(sql(`select count(*) from deals where user_id='${uid}'`));

  console.log("Paste a message from Home");
  await page.getByRole("button", { name: "+ New deal" }).click();
  const sheet = page.getByRole("dialog", { name: "New deal" });
  ok(await sheet.isVisible(), "+ New deal opens the New deal sheet");
  ok(await sheet.getByRole("button", { name: "Fill the deal form" }).isDisabled(), "Fill button waits for a paste or screenshot");
  ok(!!(await sheet.getByRole("link", { name: "Fill it in myself" }).count()), "manual option is still there");
  await sheet.getByLabel("Paste deal").fill(PASTE);
  await page.screenshot({ path: __dirname + "/.shots/paste-1-sheet.png" });
  await sheet.getByRole("button", { name: "Fill the deal form" }).click();
  await page.waitForURL("**/deals/new?from=paste", { timeout: 30000 });
  await page.getByText("Filled in from your paste").waitFor();

  const req = calls.at(-1);
  ok(req.body.model === "claude-opus-5-5" && req.body.output_config?.format?.type === "json_schema", "Claude asked for structured JSON");
  ok(req.body.fallbacks === "default" && String(req.headers["anthropic-beta"]).includes("server-side-fallback-2026-07-01"), "refusal fallback enabled");
  ok(req.body.messages[0].content.find((c) => c.type === "text").text.includes("Budget is ₹45k + GST"), "pasted text reached the model");
  ok(req.body.system.includes("Instagram|Reel") && req.body.system.includes("Add-on|Link in bio"), "model is given our deliverables list");

  ok((await page.getByLabel(/^Brand/).first().inputValue()) === "Glow Labs", "brand prefilled");
  ok((await page.locator("input[name=contact_name]").inputValue()) === "Priya Nair", "contact prefilled");
  ok((await page.locator("input[name=contact_email]").inputValue()) === "priya@glowlabs.in", "contact email prefilled");
  ok((await page.locator("input[name=contact_whatsapp]").inputValue()) === "+91 98765 43210", "WhatsApp prefilled");
  ok(await page.locator("input[name='dl:Instagram|Reel']").isChecked() && await page.locator("input[name='dl:Instagram|Story']").isChecked(), "Reel + Story ticked");
  ok((await page.locator("input[name='q:Instagram|Story']").inputValue()) === "3", "3 Stories");
  ok((await page.locator("input[name=fee]").inputValue()) === "45000", "fee prefilled");
  ok(await page.getByRole("radio", { name: "+ GST" }).getAttribute("aria-checked") === "true", "+ GST chosen from '45k + GST'");
  ok(await page.locator("input[name=advance_on]").isChecked() && (await page.locator("input[name=advance]").inputValue()) === "22500", "advance prefilled");
  ok(await page.locator("input[name=usage_on]").isChecked() && (await page.locator("input[name=usage_duration]").inputValue()) === "3m", "usage rights 3 months");
  ok((await page.locator("input[name=go_live]").inputValue()) === GO_LIVE, "go-live date prefilled");
  ok((await page.getByRole("radio", { name: "30 days" }).getAttribute("aria-checked")) === "true", "30-day terms");
  ok((await page.locator(".info").innerText()).includes("Product photos for the website"), "other asks listed, not dropped");

  const advCard = page.locator(".card", { has: page.locator("input[name=advance_on]") });
  ok(await advCard.evaluate((el) => el.classList.contains("ai-check")), "unsure field (advance) is highlighted");
  ok((await advCard.evaluate((el) => getComputedStyle(el).boxShadow)).includes("rgb"), "highlight is visible (yellow outline)");
  ok((await page.locator(".ai-check").count()) === 1, "only the unsure field is highlighted");
  await page.screenshot({ path: __dirname + "/.shots/paste-2-form.png", fullPage: true });
  await page.locator("input[name=advance]").fill("20000");
  ok(!(await advCard.evaluate((el) => el.classList.contains("ai-check"))), "highlight clears once the creator edits it");

  ok((await page.evaluate(() => sessionStorage.getItem("ca:pasted-deal"))) === null, "hand-off read once and removed");
  ok(dealCount() === 0, "nothing saved automatically");
  const evs = sql(`select properties::text from events where user_id='${uid}' and event_name='deal_pasted'`);
  ok(evs.includes('"source": "text"') && !/Glow|Priya|45k|serum/i.test(evs), "only a count-only event is recorded, not the paste");
  ok(!/Glow Labs|serum launch/.test(sql(`select coalesce(string_agg(t::text, ''), '') from (select row_to_json(x) t from audit_log x where user_id='${uid}') s`)), "paste not in the audit log");

  console.log("Review and save");
  await page.locator("select[name=brand_state]").selectOption("Maharashtra");
  await page.getByRole("button", { name: "Save without agreement" }).click();
  await page.waitForURL(/\/deals\/[0-9a-f-]{36}$/, { timeout: 20000 });
  ok(dealCount() === 1, "deal saved only when the creator taps Save");
  const saved = sql(`select fee_paise || ',' || advance_paise || ',' || terms_days || ',' || go_live_date from deals where user_id='${uid}'`);
  ok(saved === `4500000,2000000,30,${GO_LIVE}`, "saved deal has the reviewed values: " + saved);

  console.log("Screenshot");
  await page.goto(BASE + "/deals");
  await page.getByRole("button", { name: "+ New deal" }).click();
  await page.locator("input[type=file]").setInputFiles(__dirname + "/.shots/paste-1-sheet.png");
  ok(await page.getByRole("img", { name: "Your screenshot" }).isVisible(), "screenshot preview shown");
  await page.screenshot({ path: __dirname + "/.shots/paste-3-screenshot.png" });
  await page.getByRole("button", { name: "Fill the deal form" }).click();
  await page.waitForURL("**/deals/new?from=paste", { timeout: 30000 });
  await page.getByText("Filled in from your paste").waitFor();
  const img = calls.at(-1).body.messages[0].content.find((c) => c.type === "image");
  ok(img?.source?.type === "base64" && img.source.media_type === "image/jpeg" && img.source.data.length > 1000, "screenshot sent as a resized JPEG");
  ok((await page.getByLabel(/^Brand/).first().inputValue()) === "Orbit Audio", "brand read from the screenshot");
  ok((await page.getByRole("radio", { name: "Custom" }).getAttribute("aria-checked")) === "true" && (await page.locator("input[aria-label='payment days']").inputValue()) === "50", "50-day terms go to Custom");
  ok((await page.locator(".ai-check").count()) === 2, "fee and terms highlighted");
  await page.screenshot({ path: __dirname + "/.shots/paste-4-form-from-screenshot.png", fullPage: true });
  ok((await page.locator(".info").innerText()).includes("add the contact") === false && (await page.locator(".info").innerText()).match(/add the|Check everything/), "banner asks to check");

  console.log("Nothing deal-like");
  await page.goto(BASE + "/home");
  await page.getByRole("button", { name: "+ New deal" }).click();
  await page.getByLabel("Paste deal").fill("Happy Diwali! 🪔");
  await page.getByRole("button", { name: "Fill the deal form" }).click();
  const err = page.getByRole("dialog", { name: "New deal" }).getByRole("alert");
  await err.waitFor();
  ok((await err.innerText()).includes("couldn't find deal details"), "friendly error when there's no deal in the paste");
  await page.screenshot({ path: __dirname + "/.shots/paste-5-error.png" });
  ok(page.url().endsWith("/home"), "stays on the sheet");

  console.log("Auth");
  const anon = await (await browser.newContext()).request.post(BASE + "/api/deals/extract", { multipart: { text: PASTE }, maxRedirects: 0 });
  ok(anon.status() !== 200, "signed-out requests are refused (" + anon.status() + ")");

  await browser.close();
  mock.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL PASTE-DEAL CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
