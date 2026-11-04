// Screenshots of every screen at 390px, light and dark, for visual review.
// Run against a fresh `supabase db reset` with the app on :3000: node e2e/screens.cjs
const { chromium } = require("playwright");
const { execSync } = require("child_process");
const OUT = __dirname + "/.shots/screens/";
require("fs").mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const sql = (q) => execSync(`docker exec supabase_db_creator-assist psql -U postgres -tAc "${q}"`).toString().trim();

(async () => {
  const browser = await chromium.launch();
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
    const page = await ctx.newPage();
    // Full-page shots would paint the sticky tab/action bars mid-page, so they're unpinned for these; 35-deal-actionbar shows them pinned.
    const shot = async (name) => { await page.addStyleTag({ content: ".nav,.actbar{position:static!important}" }); await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}${name}-${scheme}.png`, fullPage: true }); };
    await page.goto(BASE + "/signin"); await shot("01-signin");
    await page.getByLabel("Mobile number").fill("98765 43210");
    await page.getByRole("button", { name: "Send OTP" }).click();
    await shot("02-signin-otp");
    await page.getByLabel("Enter OTP").fill("482913");
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await page.waitForURL("**/home");
    const deal = (brand) => sql(`select d.id from deals d join brands b on b.id=d.brand_id where b.name like '${brand}%' limit 1`);
    const voltra = deal("Voltra"), urban = deal("Urban"), zen = deal("Zenvolt"), fit = deal("FitFuel");
    const token = sql(`select sign_token from agreements where deal_id='${urban}'`);
    const fitBrand = sql(`select brand_id from deals where id='${fit}'`);
    const routes = [
      ["03-home", "/home"], ["04-deals", "/deals"], ["05-deals-overdue", "/deals?f=over"], ["06-new-deal", "/deals/new"],
      ["07-deal", `/deals/${voltra}`], ["08-agreement", `/deals/${voltra}/agreement`], ["09-agreement-send", `/deals/${urban}/agreement`],
      ["10-invoice", `/deals/${voltra}/invoice`], ["11-reminders", `/deals/${voltra}/reminders`], ["12-payment", `/deals/${voltra}/payment`],
      ["13-escalate", `/deals/${voltra}/escalate`], ["14-notice", `/deals/${voltra}/notice`], ["15-legal-call", `/deals/${voltra}/legal-call`],
      ["16-deal-paid", `/deals/${zen}`], ["17-brands", "/brands"], ["18-tax", "/tax"], ["19-tax-file", "/tax/file"],
      ["20-tds-remind", `/tax/remind/${fitBrand}`], ["21-settings", "/settings"], ["22-admin-feedback", "/admin/feedback"],
      ["23-legal-booked", `/deals/${voltra}/legal-call/booked`], ["24-filing-booked", "/tax/file/booked"],
      ["28-about", "/about"], ["29-deal-due", `/deals/${fit}`], ["30-deal-sign", `/deals/${urban}`], ["31-invoice-preview", `/deals/${urban}/invoice`],
      ["32-deals-paid", "/deals?f=paid"],
    ];
    for (const [name, url] of routes) { await page.goto(BASE + url); await shot(name); }
    await page.goto(BASE + "/deals/new");
    await page.getByRole("button", { name: "Feedback" }).click(); await shot("25-feedback-sheet");
    await page.goto(BASE + "/tax");
    await page.getByRole("button", { name: "What is GST?" }).click(); await page.screenshot({ path: `${OUT}33-help-gst-${scheme}.png` });
    await page.goto(BASE + "/settings");
    await page.getByRole("button", { name: "Preview what the brand sees" }).click();
    await page.getByRole("region", { name: "What the brand sees" }).scrollIntoViewIfNeeded();
    await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}34-settings-preview-${scheme}.png` });
    await page.goto(BASE + `/deals/${voltra}`); await page.mouse.wheel(0, 300); await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}35-deal-actionbar-${scheme}.png` });
    const anon = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
    const bp = await anon.newPage();
    await bp.goto(`${BASE}/s/${token}`); await bp.waitForTimeout(250);
    await bp.screenshot({ path: `${OUT}26-brand-sign-${scheme}.png`, fullPage: true });
    await anon.close(); await ctx.close();
  }
  // Onboarding + empty home: a brand-new account (email sign-in via Mailpit).
  for (const scheme of ["dark", "light"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: scheme });
    const page = await ctx.newPage();
    const email = `shots-${scheme}-${Date.now()}@example.com`;
    await page.goto(BASE + "/signin");
    if (await page.getByRole("radio", { name: "Email" }).count()) await page.getByRole("radio", { name: "Email" }).click(); // hidden when SMS is off
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Send OTP" }).click();
    await page.getByLabel("Enter OTP").waitFor();
    let code;
    for (let i = 0; i < 20 && !code; i++) {
      const l = await (await fetch("http://127.0.0.1:54324/api/v1/search?query=to:" + encodeURIComponent(email))).json();
      code = l.messages?.[0]?.Subject.match(/^(\d{6,8}) /)?.[1];
      if (!code) await page.waitForTimeout(500);
    }
    await page.getByLabel("Enter OTP").fill(code);
    await page.getByRole("button", { name: "Verify and continue" }).click();
    await page.waitForURL("**/onboarding**", { timeout: 20000 });
    await page.screenshot({ path: `${OUT}27-onboarding-${scheme}.png`, fullPage: true });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForTimeout(250); await page.screenshot({ path: `${OUT}27b-onboarding-bank-${scheme}.png`, fullPage: true });
    await ctx.close();
  }
  await browser.close();
  console.log("done");
})();
