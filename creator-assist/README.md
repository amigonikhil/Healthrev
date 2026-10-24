# Creator Assist (beta)

Mobile-first web app for Indian creators to track paid brand collabs, get agreements signed, raise GST invoices, chase payments and stay TDS-ready. The source of truth for UI is `design/prototype.html`; the build spec is `CLAUDE.md`.

Next.js 15 (App Router) · TypeScript · Supabase (Postgres, Auth, Storage, RLS) · Resend · `@react-pdf/renderer` · Vercel (+ Cron, Analytics).

This app lives in the `creator-assist/` folder of the repo and is fully independent of the RK Solutions app at the repo root.

## What's in the beta

| Screen | Route |
|---|---|
| Sign in (phone OTP, email fallback) | `/signin` |
| Onboarding (2 steps, consent) | `/onboarding` |
| Home, Deals (filters), Brands, Tax hub, Settings | `/home` `/deals` `/brands` `/tax` `/settings` |
| New paid collab with live GST/TDS summary | `/deals/new` |
| Deal detail, agreement, invoice, reminders, payment, escalate, lawyer notice | `/deals/[id]/…` |
| Brand signing page (public, no login, email OTP) | `/s/[token]` |
| TDS reminder, File with us (AI call booking) | `/tax/remind/[brandId]` `/tax/file` |
| Tester feedback (owner only) | `/admin/feedback` |

Ground rules from the spec, and where they live:

- **Money in paise**, formatted `en-IN` → `src/lib/money.ts`.
- **No hardcoded tax rates**: GST %, TDS %, RBI bank rate and MSME multiple come from the per-user `tax_config` row (editable in Settings). Tax logic is marked `// VERIFY WITH CA` → `src/lib/calc.ts`, `src/lib/tax.ts`.
- **RLS on every table** (own rows only), composite foreign keys so rows can't be attached to someone else's deal → `supabase/migrations/0001_init.sql`.
- **PAN and bank numbers encrypted** with AES-256-GCM (`ENCRYPTION_KEY`), shown masked → `src/lib/crypto.ts`.
- **Audit log** for agreement viewed/signed, reminder sent, payment recorded, and more → `src/lib/audit.ts`.
- **Never sends a legal notice**: the lawyer flow saves a draft with status `in_review`. Beta features (lawyer notice, filings, AI call, MSME Samadhaan) write real rows and show a "Beta: …" note.
- **WhatsApp is click-to-send only** (`wa.me` links). Email goes through Resend; the daily cron sends ladder reminders.
- **Sample data** is seeded by one Postgres function call (`seed_sample`), guarded by `profiles.sample_seeded_at`, so it's atomic and idempotent. All sample rows have `is_sample = true`; "Clear sample data" (`clear_sample`) removes only those. Sample deals never send real emails.

## Run locally

Needs Node 22, pnpm and Docker (for the local Supabase stack).

```bash
cd creator-assist
pnpm install
cp .env.example .env.local     # fill in values; see below for local ones
export TWILIO_ACCOUNT_SID=ACx TWILIO_MESSAGE_SERVICE_SID=MGx SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN=x
pnpm exec supabase start       # prints the local URL, anon and service-role keys
pnpm dev
```

For local `.env.local` use `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`, the keys `supabase start` prints, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, `DEMO_OWNER_PHONE=+919876543210` and `ALLOW_OTP_PREVIEW=true`.

- The demo owner signs in with **98765 43210**, OTP **482913** (`supabase/config.toml` → `auth.sms.test_otp`).
- Email OTPs land in Mailpit at http://127.0.0.1:54324.

## Testing

```bash
pnpm typecheck && pnpm lint && pnpm test   # unit tests: GST/TDS/MSME maths, money, dates, AIS parser
pnpm build && pnpm start                   # then, against a fresh `pnpm exec supabase db reset`:
pnpm e2e                                   # Playwright: owner demo (62 checks) + new creator (28 checks)
```

The owner suite checks the prototype's numbers (₹85,300 owed, ₹47,200 due this week, Voltra ₹33,600 / ₹310 MSME interest, Tax hub ₹1,10,000 / ₹19,800 / ₹11,000 / ₹5,700 missing), the deal filters, three reminder languages, the brand signing link, payment settlement, sample clear/reload without duplicates and feedback reaching the admin page. The new-creator suite covers email sign-up, onboarding validation, a deal with deliverables + usage rights + advance, signing, invoicing, partial and full payment, AIS upload matching and account deletion, in dark mode at 375px.

## Deploy (beta)

1. **Supabase**: create a project in **Mumbai (ap-south-1)**. Then link and push the migrations:
   `pnpm exec supabase link --project-ref <ref>` and `pnpm exec supabase db push`.
2. **Phone auth**: Auth → Providers → Phone. Turn it on with **Twilio Verify** (or MSG91 via Twilio-compatible setup). Indian SMS needs DLT-registered templates. Until that's ready, set `NEXT_PUBLIC_SMS_ENABLED=false` and testers use the Email tab.
   Add `DEMO_OWNER_PHONE` (without `+`) under **Test phone numbers** with a fixed OTP so demos never depend on SMS.
3. **Email OTP template**: Auth → Email Templates → *Magic Link* and *Confirm signup*. Paste `supabase/templates/otp.html`, which includes the 6-digit `{{ .Token }}` the sign-in screen asks for. Under URL Configuration, set the Site URL to your Vercel URL and add `<url>/auth/callback` to the redirect URLs.
4. **Resend**: verify a sending domain; set `RESEND_API_KEY` and `RESEND_FROM`.
5. **Vercel**: import the repo with **Root Directory = `creator-assist`**. Set every variable from `.env.example` (generate `ENCRYPTION_KEY` and `CRON_SECRET` with `openssl rand -base64 32`). The cron in `vercel.json` runs daily at 09:00 IST. Enable Vercel Analytics in the project.
6. Sign in with the owner number to check the demo, then share the URL.

## Known beta limits

- AIS JSON parsing is best-effort (the portal format isn't documented). Unreadable files are still stored, and creators can add entries by hand.
- Email "read" status uses a tracking pixel, so it's only as reliable as the recipient's image loading.
- Advance tax shows the income base only. No tax amount is computed, because that would need slab rates in code.
- The lawyer (Adv. S. Lakshmi), fees (₹1,499 / ₹1,999) and ITR-4 label are prototype placeholders.
