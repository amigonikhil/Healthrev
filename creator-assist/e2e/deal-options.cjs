// Feedback round 1: GST included / no TDS / custom payment days / any-month usage
// rights / steppers / late-payment clause. Needs local Supabase + app on :3000.
const { chromium } = require("playwright");
const MAIL = "http://127.0.0.1:54324";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };

async function otpFor(email) {
  for (let i = 0; i < 20; i++) {
    const l = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
    const m = l.messages?.[0];
    if (m) { const msg = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json(); const c = (msg.Text || msg.HTML).match(/\b(\d{6})\b/); if (c) return c[1]; }
    await sleep(500);
  }
  throw new Error("no OTP email");
}

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  page.on("pageerror", (e) => { console.log("  PAGE ERROR", e.message); failures++; });
  const text = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const email = `opts${Date.now()}@example.com`;

  await page.goto("http://localhost:3000/signin");
  await page.getByRole("radio", { name: "Email" }).click();
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

  console.log("New deal with the new options");
  await page.goto("http://localhost:3000/deals/new");
  await page.getByLabel("Brand", { exact: true }).fill("Orbit Audio");
  await page.getByLabel("Contact email").fill("ops@orbit.example");
  await page.locator("select[name=brand_state]").selectOption("Maharashtra");
  // Steppers: Reel 1 → 3 with "+", then back to 2 with "−".
  await page.getByRole("checkbox", { name: "Reel", exact: true }).check();
  await page.getByRole("button", { name: "More Reel quantity" }).click();
  await page.getByRole("button", { name: "More Reel quantity" }).click();
  await page.getByRole("button", { name: "Fewer Reel quantity" }).click();
  ok((await page.getByLabel("Reel quantity", { exact: true }).inputValue()) === "2", "stepper +/− works (Reel = 2)");
  // Per-platform groups: open YouTube and pick a Short.
  await page.locator("details.pg summary", { hasText: "YouTube" }).click();
  await page.getByRole("checkbox", { name: "Short", exact: true }).check();
  ok((await page.locator("details.pg", { hasText: "YouTube" }).locator(".n").innerText()) === "1 selected", "YouTube group shows 1 selected");
  // Usage rights: 7 months.
  await page.getByLabel("Usage rights for the brand").check();
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "More usage months" }).click();
  // GST included, ₹59,000 gross; no TDS; custom 50 days.
  await page.getByRole("radio", { name: "Incl. GST" }).click();
  ok(await page.getByLabel("Total fee, including GST (₹)").isVisible(), "fee label switches to 'including GST'");
  await page.getByLabel("Total fee, including GST (₹)").fill("59000");
  await page.getByLabel("Brand deducts TDS").uncheck();
  await page.getByRole("radio", { name: "Custom" }).click();
  await page.getByRole("textbox", { name: "payment days" }).fill("50");
  let t = await text();
  ok(t.includes("Fee before GST ₹50,000") && t.includes("IGST 18% (Maharashtra) ₹9,000") && t.includes("Invoice total ₹59,000"), "incl. GST backs out ₹50,000 + ₹9,000");
  ok(!t.includes("TDS brand deducts") && t.includes("Balance you receive ₹59,000"), "no TDS line; full ₹59,000 received");
  await page.screenshot({ path: __dirname + "/.shots/40-deal-options.png", fullPage: true });

  await page.getByRole("button", { name: "Next: review agreement" }).click();
  await page.waitForURL("**/agreement");
  t = await text();
  ok(t.includes("2 Instagram Reels and 1 YouTube Short"), "deliverables in agreement");
  ok(t.includes("₹59,000 inclusive of GST") && t.includes("payable within 50 days") && !t.includes("TDS deducted"), "fee clause: incl. GST, 50 days, no TDS line");
  ok(t.includes("use the content for 7 months"), "usage rights 7 months");
  ok(t.includes("Late payment Any amount not paid by its due date carries interest at 10% per week on the unpaid amount"), "late payment clause at 10% per week for a non-MSME creator");

  const dealUrl = page.url().replace("/agreement", "");
  await page.goto(dealUrl);
  t = await text();
  ok(t.includes("GST Included in fee") && t.includes("TDS Not deducted") && t.includes("Terms 50 days after invoice") && t.includes("7 months · included"), "deal facts");
  await page.goto(dealUrl + "/invoice");
  await page.getByRole("button", { name: "Generate invoice" }).click();
  await page.waitForSelector("text=Download PDF");
  t = await text();
  ok(t.includes("Taxable value ₹50,000") && t.includes("IGST 18% ₹9,000") && t.includes("Total ₹59,000"), "invoice: taxable 50,000 + IGST 9,000 = 59,000");
  const pdf = await page.request.get("http://localhost:3000" + (await page.getByRole("link", { name: "Download PDF" }).getAttribute("href")));
  ok(pdf.status() === 200, "invoice PDF renders");

  console.log("Settings: late interest rate is editable");
  await page.goto("http://localhost:3000/settings");
  await page.getByLabel("Late payment interest in agreements (%)").fill("24");
  await page.getByLabel("Charged").selectOption("year");
  await page.getByLabel("Legal fee claimed in lawyer notices (₹)").fill("7500");
  await page.getByRole("button", { name: "Save rates" }).click();
  await page.waitForSelector("text=Rates saved");
  await page.reload();
  ok((await page.getByLabel("Late payment interest in agreements (%)").inputValue()) === "24", "late interest saved");
  ok((await page.getByLabel("Charged").inputValue()) === "year", "interest period saved");
  ok((await page.getByLabel("Legal fee claimed in lawyer notices (₹)").inputValue()) === "7500", "legal fee saved");

  console.log("Settings: remind every N hours");
  const every = page.getByLabel("Remind brands every");
  ok((await every.inputValue()) === "8", "default: every 8 hours");
  ok(JSON.stringify(await every.locator("option").allTextContents()) === JSON.stringify(["8 hours", "12 hours", "18 hours", "24 hours", "36 hours", "48 hours"]), "choices 8/12/18/24/36/48 hours");
  ok((await text()).includes("3 reminders from the due date (9:00 AM), then we prompt you to send the legal notice."), "explains 3 reminders then legal notice");
  await every.selectOption("24");
  await page.getByRole("button", { name: "Save reminders" }).click();
  await page.waitForSelector("text=Reminder settings saved");
  await page.reload();
  ok((await page.getByLabel("Remind brands every").inputValue()) === "24", "interval saved");

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL DEAL-OPTION CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
