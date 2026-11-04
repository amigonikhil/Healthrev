# Creator Assist API v1

The backend for the web app and the iOS/Android apps. Every business rule (GST, advance,
TDS, balances, MSME interest, invoice numbering, reminders, escalations, tax hub) runs on
the server in `src/server/*` and is exposed here. The web app calls the same service
functions directly from its pages and server actions; the mobile apps call these routes.
Calculations shared by every app live in `packages/shared` (`@creator-assist/shared`).

## Calling it

- Base URL: `https://<web app>/api/v1`
- **Auth:** `Authorization: Bearer <Supabase access token>` (the session the app gets from
  Supabase Auth after phone or email OTP). The web app's session cookie also works.
  Every query runs as that user, so row-level security applies: a creator can only ever
  read or change their own rows.
- **Platform:** send `X-Client-Platform: ios` or `android`. Every analytics event records it
  (`events.properties.platform`); the web records `web`.
- **Bodies** are JSON (`Content-Type: application/json`) except the two uploads, which are
  `multipart/form-data`. Money is integer **paise**; dates are `YYYY-MM-DD` in India time.
  Request and response types: `packages/shared/src/api.ts`.
- **Errors:** non-2xx responses are `{ "error": "<message to show>", "code"?: "..." }`.
  The messages are the same ones the web forms show.

| Status | Meaning |
|---|---|
| 400 | Validation failed: show `error` next to the form |
| 401 `unauthorized` | No/expired token: refresh the Supabase session or sign in again |
| 404 `not_found` | Doesn't exist, or belongs to someone else (never distinguished) |
| 409 `onboarding_required` | Signed in but no profile yet: show onboarding |
| 409 | Not possible in the deal's current state (e.g. payment before the invoice) |
| 429 `rate_limited` | Too many requests: try later |
| 503 `not_configured` | Feature not switched on server-side |

## Endpoints

### Session and profile
| Method | Path | |
|---|---|---|
| GET | `/config` | Feature flags (`lawyer_notice`, `file_with_us`, `deal_from_chat`; off unless enabled) and `minAppVersion` per platform. No auth. |
| GET | `/me` | User, profile (null until onboarded), rates, `isAdmin`, `hasSampleData` |
| POST | `/me/bootstrap` | Call once after sign-in: provisions the demo/reviewer account if this is it, then returns `/me` |
| POST | `/profile` | Onboarding (`OnboardInput`). PAN and bank account are encrypted at rest. |
| PATCH | `/profile` | Edit profile (`UpdateProfileInput`); blank PAN/bank keeps the stored ones |
| POST | `/auth/email-code` | Email sign-in code (fallback to phone OTP). No auth; rate limited. |

### Deals
| Method | Path | |
|---|---|---|
| GET | `/home` | Home: owed (due / after TDS), overdue, due this week, TDS pending, needs-attention list |
| GET | `/deals` | All deals as views (phase, balances, amounts) |
| POST | `/deals` | Create (`CreateDealInput`): deliverables, usage rights, advance, TDS, terms |
| GET | `/deals/options` | New-deal form: rates, creator defaults, saved brands, deliverables menu |
| GET | `/deals/{id}` | One deal |
| POST | `/deals/{id}/advance` | Mark the advance received |
| POST | `/deals/extract` | Paste a deal (multipart `text` and/or `image`) → fields to review. Nothing is saved. |
| GET | `/deliverables` | Deliverables menu and usage-rights options. No auth. |
| GET | `/brands` | Brands with payment behaviour and labelled amounts |

