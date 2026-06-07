# Chronic Health Tracker (MVP)

Tracks chronic-condition blood markers over time and fuses them with fitness
wearable data to show trends and "what to change before your next test."

**Current wedge:** pre-diabetes / metabolic health only (fasting glucose, HbA1c,
fasting insulin, HOMA-IR, lipid panel). See [`CLAUDE.md`](./CLAUDE.md) for the
full architecture, constraints, and build order.

> **Status:** M0 — Foundation (in progress). Compliance scaffolding (consent +
> audit log), auth, DB schema, and CI are in place before any feature module.

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
│   │   ├── dependencies.py    # require_consent() gate + repository wiring
│   │   ├── repository.py      # Data-access seam (in-memory for M0)
│   │   ├── routers/           # consent, markers (sample), audit
│   │   └── security/
│   │       ├── consent.py     # Pure consent-evaluation rule
│   │       └── audit.py       # PHI-safe audit entries
│   ├── tests/                 # consent + audit unit tests, end-to-end API tests
│   └── .env.example
├── docs/M0-foundation.md      # Compliance design notes
└── supabase/
    └── migrations/0001_foundation.sql   # profiles, consents, audit_log + RLS
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
