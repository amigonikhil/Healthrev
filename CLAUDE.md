# RK Solutions — Recovery Ops Platform · Claude Code Build Spec

> This file is read by Claude Code at the start of every session. Build in the phase
> order given. Do not hardcode any rate, commission %, or bill logic — everything
> money-related is admin-configurable.

---

## 1. What we're building

A **back-office operations platform** for RK Solutions, a debt-recovery agency contracted to **HDFC Bank** for **4-wheeler loan recovery** across buckets **X and B1–B6**, including **repossession, settlement, and foreclosure**.

Today the agency runs on messy multi-sheet Excel files (monthly HDFC allocation dumps) and hand-built MIS workbooks. This platform replaces that: one system that ingests the allocation files, lets back-office manage every case live, computes executive payouts and the HDFC bill automatically, and shows the MIS live.

**This is the single source of truth for agency operations and money.**

## 2. Users & access

- **Back-office / admin only.** Field executives (called **DRAs** — Debt Recovery Agents) do **not** log in. Back-office staff update case status, receipts, and outcomes on their behalf.
- Two roles: **Admin** (full access incl. payout rules, billing config, staff) and **Operator** (case updates, receipt entry, no config/payout visibility).
- Small team (handful of users). Email OTP / magic-link auth is enough.
- **This is bank customer data (PII + financial).** Enforce Supabase Row-Level Security, encrypt at rest, keep an audit log of who changed what. No public exposure of any table.

## 3. Tech stack

- **Next.js (App Router, TypeScript)** — web app, deployed on **Vercel**.
- **Supabase** — Postgres, Auth (email OTP), Storage (for uploaded allocation files + generated exports).
- **Parsing**: `xlsx` (SheetJS) for reading HDFC Excel; server-side route/edge function.
- **Charts**: Recharts. **Tables**: TanStack Table. **Excel export**: SheetJS (`xlsx`) or ExcelJS for styled output.
- Node 22, pnpm. Assume macOS Apple Silicon dev environment.

## 4. Core data flow

```
HDFC monthly allocation .xlsx  ──upload──▶  Parser  ──normalize──▶  cases (staged → committed)
                                                                         │
Back-office live updates (status, receipts, PTP, repo/sett/FC) ──────────┤
                                                                         ▼
                                          Payout engine ◀── configurable rules
                                          Billing engine ◀── configurable rate card
                                                                         ▼
                                          Live MIS dashboards + Excel export
```

Two ingest paths, both required: (a) **upload** the HDFC allocation file each month and auto-parse; (b) **update live** in-app afterward as recovery happens.

---

## 5. The HDFC allocation file — exact structure (use this, don't reverse-engineer)

Each monthly file (e.g. `AL_FILE_OF_APRIL_2026.xlsx`) has many helper sheets (`PIVOT`, `AD`, `FV`, `bulk`, `REF`, etc.). **Only the `DATA` sheet is the master case ledger.** Ignore the rest on ingest. Row 1 is the header. Read cached values (some columns are VLOOKUP formulas).

**Columns to extract from `DATA` (map by header name, not position — headers shift slightly month to month):**

| Source header | Field | Notes |
|---|---|---|
| `LOAN NO/ACCOUNT NO` | `loan_no` | Natural key. Dedup within an allocation month. |
| `CUSTOMER NAME` | `customer_name` | |
| `FATHER NAME` | `father_name` | |
| `BRANCH` | `branch` | |
| `PRODUCT` | `product` | e.g. "USED CAR PREMIUM LOAN" |
| `BUCKET` | `bucket` | 1–6; **X** flagged separately (X-flow cases). Store as `X,1..6`. |
| `POS` | `pos` | Portfolio Outstanding (₹). Primary loan balance. |
| `EMI` | `emi` | |
| `TOTAL EMI DUE` | `total_emi_due` | |
| `NO OF EMIS` | `emis_due_count` | |
| `STATUS` | `status` | Enum below. |
| `RECEIP AMT` | `receipt_amount` | Collection booked. |
| `RECEIP NO` | `receipt_no` | |
| `RECEIP DATE` | `receipt_date` | |
| `DRA` | `dra_name` | Recovery executive. Link to `staff`. |
| `ALLOCATION DATE` | `allocation_date` | |
| `TYPE` | `alloc_type` | NEW / etc. |
| `REPO FLAG` | `repo_flag` | Y/N |
| `NPA STAGE` | `npa_stage` | |
| `DPD` / `RISK DPD` | `dpd`, `risk_dpd` | Days past due. |
| `NO OF BOUNCES` | `bounces` | |
| `REG NO` | `vehicle_reg_no` | |
| `MODEL` | `vehicle_model` | |
| `ENGINE NO` / `CHASIS NO` | `engine_no`, `chassis_no` | |
| `DISBURSAL DATE` / `TENURE` | `disbursal_date`, `tenure` | |
| mailing/office address + phone/mobile cols | `address_json` | Store the address/contact block as JSON. |

