import { test } from "node:test";
import assert from "node:assert/strict";
import { everyHours, noticeDueAt, reminderSlots } from "./reminder-schedule.ts";

test("3 reminders every N hours from 9:00 IST on the due date, then the legal notice", () => {
  const s = reminderSlots("2026-10-08", 8);
  assert.deepEqual(s.map((x) => x.stage), ["friendly", "follow_up", "final"]);
  assert.deepEqual(s.map((x) => x.at), ["2026-10-08T03:30:00.000Z", "2026-10-08T11:30:00.000Z", "2026-10-08T19:30:00.000Z"]);
  assert.equal(noticeDueAt(s[2].at, 8), "2026-10-09T03:30:00.000Z");
  assert.equal(reminderSlots("2026-10-08", 48)[2].at, "2026-10-12T03:30:00.000Z");
});

test("only the offered intervals are used; anything else falls back to 8 hours", () => {
  for (const h of [8, 12, 18, 24, 36, 48]) assert.equal(everyHours(h), h);
  assert.equal(everyHours(7), 8);
  assert.equal(everyHours(null), 8);
});
