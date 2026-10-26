// Admin dashboard (ADMIN.md). Run after owner.cjs on a fresh `supabase db reset` (it reuses the owner's demo data).
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const BASE = "http://localhost:3000";
const MAIL = "http://127.0.0.1:54324";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sql = (q) => execSync(`docker exec supabase_db_creator-assist psql -U postgres -tAc "${q.replace(/"/g, '\\"')}"`).toString().trim();
let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };

async function emailSignIn(b, email) {
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p.goto(BASE + "/signin");
  if (await p.getByRole("radio", { name: "Email" }).count()) await p.getByRole("radio", { name: "Email" }).click();
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByRole("button", { name: "Send OTP" }).click();
  await p.getByLabel("Enter OTP").waitFor();
  let code;
  for (let i = 0; i < 20 && !code; i++) { const l = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json(); code = l.messages?.[0]?.Subject.match(/^(\d{6,8}) /)?.[1]; if (!code) await sleep(500); }
  await p.getByLabel("Enter OTP").fill(code);
  await p.getByRole("button", { name: "Verify and continue" }).click();
  await p.waitForURL(/\/(onboarding|home)/);
  return p;
}

(async () => {
  const b = await chromium.launch();
  const text = async (p) => (await p.locator("body").innerText()).replace(/\s+/g, " ");

  console.log("Access");
  const anon = await (await b.newContext()).newPage();
  ok((await anon.goto(BASE + "/admin")).status() === 404, "signed-out visitor gets 404 on /admin");
  ok((await anon.goto(BASE + "/admin/feedback/export")).status() === 404, "signed-out visitor gets 404 on the CSV export");
  const support = await emailSignIn(b, `support${Date.now()}@example.com`);
  ok((await support.goto(BASE + "/admin")).status() === 404, "signed-in non-admin gets 404 on /admin");
  ok((await support.goto(BASE + "/admin/creators")).status() === 404, "…and on /admin/creators");

  console.log("Owner sign-in → admin (owner is seeded on first visit)");
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await p.goto(BASE + "/signin");
  await p.getByLabel("Mobile number").fill("98765 43210"); await p.getByRole("button", { name: "Send OTP" }).click();
  await p.getByLabel("Enter OTP").fill("482913"); await p.getByRole("button", { name: "Verify and continue" }).click(); await p.waitForURL("**/home");
  await p.goto(BASE + "/settings");
  await p.getByRole("link", { name: "Admin dashboard" }).click();
  await p.waitForURL("**/admin");
  ok(sql("select role from admins") === "owner", "owner row created in admins");
  let t = await text(p);
  for (const k of ["Total sign-ups", "Completed onboarding", "Active creators, 7 days", "Deals created (real)", "Invoices generated", "Reminders sent", "Feedback received", "Open queue items"]) ok(t.includes(k), `KPI tile: ${k}`);
  ok(t.includes("Sign-ups and active creators per day") && t.includes("Feature usage"), "charts on overview");
  ok(t.includes("Overview") && t.includes("Creators") && t.includes("Funnel") && t.includes("Queues") && t.includes("Activity") && t.includes("Settings"), "sidebar sections");

  console.log("Sample data and admins excluded by default");
  await p.goto(BASE + "/admin/activity?range=all");
  ok(!(await text(p)).includes("Ravi Teja K"), "default: the owner's own (admin) and sample activity hidden");
  await p.goto(BASE + "/admin/activity?range=all&admins=1");
  const noSample = Number((await text(p)).match(/Activity (\d+) events/)?.[1]);
  await p.goto(BASE + "/admin/activity?range=all&admins=1&sample=1");
  const withSample = Number((await text(p)).match(/Activity (\d+) events/)?.[1]);
  ok(withSample > noSample, `sample events only with the toggle (${noSample} → ${withSample})`);

  console.log("Privacy");
  const pages = ["/admin?range=all&admins=1&sample=1", "/admin/creators?range=all&admins=1", "/admin/queues?range=all&admins=1&sample=1", "/admin/activity?range=all&admins=1&sample=1", "/admin/feedback?range=all&admins=1", "/admin/settings?range=all"];
  let leaks = [];
  for (const u of pages) {
    await p.goto(BASE + u);
    const html = await p.content();
    for (const secret of ["ABCDE1234F", "50100012344417", "arjun@voltra.in", "9876543210", "HDFC0001234", "36ABCDE1234F1Z5"]) if (html.includes(secret)) leaks.push(`${u}: ${secret}`);
  }
  ok(!leaks.length, "no PAN, bank, GSTIN, brand contact or full phone in admin pages" + (leaks.length ? ` (${leaks.join(", ")})` : ""));
  const owner = sql("select id from profiles limit 1");
  await p.goto(`${BASE}/admin/creators/${owner}?admins=1`);
  t = await text(p);
  ok(t.includes("+91 98•••••210") && !t.includes("9876543210"), "phone masked on creator page");
  await p.getByRole("button", { name: "Reveal phone" }).click();
  await p.waitForSelector("text=+919876543210");
  ok(true, "owner can reveal the phone");

  console.log("Signed in but not onboarded: identified by masked email");
  const supEmail = sql("select email from auth.users where email like 'support%' limit 1");
  const supId = sql(`select id from auth.users where email='${supEmail}'`);
  const masked = supEmail[0] + "•••@example.com";
  await p.goto(BASE + "/admin/creators?range=all");
  t = await text(p);
  ok(t.includes("Not onboarded yet") && t.includes(masked) && !t.includes(supEmail), "creators table shows the masked email for a not-onboarded sign-up");
  await p.goto(BASE + "/admin/creators?range=all&q=" + encodeURIComponent(supEmail));
  ok((await text(p)).includes(masked), "search by email finds them");
  await p.goto(`${BASE}/admin/creators/${supId}`);
  ok((await text(p)).includes(masked), "creator page shows the masked email");
  await p.getByRole("button", { name: "Reveal email" }).click();
  await p.waitForSelector(`text=${supEmail}`);
  ok(Number(sql("select count(*) from admin_audit_log where action='reveal_email'")) === 1, "owner reveals the email (logged)");
  ok(Number(sql("select count(*) from admin_audit_log where action='reveal_phone'")) === 1 && Number(sql("select count(*) from admin_audit_log where action='view_creator'")) >= 1, "view and reveal are logged");

  console.log("Queues: status change notifies the creator");
  // A legal notice to work on (the owner suite's one was cleared with the sample data).
  const voltra = sql("select d.id from deals d join brands b on b.id=d.brand_id where b.name like 'Voltra%'");
  await p.goto(`${BASE}/deals/${voltra}/notice`);
  await p.getByLabel("I confirm the facts in this notice are correct").check();
  await p.getByRole("button", { name: /Send via email/ }).click();
  await p.waitForSelector("text=notice emailed");
  await p.goto(BASE + "/admin/queues?range=all&admins=1&sample=1&tab=lawyer_notice");
  t = await text(p);
  ok(t.includes("Voltra Motors") && t.includes("days") && t.includes("new"), "lawyer notice row");
  await p.getByText("Update").first().click();
  ok(!(await p.content()).includes("arjun@voltra.in") && (await text(p)).includes("Draft preview"), "draft preview without contact details");
  await p.locator(".ad-qctl select").first().selectOption("in_review");
  await p.getByLabel("Internal note").first().fill("Checking with Adv. Haritej – internal");
  await p.getByRole("button", { name: "Save" }).first().click();
  await p.waitForSelector("text=creator notified");
  ok(sql("select status||'|'||note from queue_state where kind='lawyer_notice'") === "in_review|Checking with Adv. Haritej – internal", "status and note saved");
  await p.goto(BASE + "/admin/queues?range=all&admins=1&sample=1&tab=filing");
  t = (await text(p)).toLowerCase();
  ok(t.includes("due date") && t.includes("gstr-1") && t.indexOf("gstr-1") < t.indexOf("gstr-3b"), "filing requests tab, sorted by due date");
  const creatorPage = await (await b.newContext()).newPage();
  for (const c of await p.context().cookies()) await creatorPage.context().addCookies([c]);
  await creatorPage.goto(BASE + "/home");
  t = await text(creatorPage);
  ok(t.includes("Our team is reviewing your legal notice") && !t.includes("internal"), "creator sees an in-app notice, not the internal note");
  await creatorPage.getByRole("button", { name: "Dismiss" }).first().click();
  await sleep(800); await creatorPage.reload();
  ok(!(await text(creatorPage)).includes("Our team is reviewing your legal notice"), "notice can be dismissed");

  console.log("Feedback: tag, filter, export");
  await p.goto(BASE + "/admin/feedback?range=all&admins=1");
  ok((await text(p)).includes("E2E: the brands list is great"), "feedback listed");
  await p.getByRole("button", { name: "bug", exact: true }).first().click();
  await p.waitForFunction(() => document.querySelector(".ad-tag.on"));
  await p.locator(".ad-fbctl select").first().selectOption("planned");
  await sleep(800);
  await p.goto(BASE + "/admin/feedback?range=all&admins=1&tag=bug&status=planned");
  ok((await text(p)).includes("E2E: the brands list is great"), "tag + status saved and filterable");
  const csv = await p.request.get(BASE + "/admin/feedback/export?range=all");
  const body = await csv.text();
  ok(csv.ok() && body.startsWith("created_at,creator,screen,status,tags,message") && body.includes("brands list is great") && body.includes("bug"), "CSV export");
  ok(Number(sql("select count(*) from admin_audit_log where action='export'")) === 1, "export logged");

  console.log("Settings: admins, defaults, templates, audit log");
  const supportEmail = sql("select email from auth.users where email like 'support%' limit 1");
  await p.goto(BASE + "/admin/settings");
  await p.getByLabel("Phone number or email").fill(supportEmail);
  await p.getByRole("button", { name: "Add admin" }).click();
  await p.waitForSelector("text=is now support").catch(() => {});
  ok(sql(`select a.role from admins a join auth.users u on u.id=a.user_id where u.email='${supportEmail}'`) === "support", "owner added a support admin by email");
  await p.getByLabel("GST %").fill("12");
  await p.getByRole("button", { name: "Save defaults" }).click();
  await p.waitForSelector("text=New creators start with these rates");
  ok(sql("select value->>'gst_rate' from app_settings where key='tax_defaults'") === "12", "tax defaults saved");
  await p.reload();
  ok((await text(p)).includes("Last changed by Ravi Teja K"), "'last changed by' note");
  t = await text(p);
  ok(t.includes("change status") && t.includes("reveal phone") && t.includes("export") && t.includes("view creator"), "audit log lists admin actions");

  console.log("Support role");
  await support.goto(BASE + "/admin/creators/" + owner + "?admins=1");
  t = await text(support);
  ok(t.includes("+91 98•••••210") && !(await support.getByRole("button", { name: "Reveal" }).count()) && !(await support.getByRole("button", { name: "Message on WhatsApp" }).count()), "support sees masked phone, no reveal or WhatsApp");
  await support.goto(BASE + "/admin/settings");
  ok(!(await support.getByRole("button", { name: "Add admin" }).count()) && !(await support.getByRole("button", { name: "Save defaults" }).count()), "support can't manage admins or rates");

  console.log("Phone layout");
  await p.setViewportSize({ width: 390, height: 844 });
  await p.goto(BASE + "/admin?admins=1");
  const nav = await p.locator(".ad-nav").boundingBox();
  ok(nav && nav.y > 700 && (await p.evaluate(() => document.documentElement.scrollWidth <= 392)), "bottom tabs and no sideways scroll at 390px");

  // Leave defaults as found so later suites onboard creators at the built-in rates.
  sql("delete from app_settings where key = 'tax_defaults'");
  await b.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL ADMIN CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})();
