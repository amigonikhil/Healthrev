# M1 — Wearable pipe (backend slice)

Goal (from `CLAUDE.md`): real wearable data flowing in and visible, starting
with **one** cloud wearable. This PR is the **backend** half — data model,
consent-gated ingest, the Whoop OAuth + sync, and normalization. The Expo app
shell + on-device HealthKit/Health Connect bridge are the follow-up PR (they
can't be runtime-verified in this container).

Chosen cloud wearable: **Whoop** (free OAuth2; gives HRV, resting HR, recovery,
sleep — the signals relevant to the metabolic wedge). Steps will come from the
on-device bridge, since Whoop doesn't expose them.

## What's in this slice

| Piece | Where |
| --- | --- |
| DB schema + RLS | `supabase/migrations/0002_wearables.sql` |
| Normalized domain types | `backend/app/wearables/metrics.py` |
| Swappable provider interface | `backend/app/wearables/provider.py` |
| Whoop client (OAuth + fetch) | `backend/app/wearables/whoop.py` |
| Whoop → sample normalization | `backend/app/wearables/whoop_normalize.py` |
| Connect / refresh / sync orchestration | `backend/app/wearables/service.py` |
| Token encryption at rest | `backend/app/security/crypto.py` |
| API endpoints | `backend/app/routers/wearables.py` |

## Data model

- **`wearable_connections`** — one active OAuth link per `(user, provider)`.
  OAuth tokens are stored as **Fernet ciphertext**, never plaintext (the app
  encrypts before they reach Postgres).
- **`wearable_samples`** — normalized health samples (PHI). A `dedup_key`
  (`provider:metric:start_time`) gives idempotent re-syncs via a unique index.
  Reads require `wearable_sync` consent and are audited; RLS restricts every
  row to its owner.

Provider-specific payloads are mapped to one `WearableSample` vocabulary
(`resting_heart_rate`, `hrv`, `sleep_duration`, `sleep_efficiency`,
`recovery_score`, `steps`, `respiratory_rate`) with canonical units, so the M4
trend/fusion layer never sees Whoop-shaped JSON.

## Flow

```
POST /wearables/whoop/connect    (auth + wearable_sync consent) → { authorization_url, state }
GET  /wearables/whoop/callback   (Whoop redirect)               → exchange code, store tokens
POST /wearables/whoop/sync       (auth + wearable_sync consent) → fetch + store; returns new count
GET  /wearables/samples          (auth + wearable_sync consent) → list normalized samples
GET  /wearables/providers        (auth)                         → provider/connection status
DELETE /wearables/whoop          (auth)                         → revoke connection
```

The OAuth **callback is unauthenticated** (it's a browser redirect from Whoop),
so the originating user is recovered from a **Fernet-signed `state`** rather than
a session — tamper-proof and stateless. A tampered state yields HTTP 400.

## Compliance carried over from M0

- Connect, sync, and sample reads all pass through `require_consent(wearable_sync)`;
  the gate now records the right audit action (a sync is a `data.write`).
- The audit log records **counts only** (`new_samples`), never values — PHI is
  kept out of the trail, enforced by `build_audit_entry`.
- Tokens are encrypted at rest; the encryption key comes from the environment
  (`TOKEN_ENCRYPTION_KEY`), never code.

## Provider abstraction

`WearableClient` (in `provider.py`) mirrors the `LabExtractor` pattern: Oura /
Fitbit slot in later by implementing the same interface — the router and service
are unchanged. The HTTP transport is injected, so the Whoop client is tested
against an `httpx.MockTransport` with no network.

> **Verify before production:** Whoop evolves its API (v1 → v2). The endpoint
> constants and field names in `whoop.py` / `whoop_normalize.py` must be checked
> against current Whoop developer docs (and scopes re-confirmed) before going
> live, per CLAUDE.md "verify current caps when wiring."

## How to verify

```bash
cd backend && python -m pytest -q   # 52 tests incl. crypto, normalize, OAuth, e2e flow
ruff check .
```

The end-to-end test (`tests/test_wearables_api.py`) drives connect → callback →
sync → samples → re-sync (idempotent) → disconnect, asserts the consent gate
blocks each health-data step without `wearable_sync` consent, and confirms the
audit trail carries counts only.

## On-device ingest (constraint #1)

Apple HealthKit / Google Health Connect have no cloud API, so the mobile app
reads them on-device and **pushes** to `POST /wearables/device/{provider}/samples`
(`apple_health` / `health_connect`). The endpoint is `wearable_sync`-consent
gated and audited (counts only), validates each sample (finite value, ordered
time window, known metric), auto-creates a token-less device "connection", and
deduplicates by `dedup_key` like the cloud path. Cloud providers (Whoop) are
rejected from this endpoint — they use the OAuth sync flow.

## Mobile shell (`mobile/`)

Expo + expo-router app: Supabase email-OTP sign-in, a consent step, "Connect
Whoop" (opens the backend-issued OAuth URL), "Sync device health" (reads
HealthKit / Health Connect and pushes), and a samples dashboard. The
provider-specific reads sit behind a `HealthBridge` interface; the **pure**
normalization (`src/health/normalize.ts`) is unit-tested. See `mobile/README.md`
— native modules require a custom dev build (not Expo Go) and can't be exercised
in CI, so verify on a device before the pilot.
