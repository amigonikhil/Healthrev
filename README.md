# RK Solutions — Recovery Ops Platform

Back-office operations platform for **RK Solutions**, a debt-recovery agency
contracted to **HDFC Bank** for 4-wheeler loan recovery (buckets X, B1–B6;
repossession / settlement / foreclosure). It replaces the agency's messy
multi-sheet Excel workflow with one system: ingest the monthly HDFC allocation
file, manage every case live, auto-compute executive payouts and the HDFC bill,
and show the MIS live.

See [`CLAUDE.md`](./CLAUDE.md) for the full build spec.

## Status — Phase 1 (Foundation) is code-complete

| Phase | Scope | State |
|---|---|---|
| **1 — Foundation** | Schema + RLS, auth (email OTP), roles, audit log, app shell | ✅ Ready |
| 2 — Ingestion + case mgmt | Upload/parse/commit HDFC `DATA` sheet; case list + live edit | ⏳ |
| 3 — Payout engine | Configurable rule builder, monthly run preview/lock | ⏳ |
| 4 — Billing engine | HDFC rate card, compute bill, reconcile, P&L | ⏳ |
| 5 — MIS + Excel export | Live dashboards mirroring the 6-sheet MIS | ⏳ |

## Tech stack

- **Next.js 15 (App Router, TypeScript)** on Vercel
- **Supabase** — Postgres, Auth (email OTP), Storage
- Tailwind CSS v4, Recharts, TanStack Table, SheetJS (`xlsx`)
- Node 22, pnpm

## Project layout

```
CLAUDE.md                       # build spec (source of truth)
middleware.ts                   # session refresh + route guard
src/
  app/
    login/                      # email-OTP sign in (6-digit code + magic link)
    auth/confirm/               # magic-link verify (token_hash / PKCE code)
    auth/signout/               # POST sign out
    (app)/                      # authenticated shell (sidebar + role-gated nav)
      dashboard/  cases/  payouts/  billing/  staff/  settings/
  components/                   # nav, sign-out, page header, placeholders
  lib/
    auth.ts                     # requireProfile() / requireAdmin()
    supabase/{client,server,middleware}.ts
supabase/
  migrations/0001_foundation.sql # all tables + RLS + audit log + auth trigger
  seed.sql                       # example staff + payout rules (dev only)
docs/phase-1-foundation.md       # compliance / access-control design
```

## Access model (Phase 1)

- **Two app roles:** `admin` (full access incl. payout rules, billing, staff) and
  `operator` (case work only — cannot read `payout_*`, `hdfc_*`, or `payout_rules`).
- Roles are enforced in **RLS at the database layer** (not just the UI), in the
  auth middleware, and in the page guards.
- The **first user to sign up becomes `admin`** (bootstrap); everyone after
  defaults to `operator`. Admins manage roles from the DB / (Phase 3) UI.
- Every write to a business table is captured in `audit_log` (before/after JSON,
  actor, timestamp) via a generic trigger. Admins can read the audit log.

## Local setup

1. **Create a Supabase project** and run the migration:
   ```bash
   # via the Supabase SQL editor, paste supabase/migrations/0001_foundation.sql
   # (optionally supabase/seed.sql for example data)
   # or, with the Supabase CLI linked to your project:
   supabase db push
   ```
2. **Configure env** — copy `.env.example` to `.env.local` and fill in your
   project URL + anon key (service-role key is server-only, never `NEXT_PUBLIC_`).
3. **Install & run:**
   ```bash
   pnpm install
   pnpm dev
   ```
4. Open http://localhost:3000, sign in with your email, enter the 6-digit code.
   The first account becomes admin.

## Guardrails (enforced from Phase 1)

- Nothing money-related is hardcoded — rates/commissions/salaries live in config
  tables, versioned by effective date.
- RLS on every table; no public tables; no client-side secrets; audit log on writes.
- Idempotent ingestion (Phase 2): re-uploading a month never duplicates and
  preserves operator edits — the schema already carries the `(loan_no,
  allocation_month)` unique key and an `operator_touched` flag for this.
