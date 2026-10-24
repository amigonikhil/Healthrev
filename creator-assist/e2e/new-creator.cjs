// End-to-end check of a new creator: email OTP sign-up → onboarding → deal → sign → invoice → payment → AIS → delete.
// Needs local Supabase (mailpit on :54324) and the app on :3000.
const { chromium } = require("playwright");
const SHOTS = __dirname + "/.shots/";
require("fs").mkdirSync(SHOTS, { recursive: true });
const BASE = "http://localhost:3000";
const MAIL = "http://127.0.0.1:54324";
let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function otpFor(email) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
    const m = list.messages?.[0];
    if (m) {
      const msg = await (await fetch(`${MAIL}/api/v1/message/${m.ID}`)).json();
      const code = (msg.Text || msg.HTML).match(/\b(\d{6})\b/);
      if (code) return code[1];
    }
    await sleep(500);
  }
  throw new Error("no OTP email");
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, colorScheme: "dark" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log("  PAGE ERROR", e.message); failures++; });
  const text = async () => (await page.locator("main").innerText()).replace(/\s+/g, " ");
  const shot = (n) => page.screenshot({ path: SHOTS + n + ".png", fullPage: true });
  const email = `priya${Date.now()}@example.com`;

  console.log("Sign up by email OTP");
  await page.goto(BASE + "/signin");
  await page.getByRole("radio", { name: "Email" }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send OTP" }).click();
  await page.getByLabel("Enter OTP").waitFor();
  await page.getByLabel("Enter OTP").fill(await otpFor(email));
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await page.waitForURL("**/onboarding", { timeout: 30000 });
  ok(true, "new user lands on onboarding");

  console.log("Onboarding");
  await page.getByLabel("Instagram / YouTube handle").fill("priyabakes");
  await page.getByLabel("Mobile number").fill("+91 99999 11111");
  await page.getByLabel("City").fill("Bengaluru");
  await shot("20-onboard-1-dark");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name (as on PAN)").fill("Priya Sharma");
  await page.getByLabel("PAN", { exact: true }).fill("ABCPS1234Q");
  await page.locator("select[name=state]").selectOption("Karnataka");
  await page.getByLabel("GSTIN (if registered)").fill("36ABCPS1234Q1Z5"); // wrong state on purpose
  await page.getByLabel("Bank account").fill("123456789012");
  await page.getByLabel("IFSC").fill("ICIC0001234");
  await page.getByLabel(/I consent/).check();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForSelector("text=but Karnataka is 29");
  ok((await page.getByLabel("Full name (as on PAN)").inputValue()) === "Priya Sharma", "validation error keeps typed values");
  await page.getByLabel("GSTIN (if registered)").fill("29ABCPS1234Q1Z5");
  await page.getByRole("button", { name: "Finish setup" }).click();
  await page.waitForURL("**/home", { timeout: 20000 });
  let t = await text();
  ok(t.includes("Hi, Priya") && t.includes("No deals yet") && t.includes("Try with sample data"), "empty dashboard for new creator");
  await shot("21-home-empty-dark");

  console.log("New deal: deliverables, usage rights, advance");
  await page.getByRole("link", { name: "Add your first deal" }).click();
  await page.getByLabel("Brand", { exact: true }).fill("Nimbus Shoes");
  await page.getByLabel("Brand contact").fill("Rahul Verma");
  await page.getByLabel("Contact email").fill("rahul@nimbus.example");
  await page.getByLabel("Contact WhatsApp").fill("+91 90000 55555");
  await page.locator("select[name=brand_state]").selectOption("Maharashtra");
  await page.locator("label", { hasText: /^ Reel/ }).first().locator("input[type=checkbox]").check();
  await page.getByLabel("Reel quantity", { exact: true }).fill("2");
  await page.locator("label", { hasText: /^ Story/ }).first().locator("input[type=checkbox]").check();
  await page.getByLabel("Story quantity", { exact: true }).fill("3");
  await page.getByLabel("Usage rights for the brand").check();
  await page.locator("select[name=usage_duration]").selectOption("6m");
  await page.getByLabel("Total fee, before GST (₹)").fill("60000");
  await page.getByLabel("Brand pays an advance").check();
  await page.getByLabel("Advance amount (₹)").fill("20000");
  await page.getByLabel("Advance already received").check();
  t = await text();
  ok(t.includes("IGST 18% (Maharashtra) ₹10,800") && t.includes("Invoice total ₹70,800") && t.includes("Advance received − ₹20,000") && t.includes("− ₹6,000"), "live summary");
  ok(t.includes("Balance you receive ₹44,800"), "balance you receive 70,800 − 20,000 − 6,000 = 44,800");
  ok(t.includes("Deliverables · 2 Reels, 3 Stories"), "deliverables summary in collapsible header");
  await shot("22-new-deal-dark");
  await page.getByRole("button", { name: "Next: review agreement" }).click();
  await page.waitForURL("**/agreement");
  t = await text();
  ok(t.includes("2 Instagram Reels and 3 Instagram Stories for Nimbus Shoes"), "agreement deliverables clause");
  ok(t.includes("₹60,000 plus GST for all deliverables and usage rights. An advance of ₹20,000 is payable on signing"), "agreement fee/advance clause");
  ok(t.includes("for 6 months, including organic reshares and paid ads, at no extra fee"), "usage clause");
  ok(t.includes("courts in Bengaluru"), "governing law uses creator city");
  await page.getByRole("button", { name: "Send for e-sign" }).click();
  await page.waitForSelector("text=Open WhatsApp to send");
  const waA = await page.getByRole("link", { name: "Open WhatsApp to send" }).getAttribute("href");
  ok(waA.startsWith("https://wa.me/919000055555") && decodeURIComponent(waA).includes("/s/"), "WhatsApp link carries signing URL");
  console.log("    toast:", await page.locator(".toast").innerText());
  const link = await page.getByRole("link", { name: "Preview what the brand sees" }).getAttribute("href");

  console.log("Brand signs (real email OTP via mailpit)");
  const b = await (await browser.newContext({ viewport: { width: 375, height: 812 } })).newPage();
  await b.goto(link);
  await b.getByLabel("Your name").fill("Rahul Verma");
  await b.getByLabel("Designation").fill("Brand Lead");
  await b.getByRole("button", { name: "Send OTP to email" }).click();
  await b.waitForSelector("p[role=status]");
  const st = await b.locator("p[role=status]").innerText();
  const code = st.match(/(\d{6})/)?.[1];
  ok(!!code, "OTP issued: " + st);
  await b.getByLabel("Email OTP").fill(code);
  await b.getByLabel(/I accept on behalf of/).check();
  await b.getByRole("button", { name: "Accept and sign" }).click();
  await b.waitForSelector("text=Agreement signed", { timeout: 20000 });
  ok(true, "brand signed");

  console.log("Invoice + payment");
  const dealUrl = page.url().replace("/agreement", "");
  await page.goto(dealUrl);
  t = await text();
  ok(t.includes("Agreement signed · not invoiced"), "deal shows signed");
  await page.goto(dealUrl + "/invoice");
  await page.getByRole("button", { name: "Generate invoice" }).click();
  await page.waitForSelector("text=Download PDF");
  t = await text();
  const year = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const fy = `${year}-${String((year + 1) % 100).padStart(2, "0")}`;
  ok(t.includes(`PS/${fy}/001`), `first invoice numbered PS/${fy}/001`);
  ok(t.includes("Instagram Reel × 2 · SAC 998361 ₹48,000") && t.includes("Instagram Story × 3 · SAC 998361 ₹12,000") && t.includes("Usage rights, 6 months · SAC 998361 Included"), "lines");
  ok(t.includes("IGST 18% ₹10,800") && t.includes("₹70,800") && t.includes("− ₹20,000") && t.includes("₹50,800"), "invoice total / advance / balance due 50,800");
  await shot("23-invoice-dark");
  await page.goto(dealUrl + "/reminders");
  ok((await text()).includes("Friendly ·") && (await text()).includes("Final notice ·"), "ladder scheduled on invoice");
  await page.goto(dealUrl + "/payment");
  await page.getByLabel("Amount received in bank (₹)").fill("20000");
  await page.getByLabel("TDS deducted by brand (₹)").fill("0");
  ok((await text()).includes("₹30,800 · partly paid"), "partial payment preview");
  await page.getByRole("button", { name: "Save payment" }).click();
  await page.waitForURL("**/paid**");
  ok((await text()).includes("₹30,800 is still due"), "partial payment recorded");
  await page.goto(dealUrl + "/payment");
  ok((await page.getByLabel("Amount received in bank (₹)").inputValue()) === "24800" && (await page.getByLabel("TDS deducted by brand (₹)").inputValue()) === "6000", "remaining split 24,800 + 6,000 TDS");
  await page.getByRole("button", { name: "Save payment" }).click();
  await page.waitForURL("**/paid**");
  ok((await text()).includes("Nimbus Shoes is marked paid"), "fully paid");
  await page.goto(BASE + "/tax");
  t = await text();
  ok(t.includes("₹60,000") && t.includes("₹10,800") && t.includes("₹6,000") && t.includes("Nimbus Shoes TDS ₹6,000 not in AIS"), "tax hub reflects payment + mismatch");
  await shot("24-tax-dark");

  console.log("AIS upload matches");
  const fs = require("fs");
  const f = SHOTS + "ais-sample.json";
  fs.writeFileSync(f, JSON.stringify({ TDS: [{ "Information Source": "NIMBUS SHOES PRIVATE LIMITED (MUMN12345A)", "TDS Deducted": "6,000.00" }] }));
  await page.getByRole("button", { name: "Update AIS" }).click();
  await page.getByLabel("AIS JSON file").setInputFiles(f);
  await page.getByRole("button", { name: "Upload AIS" }).click();
  await page.waitForSelector("text=AIS updated");
  console.log("    ", await page.locator("p.info[role=status]").innerText());
  await page.reload();
  t = await text();
  ok(t.includes("No TDS mismatches") && t.includes("All matched"), "uploaded AIS clears the mismatch");

  console.log("Settings + delete account");
  await page.goto(BASE + "/settings");
  t = await text();
  ok(t.includes("ABCPS••••Q") && t.includes("ICICI ••9012"), "masked PAN/bank for real user");
  ok(!t.includes("Tester feedback"), "admin link hidden for non-owner");
  const adm = await page.goto(BASE + "/admin/feedback");
  ok(adm.status() === 404, "non-owner gets 404 on /admin/feedback");
  await page.goto(BASE + "/settings");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL("**/signin", { timeout: 20000 });
  ok(true, "account deleted, signed out");

  await browser.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL NEW-CREATOR CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
