# Phase 1 — Foundation

This phase establishes the compliance and access scaffolding **before** any
feature code, per the build sequence in `CLAUDE.md` §12. It is usable on its own:
you can sign in, and the schema/RLS/audit machinery is live for later phases.

## What shipped

- **Full schema** (`supabase/migrations/0001_foundation.sql`) — every table from
  `CLAUDE.md` §7: `profiles`, `staff`, `upload_batches`, `cases`, `case_events`,
  `receipts`, `resolutions`, `expenses`, `payout_rules`, `payout_runs`,
  `payout_lines`, `hdfc_rate_card`, `hdfc_bills`, `hdfc_payments`, `audit_log`.
- **Row-Level Security** on all 15 tables.
- **Email-OTP auth** with a 6-digit code and magic-link fallback.
- **Two app roles** (`admin`, `operator`) enforced in three layers.
- **Generic audit trigger** writing before/after JSON on every business write.
- **Next.js app shell** with a role-gated sidebar and placeholder section pages.

## Access-control model

There are **two independent role concepts** — keep them distinct:

| Concept | Table / column | Meaning |
|---|---|---|
| **App role** | `profiles.app_role` (`admin` \| `operator`) | Who can log in and what they can see/do in the platform. |
| **Staff role** | `staff.role` (`field_exec` \| `back_office` \| `manager` \| `office`) | The HR/pay classification of a DRA or internal staffer. Staff do **not** log in. |

### Three enforcement layers

1. **Database (authoritative).** RLS policies call two `SECURITY DEFINER`
   helpers — `public.is_active_user()` and `public.is_admin()` — that read
   `profiles` for `auth.uid()`. They are `SECURITY DEFINER` so a policy on
   `profiles` can call them without recursing into `profiles`' own RLS.
   - Operational tables (`staff`, `cases`, `case_events`, `receipts`,
     `resolutions`, `upload_batches`, `expenses`): any **active** app user can
     read/insert/update; **deletes are admin-only**; `case_events` is
     append-only (update/delete admin-only).
   - Money/config tables (`payout_rules`, `payout_runs`, `payout_lines`,
     `hdfc_rate_card`, `hdfc_bills`, `hdfc_payments`): **admin-only for all
     operations** — operators cannot even `SELECT`, satisfying §7's rule that
     operators can't read `payout_*` / `hdfc_*` / `payout_rules`.
   - `audit_log`: **admin read-only**; no write policy exists, so the only writer
     is the `SECURITY DEFINER` trigger.
2. **Middleware.** `middleware.ts` refreshes the Supabase session on every
   request and redirects unauthenticated users to `/login`.
3. **Page guards.** `requireProfile()` / `requireAdmin()` (`src/lib/auth.ts`)
   run at the top of each protected Server Component and redirect on failure.
   The sidebar hides admin-only links for operators.

Because RLS is authoritative, a compromised or buggy UI still cannot leak
payout/billing data to an operator — the database refuses the query.

## Audit log

`public.audit_write()` is an `AFTER INSERT/UPDATE/DELETE` trigger attached to all
14 business tables. For each write it records the actor (`auth.uid()`), table,
row id, action, and full `before`/`after` JSON into `audit_log`. It is
`SECURITY DEFINER` so it can insert into `audit_log` despite that table having no
write policy. This gives an immutable "who changed what" trail from day one, as
required for bank PII/financial data.

## User bootstrap

`public.handle_new_user()` fires on `auth.users` insert and creates the matching
`profiles` row. The **first** user becomes `admin`; all subsequent users default
to `operator`. This avoids a chicken-and-egg problem (no admin exists to grant
the first admin). After bootstrap, an admin manages roles (DB now, UI in Phase 3).

## Idempotent-ingestion groundwork (for Phase 2)

The schema already encodes the §13 guardrails so Phase 2 only wires behaviour:

- `cases` has `unique (loan_no, allocation_month)` — re-uploading a month
  upserts instead of duplicating.
- `cases.operator_touched` flags rows edited in-app so re-ingest can preserve
  operator edits (edit-wins) and flag conflicts.
- `cases.source_row_json` stores the raw parsed row for conflict detection.
- `cases.is_resolved` is a generated column (`current_status in ('STAB','RB')`)
  so "resolved" is computed consistently, and Resolution % (`1 − FLOW rate`) can
  be derived directly in queries.

## Not in this phase

Ingestion/parsing, case-management UI, payout/billing compute, and MIS charts —
those are Phases 2–5. The section pages for them exist as role-gated placeholders
so the shell and navigation are complete and testable now.
