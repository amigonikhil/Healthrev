import { test } from "node:test";
import assert from "node:assert/strict";
import { routeForUrl } from "./app-links.ts";

const o = { scheme: "creatorassist", shareKey: "creatorassistShareKey" };

test("creatorassist://deal/<id> opens the deal", () => {
  assert.equal(routeForUrl("creatorassist://deal/0b5c-11", o), "/deals/0b5c-11");
  assert.equal(routeForUrl("creatorassist://deal/0b5c-11/invoice", o), "/deals/0b5c-11/invoice");
  assert.equal(routeForUrl("creatorassist://deals/0b5c-11/reminders", o), "/deals/0b5c-11/reminders");
});

test("https links to the web app map to the same screens", () => {
  assert.equal(routeForUrl("https://creator-assist-neon.vercel.app/deals/abc", o), "/deals/abc");
  assert.equal(routeForUrl("https://creator-assist-neon.vercel.app/home", o), "/");
  assert.equal(routeForUrl("https://creator-assist-neon.vercel.app/tax/remind/b1?x=1", o), "/tax/remind/b1?x=1");
  assert.equal(routeForUrl("https://creator-assist-neon.vercel.app/deals/", o), "/deals");
});

test("pages the app doesn't have (brand signing, admin) fall back to Home", () => {
  assert.equal(routeForUrl("https://creator-assist-neon.vercel.app/s/tok123", o), "/");
  assert.equal(routeForUrl("https://creator-assist-neon.vercel.app/admin", o), "/");
  assert.equal(routeForUrl("creatorassist://something-else", o), "/");
  assert.equal(routeForUrl("not a url at all", o), "/");
});

test("notification paths and shared chats", () => {
  assert.equal(routeForUrl("/deals/d1/reminders", o), "/deals/d1/reminders");
  assert.equal(routeForUrl("creatorassist://dataUrl=creatorassistShareKey#text", o), "/deals/paste?shared=1");
});
