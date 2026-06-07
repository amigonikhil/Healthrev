# M0 — Foundation: compliance design

This module establishes the DPDPA scaffolding **before** any feature, per the
hard constraint in `CLAUDE.md`: *"Compliance scaffolding exists before any
feature."* The defensible product (normalization + projection) comes later; this
is the floor everything else stands on.

## What's in M0

| Area | Where |
| --- | --- |
| Auth (verify Supabase JWT) | `backend/app/auth.py` |
| Consent rule (pure, tested) | `backend/app/security/consent.py` |
| Consent gate (enforce + audit) | `backend/app/dependencies.py` (`require_consent`) |
| PHI-safe audit entries | `backend/app/security/audit.py` |
| DB schema + RLS | `supabase/migrations/0001_foundation.sql` |
| CI (lint, tests, secret guard) | `.github/workflows/ci.yml` |

A sample guarded endpoint (`/markers`) and the user-facing audit read (`/audit`)
exist only to prove the path end-to-end. No marker/PHI storage yet — that's M2+.

## The consent rule

A read of user health data is permitted **only** when a consent record is:

1. **present** for the user,
2. **matching the requested purpose** (purpose-specific — DPDPA requirement),
3. **not revoked** (`status != revoked` and `revoked_at is null`), and
4. **not expired** (`expires_at is null` or strictly in the future).

This is implemented as a pure function, `evaluate_consent(...)`, so it is
exhaustively unit-testable with no DB. The same rule is mirrored in the DB via
the `consents_one_active_per_purpose` constraint and RLS. Expiry is treated as
**inclusive** (`expires_at == now` ⇒ expired), failing closed.

### Purposes

Enumerated, not free-text, so consent is genuinely purpose-bound:
`wearable_sync`, `lab_report_ingestion`, `marker_storage`, `trend_analysis`,
`notifications`. The Python `ConsentPurpose` enum and the SQL `consent_purpose`
type must stay in sync.

## The audit trail

- **Append-only.** Enforced twice: RLS grants users no insert/update/delete,
  and a DB trigger (`audit_log_no_mutate`) rejects UPDATE/DELETE even for the
  service role.
- **No PHI, ever.** `build_audit_entry` raises `PhiLeakError` if metadata
  contains keys that look like health values or identifiers (`glucose`, `value`,
  `email`, `dob`, …). Error messages deliberately exclude the offending values.
- **Traceable.** Every gated read/write records the `consent_id` that authorised
  it, so any access can be traced back to a consent.
- **Transparent.** Users can read their own trail (`GET /audit`), per DPDPA.

## Secrets & PHI handling

- No secrets in code. `Settings` reads only from the environment; `.env` is
  git-ignored and CI fails if a `.env` is ever committed.
- The server uses the Supabase **service-role** key only server-side; end-user
  requests are authorised by their own JWT, and RLS is the backstop.
- Logging is configured to avoid request bodies and marker values.

## Deliberate M0 shortcuts (and how they get removed)

- **In-memory repository.** `InMemoryRepository` implements the `Repository`
  Protocol so the API, gate, and audit trail run and test without a live DB. A
  Supabase-backed implementation satisfying the same Protocol replaces it in a
  later module — routers and the gate are unchanged.
- **No marker storage.** Intentional; PHI tables arrive with M2/M3 once the
  review-and-confirm UX and normalization layer exist.

## How to verify

```bash
cd backend && pip install -e ".[dev]"
pytest -q          # consent rule, audit safety, end-to-end gate flow
ruff check .
```

The end-to-end test (`tests/test_api.py`) asserts the whole path: unauthenticated
→ 401, authenticated-without-consent → 403, grant → 200 with an audit entry,
revoke → 403 again, and that consent does not leak across users or purposes.
