# Chronic Health Tracker (MVP)

Tracks chronic-condition blood markers over time and fuses them with fitness
wearable data to show trends and "what to change before your next test."

**Current wedge:** pre-diabetes / metabolic health only (fasting glucose, HbA1c,
fasting insulin, HOMA-IR, lipid panel). See [`CLAUDE.md`](./CLAUDE.md) for the
full architecture, constraints, and build order.

> **Status:** M0 — Foundation (done) · M1 — Wearable pipe (backend slice done;
> Whoop OAuth + sync, mobile shell next). Compliance scaffolding (consent + audit
> log), auth, DB schema, and CI underpin every feature module.

## Repository layout

```
.
├── CLAUDE.md                  # Architecture, constraints, build order (read first)
├── README.md
├── .github/workflows/ci.yml   # Lint + tests + committed-secret guard
├── backend/                   # FastAPI API (Python 3.11)
│   ├── app/
│   │   ├── main.py            # App entrypoint + /health
│   │   ├── config.py          # Env-only settings (no hard-coded secrets)
│   │   ├── auth.py            # Supabase JWT verification
│   │   ├── dependencies.py    # require_consent() gate + repository/wearable wiring
│   │   ├── repository.py      # Data-access seam (in-memory for M0/M1)
│   │   ├── routers/           # consent, markers (sample), audit, wearables
│   │   ├── security/
│   │   │   ├── consent.py     # Pure consent-evaluation rule
│   │   │   ├── audit.py       # PHI-safe audit entries
│   │   │   └── crypto.py      # Fernet token encryption at rest (M1)
│   │   └── wearables/         # M1: provider interface, Whoop client, normalize, sync
│   ├── tests/                 # consent/audit/crypto/normalize/OAuth + e2e API tests
│   └── .env.example
├── mobile/                    # Expo / React Native app (M1)
│   ├── app/                   # expo-router screens (sign-in, home)
│   ├── src/                   # api client, auth, health bridges + pure normalize
│   └── __tests__/             # unit tests for the pure normalization layer
├── docs/
│   ├── M0-foundation.md       # Compliance design notes
│   └── M1-wearables.md        # Wearable pipe (Whoop) design notes
└── supabase/
    └── migrations/
        ├── 0001_foundation.sql   # profiles, consents, audit_log + RLS
        └── 0002_wearables.sql    # wearable_connections, wearable_samples + RLS
```

## Backend — local development

Requires Python 3.11+.

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

cp .env.example .env        # fill in Supabase values; never commit .env

# Run tests + lint
pytest -q
ruff check .

# Run the API
uvicorn app.main:app --reload
# → http://localhost:8000/health  and  /docs
```

### Database

Apply `supabase/migrations/0001_foundation.sql` to your Supabase Postgres
(Supabase SQL editor, or `supabase db push` with the CLI). It creates the
`profiles`, `consents`, and `audit_log` tables with Row Level Security and an
append-only audit trail.

## Compliance guardrails (DPDPA — enforced, not aspirational)

- **Every health-data read passes the consent gate** (`require_consent`), which
  denies without a valid, unexpired, purpose-specific consent and writes an
  audit entry on success.
- **No PHI in the audit log.** `build_audit_entry` rejects metadata that looks
  like PHI (marker values, names, email, DOB).
- **No secrets in code.** All configuration is read from the environment.
- **Audit log is append-only**, enforced by both RLS and a DB trigger.

See [`docs/M0-foundation.md`](./docs/M0-foundation.md) for details.