**`STATUS` enum (real values seen):**
- `STAB` — stabilised (held bucket, did not roll forward) → counts as **resolved**
- `RB` — rolled back a bucket (customer cleared dues) → counts as **resolved** (harder win)
- `FLOW` — flowed forward to next bucket → **adverse**
- `NR` — not resolved
- `ABOVE 2 EMIS`

**Derived metric — `Resolution % = 1 − (FLOW count / allocated count)`** per bucket and per executive. This is the metric HDFC billing keys off.

**Ingest behaviour:**
- Upload → stage rows in a preview table → show parse summary (rows, buckets, DRAs, unmapped columns) → **operator confirms → commit** to `cases`, tagged with `allocation_month`.
- Re-uploading a month upserts by `loan_no + allocation_month` (don't duplicate). Preserve any live edits made after the previous commit (edit-wins on operator-touched fields; flag conflicts).

## 6. The MIS / billing reference file — `MONTHLY_PERFORMANCE`

The `BILLS` sheet defines the monthly close and is the model for the **Billing** and **P&L** modules:

- `MONTHS`, `BILL AMOUNT` (raised to HDFC), `EXPENSES`, `PROFIT`
- Per bucket: `BKT n %` (resolution %) and `BKT n RB` (roll-back %) for X, 1–6
- `SETT` (settlements count), `FC` (foreclosures count), `REPO` (repossessions), `REFERRAL`

Reference actuals (FY26-27, for seeding/validation): **April** — bill ₹5,70,663, expenses ₹4,80,833, 4 settlements, 2 foreclosures. **May** — bill pending, expenses ₹4,97,384, 1 settlement, 7 foreclosures.

---

## 7. Data model (Postgres / Supabase)

Core tables — expand as needed:

- **`staff`** — `id, name, role (field_exec | back_office | manager | office), pay_type (fixed | commission | both), active, joined_at`
- **`upload_batches`** — `id, allocation_month, filename, storage_path, uploaded_by, row_count, committed_at`
- **`cases`** — all fields from §5 + `id, allocation_month, upload_batch_id, dra_id → staff, current_status, is_resolved (computed), created_at, updated_at`
- **`case_events`** — append-only trail: `id, case_id, event_type (status_change | ptp | rtp | visit | note | receipt | repo | settlement | foreclosure), payload_json, event_date, created_by, created_at`. (The HDFC `FV`/`TRAILS` sheets are call notes — model them here: PTP = Promise To Pay, RTP = Refuse To Pay.)
- **`receipts`** — `id, case_id, dra_id, receipt_no, amount, receipt_date` (source of collections for payout + billing)
- **`resolutions`** — `id, case_id, type (repo | settlement | foreclosure), amount, resolved_date, notes`
- **`expenses`** — `id, month, category, amount, note` (for P&L)
- **`payout_rules`** — configurable engine (see §8)
- **`payout_runs`** / **`payout_lines`** — computed monthly payout per staff
- **`hdfc_rate_card`** — configurable billing rules (see §9)
- **`hdfc_bills`** — `id, period, computed_amount, adjustments, final_amount, status (draft | raised | part_paid | settled)`
- **`hdfc_payments`** — `id, bill_id, amount, received_date, utr_ref` (reconciliation)
- **`audit_log`** — `id, user, table, row_id, action, before_json, after_json, at`

Enforce RLS on every table. Operators can't read `payout_*`, `hdfc_*`, or `payout_rules`.

## 8. Payout engine — FULLY CONFIGURABLE (core module)

Admin builds rules in a UI; the engine computes each staff member's monthly payout. **No rates in code.** Support all of these, combinable per person:

1. **Fixed salary** — flat ₹/month (office/back-office/managers).
2. **Flat commission** — % on that executive's booked collections for the month.
3. **Bucket-tiered commission** — different % per bucket (e.g. X vs B6 pay differently), applied to collections attributed to each bucket.
4. **Per-event payouts** — fixed ₹ (or %) per **repossession**, **settlement**, **foreclosure** closed by that executive.
5. **Mix** — a person can have fixed + commission + event payouts simultaneously.

**Rule model:** `payout_rules` holds an ordered set of components per staff (or per role, with staff override). Each component = `{type: fixed|flat_pct|bucket_pct|event, params, effective_from, effective_to}`. Engine resolves the active rule set for the run month, computes each component from `receipts` / `resolutions` attributed to that `dra_id`, sums to a payout line, and shows a full breakdown (so any figure is explainable). Runs are **previewable and re-runnable** until locked for the month.

Seed the config screen empty (Nikhil will enter real numbers), but ship a couple of example rule sets so the UI is testable.

## 9. Billing engine (HDFC) — compute + reconcile

**Compute side:** admin defines an `hdfc_rate_card` (configurable, versioned) expressing how the agency bills HDFC — typically a % on collections that varies by bucket, plus flat fees for repo/settlement/foreclosure and referral. Engine computes the **bill for a period** from committed cases/receipts/resolutions and produces a draft bill with a line-item breakdown mirroring the `BILLS` sheet (bucket %s, RB %s, SETT/FC/REPO counts). Admin can adjust, then mark **raised**.

**Reconcile side:** record `hdfc_payments` against raised bills; show billed vs received vs outstanding, ageing, and part-payments. Flag mismatches.

**P&L** = bill (income) − payouts − expenses, per month, wired to the dashboard.

## 10. MIS dashboards (live — replace the manual workbook)

Rebuild these views from live data (mirror the existing 6-sheet MIS so it's familiar):

1. **Dashboard** — monthly KPIs across FY: cases allocated, POS, collections, cases resolved, settlements, foreclosures, repos; P&L block (bill / expenses / net profit / margin). Trend charts.
2. **Monthly P&L** — 12-month grid, bill vs expenses vs profit vs margin.
3. **Bucket Performance** — X, B1–B6 × month: cases, POS, Resolution %, Roll-Back %, MoM movement.
4. **Executive Scorecard** — per DRA per month: cases, POS, collections, resolved, Res %, payout.
5. **Payout Summary** — per staff: components breakdown, total, status (from §8).
6. **Billing** — bills raised, received, outstanding (from §9).

**Excel export**: one click regenerates the styled MIS workbook (so Nikhil still has the file for the bank/records). Match the existing layout.

## 11. Domain glossary (so the model reasons correctly)

- **DRA** — Debt Recovery Agent = field recovery executive.
- **POS** — Portfolio Outstanding (loan balance under recovery).
- **Bucket X / B1–B6** — months delinquent; X = current-ish flow, B6 = deepest.
- **RB (Roll-Back)** — case moved back a bucket (customer cleared dues); a strong recovery.
- **FLOW** — case rolled forward a bucket; adverse.
- **STAB** — stabilised; held the bucket.
- **Resolution %** = 1 − flow-forward rate.
- **PTP / RTP** — Promise To Pay / Refuse To Pay (trail outcomes).
- **Repo / Settlement / Foreclosure (FC)** — terminal recovery outcomes, each with its own payout + billing treatment.

## 12. Build sequence

Ship in this order; each phase is usable on its own.

1. **Foundation** — repo, Supabase schema + RLS, auth (email OTP), roles, audit log, app shell.
2. **Ingestion + Case Management** — upload/parse/preview/commit HDFC `DATA` sheet (§5), cases list with filters (month, bucket, DRA, status), case detail with live edit + `case_events` trail, receipts entry, resolutions (repo/sett/FC).
3. **Payout engine** (§8) — rule builder UI, monthly run preview/lock, breakdowns.
4. **Billing engine** (§9) — rate card, compute bill, reconcile payments, P&L.
5. **MIS dashboards + Excel export** (§10).

## 13. Guardrails

- **Nothing money-related is hardcoded** — all commission %s, rates, fees, salaries live in config tables, versioned with effective dates.
- **Idempotent ingestion** — re-uploading a month never duplicates; operator edits are preserved.
- **Everything explainable** — every payout and bill figure shows its component breakdown.
- **PII/financial data** — RLS everywhere, audit log on writes, no client-side secrets, no public tables.
- **Preserve, don't destroy** — payout/bill runs are draft→locked; locked periods are immutable except by admin with an audit entry.
- Keep the existing MIS layout and terminology so it's familiar on day one.

---

## Module status

- **Phase 1 — Foundation: CODE COMPLETE (pending Supabase project wiring).**
  Next.js (App Router, TypeScript) + Tailwind app shell. Supabase Postgres schema
  for every table in §7 with Row-Level Security and a generic audit-log trigger.
  Email-OTP / magic-link auth with `admin` / `operator` app roles enforced in RLS,
  middleware, and the UI. Operators are blocked from `payout_*`, `hdfc_*`, and
  `payout_rules` at the database layer. See `docs/phase-1-foundation.md` and
  `supabase/migrations/0001_foundation.sql`. Later phases (ingestion, payout,
  billing, MIS) are scaffolded as nav placeholders only.
