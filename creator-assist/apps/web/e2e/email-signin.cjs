// Email sign-in sent by the app (Resend in prod, Mailpit locally): code, link in another browser, throttle.
const { chromium } = require("playwright");
const MAIL = "http://127.0.0.1:54324";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
const ok = (c, m) => { console.log((c ? "  ✓ " : "  ✗ ") + m); if (!c) failures++; };
async function lastMail(email) {
  for (let i = 0; i < 20; i++) {
    const l = await (await fetch(`${MAIL}/api/v1/search?query=to:${encodeURIComponent(email)}`)).json();
    if (l.messages?.[0]) return (await (await fetch(`${MAIL}/api/v1/message/${l.messages[0].ID}`)).json());
    await sleep(500);
  }
  throw new Error("no email for " + email);
}
async function request(page, email) {
  await page.goto("http://localhost:3000/signin");
  if (await page.getByRole("radio", { name: "Email" }).count()) await page.getByRole("radio", { name: "Email" }).click(); // hidden when SMS is off
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Send OTP" }).click();
}
(async () => {
  const b = await chromium.launch();
  const email = `link${Date.now()}@example.com`;

  console.log("New user: code by email");
  const p1 = await (await b.newContext()).newPage();
  await request(p1, email);
  await p1.getByLabel("Enter OTP").waitFor();
  const m = await lastMail(email);
  const code = m.Subject.match(/^(\d{6}) is your Creator Assist sign-in code$/)?.[1];
  ok(!!code && m.HTML.includes(code) && m.HTML.includes("/auth/confirm?token_hash="), "email has the code in subject + body and a tap-to-sign-in link");
  await p1.getByLabel("Enter OTP").fill(code);
  await p1.getByRole("button", { name: "Verify and continue" }).click();
  await p1.waitForURL("**/onboarding", { timeout: 20000 });
  ok(true, "new email signs up and lands on onboarding");

  console.log("Throttle");
  const p2 = await (await b.newContext()).newPage();
  await request(p2, email);
  await p2.waitForSelector("text=Please wait 30 seconds");
  ok(true, "second code within 30s is refused");

  console.log("Link opened in a different browser (like Gmail's in-app browser)");
  await sleep(31_000);
  await fetch(`${MAIL}/api/v1/messages`, { method: "DELETE" });
  const p3 = await (await b.newContext()).newPage();
  await request(p3, email);
  await p3.getByLabel("Enter OTP").waitFor();
  const link = (await lastMail(email)).HTML.match(/href="([^"]+\/auth\/confirm[^"]+)"/)[1].replace(/&amp;/g, "&");
  const other = await (await b.newContext()).newPage(); // fresh browser, no cookies
  await other.goto(link);
  await other.waitForURL(/\/(onboarding|home)$/, { timeout: 20000 });
  ok(true, "link signs in from a separate browser → " + new URL(other.url()).pathname);
  await other.goto(link);
  ok(other.url().includes("/home") || other.url().includes("/onboarding") || other.url().includes("error=link"), "reusing the link is harmless");

  console.log("Existing user (the demo owner) signs in by email code");
  const p4 = await (await b.newContext()).newPage();
  await request(p4, "owner@example.com");
  await p4.getByLabel("Enter OTP").waitFor();
  const oc = (await lastMail("owner@example.com")).Subject.slice(0, 6);
  await p4.getByLabel("Enter OTP").fill(oc);
  await p4.getByRole("button", { name: "Verify and continue" }).click();
  await p4.waitForURL(/\/(home|onboarding)$/, { timeout: 20000 });
  ok(true, "existing account signs in → " + new URL(p4.url()).pathname);

  await b.close();
  console.log(failures ? `\n${failures} FAILURE(S)` : "\nALL EMAIL SIGN-IN CHECKS PASSED");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
