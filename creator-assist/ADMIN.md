# Creator Assist — Admin dashboard (ADMIN.md)

Build an internal admin dashboard at `/admin` for the beta. It answers four questions every day:

1. **Are creators signing up and actually using the app?**
2. **Where do they get stuck?**
3. **What feedback are they giving?**
4. **What requests need a human?** (lawyer notices, AI call bookings, filing requests)

Read CLAUDE.md and DESIGN.md first. Do not change any creator-facing screen or flow.

---

## 1. Access and security (build this first)

- Create an `admins` table (`user_id`, `role`: `owner` | `support`, `created_at`). Seed it with the user whose phone equals `DEMO_OWNER_PHONE` as `owner`.
- Protect every `/admin` route and admin API route on the **server**: check that the signed-in user is in `admins`. Non-admins get a 404, not a "forbidden" page.
- Admin queries run in server-side code only. Never expose the Supabase service-role key to the browser.
- **Privacy:**
  - PAN, bank details, GSTIN and brand contact details are never shown in admin. Show masked values only (••••4417).
  - Phone numbers are masked (+91 98•••••210) with a "Reveal" button for `owner` only.
  - Deal amounts are shown as totals and ranges, not per-brand detail, unless an admin opens a support ticket for that creator.
- Log every admin action (view creator, reveal phone, change status, export) to `admin_audit_log` with admin ID, action, target and time.
- Admins cannot edit a creator's deals, invoices or payments. They can only change the status of queue items (section 6).

---

## 2. Layout

- Desktop-first (admins work on a laptop), but usable on a phone.
- Left sidebar on desktop, bottom tabs on mobile.
- Apply the Bold Creator tokens from DESIGN.md, toned down for long reading: dark surface, coral for primary actions, yellow for warnings, readable 14–16px text, tables with clear row separators.
- A date range picker at the top of every page: Today, 7 days, 30 days, All time, and Custom.
- Every number on a page links to the list behind it.

Sidebar: **Overview, Creators, Funnel, Feedback, Queues, Activity, Settings**.

---

## 3. Overview (home)

**Top row of KPI tiles** (each shows the value and the change versus the previous period):
- Total sign-ups
- Completed onboarding
- Active creators, 7 days (did at least one action: added a deal, sent a reminder, recorded a payment, opened the Tax hub)
- Deals created (real, excluding sample data)
- Invoices generated
- Reminders sent (WhatsApp clicks + emails)
- Feedback received (with an "unread" count)
- Open queue items (needs a human)

**Charts:**
- Sign-ups and active creators per day (line chart)
- Feature usage: bar chart of how many creators used each feature (new deal, agreement sent, agreement signed by brand, invoice, reminder, payment recorded, escalation opened, Tax hub visited, AIS uploaded, filing option chosen)

**Lists:**
- Latest 5 feedback items with screen name
- Queue items waiting the longest

---

## 4. Creators

**Table** with search and filters (onboarded / not onboarded, active / inactive, using sample data / real data):

| Name | Handle | Signed up | Onboarded | Last active | Real deals | Sample data | Feedback count |
|---|---|---|---|---|---|---|---|

Clicking a row opens the **creator detail page**:
- Profile basics (name, handle, city, state; masked phone)
- Timeline of their key actions (signed up, onboarded, first deal, first reminder, etc.)
- Feature usage checklist (which features they've tried)
- Their feedback
- Their queue items
- Buttons: "Message on WhatsApp" (opens `wa.me` with a friendly check-in message) and "Copy email"

---

## 5. Funnel

A step-by-step drop-off chart showing how many creators reached each step and the % lost between steps:

1. Opened the sign-in screen
2. Requested an OTP
3. Signed in
4. Completed onboarding
5. Loaded sample data **or** created a real deal
6. Created a real deal
7. Sent an agreement
8. Generated an invoice
9. Sent a reminder
10. Recorded a payment

Also show:
- Median time between steps 3 → 4 and 4 → 6
- Top 5 screens where sessions end most often
- OTP success rate (OTP requested vs verified), split by SMS and email

---

## 6. Queues (requests that need a human)

Tabs: **Lawyer notices · AI call bookings · Filing requests · AIS uploads**. Each tab has a table with status filters and the time each item has been waiting.

Statuses: `new`, `in_review`, `done`, `rejected`. Admins can change status and add an internal note. Changing status notifies the creator in-app.

- **Lawyer notices:** creator, brand name, amount, days overdue, draft preview, created time.
- **AI call bookings:** creator, slot, language, consent given (yes/no), status.
- **Filing requests:** creator, filing type (GSTR-1, GSTR-3B, advance tax, ITR), period, due date, handled by (Creator Assist / own CA), data sent date. **Sort by due date**, and highlight anything due within 7 days.
- **AIS uploads:** creator, FY, upload date, parsed successfully (yes/no), mismatches found.

Show a badge count on the sidebar for items in `new`.

---

## 7. Feedback

- Inbox-style list: creator, screen, message, time, status (`new`, `seen`, `planned`, `done`, `wont_do`), and tags.
- Filters by screen, status and tag.
- Admins can tag feedback (bug, confusing, feature request, design, praise) and change its status.
- A chart of feedback count by screen, so it's obvious which screens confuse people most.
- "Export CSV" button.

---

## 8. Activity

A live feed of key events across all creators (newest first): signed up, onboarded, deal created, agreement signed, invoice sent, reminder sent, payment recorded, escalation opened, feedback sent. Filter by event type and creator. Sample-data events are hidden by default with a toggle to show them.

---

## 9. Settings

- Manage admins (owner only): add by phone number, remove, change role.
- Edit `tax_config` values (GST %, TDS %, RBI bank rate, MSME multiple), with a "last changed by" note. Changes are logged.
- Edit reminder message templates (English, Telugu-English, Hinglish).
- View `admin_audit_log`.

---

## 10. Data and tracking

Create an `events` table: `id, user_id, event_name, screen, properties (jsonb), is_sample, created_at`.

- Log events server-side where possible (deal created, invoice generated, payment recorded), and client-side for screen views and button clicks (sign-in opened, OTP requested, WhatsApp reminder link clicked).
- Mark events from sample data with `is_sample = true`, and exclude them from every metric by default.
- **Exclude admins' own activity** from all metrics by default, with a toggle to include it.
- Add database indexes on `events(event_name, created_at)` and `events(user_id, created_at)`.
- Keep raw events for 12 months.

---

## 11. Done when

- [ ] Only users in `admins` can open `/admin`; everyone else gets a 404.
- [ ] Overview, Creators, Funnel, Feedback, Queues, Activity and Settings all work with real data.
- [ ] Sample data and admin activity are excluded from metrics by default.
- [ ] PAN, bank and brand contact details never appear in admin; phone numbers are masked.
- [ ] Changing a queue item's status notifies the creator.
- [ ] Every admin action is written to `admin_audit_log`.
- [ ] Feedback can be tagged, filtered and exported as CSV.
- [ ] Works on a laptop and on a phone.
- [ ] Deploy to a Vercel **preview** URL first for review before merging to production.