### Agreements, invoices, payments
| Method | Path | |
|---|---|---|
| GET | `/deals/{id}/agreement` | Agreement text (or preview) and, once sent, the brand's signing link |
| POST | `/deals/{id}/agreement` | Send for e-sign `{ email, whatsapp }` → `{ link, wa, emailed }`. The brand signs on the web link. |
| GET | `/agreements/{id}/pdf` | Agreement PDF |
| GET | `/deals/{id}/invoice` | Invoice, or a draft preview |
| POST | `/deals/{id}/invoice` | Generate `{ invoiceDate, email }`: numbers it (PREFIX/YYYY-YY/NNN) and schedules reminders |
| GET | `/invoices/{id}/pdf` | Invoice PDF |
| POST | `/invoices/{id}/email` | Email the invoice to the brand again |
| POST | `/deals/{id}/payments` | Record `{ amountPaise, tdsPaise, receivedOn?, utr?, form16a? }` → `{ settled }` |

### Reminders and escalation
| Method | Path | |
|---|---|---|
| GET | `/deals/{id}/reminders` | Ladder, reminders sent by hand, current stage, message templates |
| POST | `/reminders/whatsapp` | Log a reminder the creator sent from their own WhatsApp (the app opens the `wa.me` link) |
| POST | `/reminders/email` | Email a reminder now |
| GET | `/brands/{id}/tds` | TDS missing from AIS for a brand, and its TDS reminders |
| POST | `/brands/{id}/tds` | Schedule the TDS follow-ups `{ lang }` |
| GET | `/deals/{id}/escalation` | Notice sent?, legal call booked?, amount claimed |
| GET | `/deals/{id}/notice` | Legal notice as it would go out today, WhatsApp link, email recipient |
| GET | `/deals/{id}/notice/pdf` | Notice PDF |
| POST | `/deals/{id}/notice/email` | Email the notice (sample deals: to the creator) |
| POST | `/deals/{id}/notice/whatsapp` | Log that the creator sent it on WhatsApp |
| POST | `/deals/{id}/samadhaan` | Note an MSME Samadhaan filing (the creator files on the portal) |
| POST | `/deals/{id}/legal-call` | Book a call with the legal team |
| GET | `/legal-calls/{id}` | A booking |

### Tax
| Method | Path | |
|---|---|---|
| GET | `/tax` | Tax hub: tiles, TDS mismatches by brand, filings coming up |
| PUT | `/tax/filer` | `{ who: "creator_assist" \| "own_ca" }` |
| POST | `/tax/filings` | Mark a filing's data as sent `{ type, period, due }` |
| POST | `/tax/ais` | Upload the AIS JSON (multipart `file`, optional `fy`) |
| POST | `/tax/ais/entries` | Add an AIS line by hand |
| GET | `/tax/file-with-us` | Data ready for the return |
| POST | `/ai-calls` | Book the AI call; GET `/ai-calls/{id}` reads it back |

### Settings, data and account
| Method | Path | |
|---|---|---|
| GET | `/settings` | Rates (with defaults), reminder templates, admin and sample-data status |
| PUT | `/settings/rates` | GST, TDS, RBI bank rate, MSME multiple, late interest, legal fee |
| PUT | `/settings/reminders` | Reminder interval, channels, language, default terms |
| POST / DELETE | `/sample` | Load / clear sample data (sample rows are marked; clearing removes only them) |
| GET | `/notifications` | In-app notices; POST `/notifications/{id}/dismiss` |
| POST | `/feedback` | `{ screen, message }` (works signed out) |
| POST | `/events` | Client analytics events (known names only) |
| GET | `/account/export` | Everything in the account as JSON (PAN/bank decrypted for the owner) |
| DELETE | `/account` | `{ confirm: "DELETE" }`: deletes the account and all its data |

Older unversioned paths (`/api/export`, `/api/invoices/{id}/pdf`, `/api/agreements/{id}/pdf`,
`/api/deals/{id}/notice`, `/api/events`) still work and run the same handlers. The brand
signing page (`/s/{token}`), the notice link for brands (`/api/n/...`), the email read
receipt (`/api/r/...`) and the reminder cron stay web-only.

## Tests

- `pnpm test`: calculation unit tests in `packages/shared`.
- `node e2e/api-v1.cjs`: the whole flow through the API with Supabase JWTs (the mobile
  path), plus a second user trying to read and change the first user's data (must fail).
- The web suites in `e2e/` cover the same flows through the web app.
