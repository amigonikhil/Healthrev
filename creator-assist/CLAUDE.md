# Creator Assist — Beta build (CLAUDE.md)

You are building a **mobile-first web app** for Indian content creators to track paid brand collabs, chase payments and stay tax-ready. This build is a **beta for UI/UX testing with real creators**, deployed on Vercel.

The approved design is `design/prototype.html` (a single-file clickable prototype). **Match its screens, copy, layout, colours and flow exactly.** Open it in a browser before you start and treat it as the source of truth for UI.

---

## 1. Beta goals

1. A Vercel URL that any creator can open on their phone and sign up with their own mobile number.
2. **The owner's account** (phone number from env `DEMO_OWNER_PHONE`) is automatically filled with the sample data from the prototype, using the owner's real name and details from env vars, so they can demo the full app.
3. **Every other account** starts empty, goes through onboarding and works for real: add deals, generate invoices, send reminders, record payments.
4. Any creator can tap **"Try with sample data"** on an empty dashboard to load the demo set into their own account, and **"Clear sample data"** in Settings to remove it.
5. A **Feedback** button on every screen so testers can send comments.

---

## 2. Stack

- Next.js (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth, Storage, Row Level Security. Create the project in the **Mumbai (ap-south-1)** region.
- Vercel for hosting (+ Vercel Cron for scheduled reminders)
- Resend for email
- PDFs generated server-side (`@react-pdf/renderer`)
- Font: Plus Jakarta Sans. Agreement body: Georgia/serif.
- Support light and dark mode using the CSS variables in the prototype.

Mobile-first: design for 375–430px width. On desktop, show the app centred at max-width 430px like the prototype.

---

## 3. Ground rules

- Money is stored as integers in **paise**. Format with `en-IN` (₹1,00,300).
- **No hardcoded tax rates.** Read GST %, TDS %, RBI bank rate and MSME multiple from a `tax_config` table, editable in Settings. Mark tax logic with `// VERIFY WITH CA`.
- RLS on every table: a user can only read and write their own rows.
- Encrypt PAN and bank account numbers at rest. Show them masked (ABCDE••••F, ••4417).
- Consent checkbox at onboarding. Settings must offer "Export my data" and "Delete my account".
- Write important actions to an `audit_log` table: agreement viewed, signed, reminder sent, payment recorded.
- **The app never sends a legal notice automatically.** The lawyer-notice flow only creates a draft in a review queue.
- **Beta labels:** anything not live (lawyer notice, GST/ITR filing, AI call) must create a real database record and show a success screen, plus a small "Beta: not actually filed/sent" note on the confirmation.

---

## 4. Authentication

- **Primary: phone number + OTP** via Supabase Auth. Use Twilio Verify (or MSG91) as the SMS provider.
  - Indian SMS needs DLT-registered templates. If SMS isn't ready on day one, ship email OTP as a fallback on the sign-in screen (the prototype already has a Mobile/Email toggle).
- Add the owner's number as a **Supabase test phone number with a fixed OTP** so demos never depend on SMS delivery.
- After first sign-in, new users go to Onboarding. Returning users go to Home.

---

## 5. Owner demo account (seeding)

Environment variables:

```
DEMO_OWNER_PHONE=+91XXXXXXXXXX
DEMO_OWNER_NAME=
DEMO_OWNER_HANDLE=
DEMO_OWNER_EMAIL=
DEMO_OWNER_CITY=Hyderabad
DEMO_OWNER_STATE=Telangana
```

- When a profile is created and its phone equals `DEMO_OWNER_PHONE`, run `seedDemoData(userId, owner)`.
- The same seed function powers the "Try with sample data" button for other users, using their own profile name instead.
- All seeded rows have `is_sample = true` so "Clear sample data" deletes only those rows.
- The seed must be **idempotent**: running it twice must not duplicate data.
- Use sample PAN/GSTIN/Udyam/bank values (not the owner's real ones) unless the owner enters real ones in Settings.

**Seed data** (copy from the prototype; dates are relative to "today" so the demo always looks current):

| Brand | Paid by | Deliverables | Fee | Advance | Status |
|---|---|---|---|---|---|
| Voltra Motors (Bengaluru, KA) | Brand | 2 Reels, 3 Stories, usage 3 months | ₹45,000 + 18% IGST | ₹15,000 received | Balance ₹38,100 overdue 18 days, 3 reminders sent |
| Glow Labs | Spark Agency | 1 Reel, 3 Stories | ₹28,000 + IGST | none | Due today |
| FitFuel Foods (Hyderabad, TS) | Brand | 1 Reel, 2 Stories | ₹12,000 + CGST/SGST | none | Due in 4 days |
| Urban Roots Cafe | Brand | 1 Reel | ₹15,000 | none | Agreement sent, awaiting signature |
| Zenvolt Chargers | Brand | 1 Reel | ₹25,000 + IGST | none | Paid, ₹2,500 TDS |

Also seed: Voltra's signed agreement and timeline, invoice numbers `PREFIX/2026-27/011–015`, AIS entries matching Zenvolt and Glow Labs only (so Voltra and FitFuel show as TDS mismatches).

---

## 6. Data model

`profiles` — name, handle, phone, email, address, state + state code, PAN (encrypted), GSTIN, Udyam no., bank (encrypted), UPI, invoice prefix, default terms, reminder settings, language.

`brands` — name, legal name, GSTIN, state, contact name/email/WhatsApp, `agency_name` (nullable).

`deals` — brand_id, `paid_by` (`brand` | `agency`), fee, `advance_amount`, `advance_received_at`, go-live date, payment terms (days), status, `is_sample`.

`deal_deliverables` — deal_id, platform, type, quantity. Types (menu):
- Instagram: Reel, Story, Static post, Carousel, Collab post, Live session
- YouTube: Dedicated video, Integration (60–90 sec), Short, Community post, Live stream
- Other: Facebook Reel, LinkedIn post, X post, Snapchat Story, Moj/Josh video
- Add-ons: Link in bio (days), Pinned comment, Raw footage, Event appearance

`usage_rights` — deal_id, enabled, duration (1/3/6/12 months/perpetual), scope (organic + paid ads / organic only / paid ads only). **Always included in the fee**; no separate price.

`agreements` — deal_id, body (rendered from the single "Paid collab" template), sign token, status, signer name, designation, signed_at, IP, WhatsApp opt-in.

`invoices` — deal_id, number, dates, taxable value, CGST/SGST/IGST, total, **advance deducted**, balance due, PDF path.

`payments` — invoice_id, amount received, TDS deducted, date, UTR.

`reminders` — deal_id or brand_id, kind (`payment` | `tds`), stage, channel, language, scheduled_at, sent_at, read_at.

`escalations` — deal_id, type (final reminder / lawyer notice / MSME Samadhaan), draft, status.

`ais_entries` — user_id, FY, deductor name, TAN, amount, source (upload).

`filings` — user_id, type (GSTR-1, GSTR-3B, advance tax, ITR), period, due date, handled_by (`creator_assist` | `own_ca`), status, data_sent_at.

`ai_call_bookings` — user_id, slot, language, phone, consent, status.

`feedback` — user_id, screen, message, created_at.

`tax_config`, `audit_log`.

Deal status enum: `draft, agreement_sent, agreed, in_progress, live, invoiced, overdue, escalated, partially_paid, paid`.
**Paid collabs only. No barter.**

---

## 7. Screens (match the prototype)

Bottom tab bar: **Home, Deals, Brands, Tax, Settings** (hidden on sign-in, onboarding and the brand signing page).

1. **Sign in:** phone OTP (email fallback).
2. **Onboarding:** name, PAN, state, GSTIN (optional), Udyam (optional), bank, UPI, consent.
3. **Home:** "money owed" hero card, due-this-week and TDS tiles, "Needs attention" list. Empty state with "Add your first deal" and "Try with sample data".
4. **Deals:** filter chips (All / Overdue / Awaiting pay / To sign / Paid) that actually filter, list of deals.
5. **New paid collab:**
   - Brand fields and the brand-direct / agency toggle.
   - Collapsible deliverables menu with checkboxes and quantities.
   - Usage rights checkbox; when ticked, show duration and scope dropdowns ("Included in your fee").
   - Total fee field.
   - Advance toggle with amount and "already received".
   - Go-live date, terms (30/45/60).
   - **Live summary:** fee, GST (IGST or CGST+SGST from states), invoice total, advance, TDS estimate, balance.
6. **Agreement:** single paid-collab template filled from the deal (including the advance and usage clauses), send by email and WhatsApp.
7. **Brand signing page (public, `/s/[token]`):** agreement, name, designation, email OTP, accept checkbox, WhatsApp opt-in. Then a signed confirmation. Email a PDF copy to both parties.
8. **Deal detail:** balance card with the advance shown, MSME interest estimate, deal facts, four actions, timeline.
9. **Invoice:** GST tax invoice with an "advance received" line and balance due. Download PDF, send again.
10. **Reminders:**
    - Ladder status.
    - Language toggle (English / Telugu-English / Hinglish) that rewrites the message.
    - MSME mention toggle, CC toggle.
    - "Send on WhatsApp" opens a `wa.me` link with the text prefilled.
    - Email sends via Resend.
11. **Record payment:** amount received plus TDS, with the balance calculated after the advance. Saving cancels pending reminders.
12. **Escalate:** interest estimate and three options. Lawyer notice leads to a draft review, then a "sent for review" screen (beta).
13. **Tax hub:**
    - Four tiles: Income, GST collected, TDS by brands, TDS in AIS (with the missing amount).
    - "Needs your action" lists brands whose TDS is missing from AIS, each with Remind (TDS reminder flow).
    - "Update AIS" upload: accept the AIS JSON; parse it if feasible, otherwise store the file and match manually.
    - "Who files for you" toggle (Creator Assist / own CA).
    - "Coming up" filing cards with due dates and data-sent status.
14. **TDS reminder:** same pattern as payment reminders, with the TDS-specific message.
15. **File with us:** how it works, AI call slot picker, language, consent, then "booked" (beta: stores a booking only).
16. **Brands:** list with contact, payment behaviour and status.
17. **Settings:** profile, tax and bank, reminder ladder, rates, clear sample data, export, delete, log out.

---

## 8. Calculations

- GST: IGST if the brand's state differs from the creator's, otherwise CGST + SGST. Rate from `tax_config`.
- Invoice total = fee + GST. Balance due = total − advance received.
- TDS estimate = fee × TDS % (on the fee, not the GST).
- Amount creator receives = balance due − TDS.
- MSME interest = unpaid balance × (multiple × RBI bank rate) for the days overdue, compounded monthly.
- Invoice numbering: `PREFIX/YYYY-YY/NNN`, restarting each financial year (April).

---

## 9. Reminders

- WhatsApp: **click-to-send only** (`https://wa.me/<number>?text=<encoded>`). No WhatsApp automation libraries.
- Email: automatic via Resend at each ladder stage, run by a daily Vercel Cron.
- Creator gets an email or in-app notice when a WhatsApp reminder is due to be sent.

---

## 10. Beta extras

- **Feedback button** (floating, every screen): opens a sheet and saves `{screen, message}` to `feedback`.
- Admin page `/admin/feedback`, visible only to `DEMO_OWNER_PHONE`, listing all feedback.
- Basic analytics: Vercel Analytics.

---

## 11. Out of scope for the beta

Real GST/ITR filing, ERI/GSP API integration, automatic AIS fetch, WhatsApp Business API, payment collection, the real lawyer network, native apps.

---

## 12. Deployment

1. Create a Supabase project (Mumbai). Run migrations and enable RLS.
2. Configure Supabase phone auth with Twilio Verify. Add `DEMO_OWNER_PHONE` as a test number with a fixed OTP.
3. Configure Resend with a verified sending domain.
4. Push to GitHub and import into Vercel. Set env vars: Supabase URL and keys, Resend key, Twilio keys, encryption key, and the `DEMO_OWNER_*` values.
5. Add the Vercel Cron for reminders.
6. Share the Vercel URL.

---

## 13. Done when

- [ ] Owner signs in with their number and sees the full demo dataset under their own name.
- [ ] A new creator can sign up, onboard, and see an empty dashboard.
- [ ] "Try with sample data" and "Clear sample data" both work, without duplicates.
- [ ] A new deal with deliverables, usage rights and an advance produces the correct invoice and balance.
- [ ] The brand signing link works on a phone without logging in.
- [ ] Reminders open WhatsApp with the right message in all three languages.
- [ ] Recording a payment settles the deal and updates the Tax hub.
- [ ] TDS mismatches appear by brand and the Remind flow works.
- [ ] Every screen in section 7 exists. No dead buttons; beta features show their beta note.
- [ ] Feedback reaches `/admin/feedback`.
- [ ] Works in light and dark mode at 375px width.
- [ ] Lighthouse mobile score: Performance and Accessibility above 90.

---

## Build status

- **Beta: CODE COMPLETE (pending hosted Supabase / Resend / Twilio / Vercel wiring).** Every screen in §7 exists.
  Unit tests cover the maths and AIS parser; two Playwright suites (`e2e/`) run the owner demo and a
  new creator end to end against a local Supabase stack. Lighthouse mobile scores 100 for Performance and
  Accessibility on sign-in, Home, Deals and Tax. Setup and deployment steps: `README.md`.
