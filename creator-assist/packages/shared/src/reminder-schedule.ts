import { nineAmIST } from "./dates";
import { stageAt } from "./messages";

/** Choices for "Remind every" in Settings, in hours. */
export const REMIND_EVERY_HOURS = [8, 12, 18, 24, 36, 48] as const;
export const DEFAULT_REMIND_EVERY = 8;
/** Payment reminders before the legal-notice prompt. */
export const REMINDER_COUNT = 3;

const H = 3600_000;
export const everyHours = (h: number | null | undefined) =>
  (REMIND_EVERY_HOURS as readonly number[]).includes(Number(h)) ? Number(h) : DEFAULT_REMIND_EVERY;

/**
 * The payment reminder ladder for an invoice: the first on the due date at 9:00 IST,
 * then one every `hours`. Stages read Friendly → Follow-up → Final notice.
 */
export function reminderSlots(dueDate: string, hours: number): { stage: string; at: string }[] {
  const start = Date.parse(nineAmIST(dueDate));
  return Array.from({ length: REMINDER_COUNT }, (_, i) => ({ stage: stageAt(i, REMINDER_COUNT), at: new Date(start + i * hours * H).toISOString() }));
}

/** When the creator should send the legal notice: one interval after the last reminder. */
export const noticeDueAt = (lastReminderAt: string, hours: number) => new Date(Date.parse(lastReminderAt) + hours * H).toISOString();

export const everyLabel = (h: number) => (h % 24 === 0 ? `${h / 24} day${h === 24 ? "" : "s"}` : `${h} hours`);
