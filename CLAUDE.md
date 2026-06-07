# CLAUDE.md — Chronic Health Tracker (MVP)

> This file is read by Claude Code at the start of every session. It sets the
> architecture, standards, and guardrails. Keep it updated as decisions change.

## What we’re building

A mobile app that tracks chronic-condition blood markers over time and fuses them
with fitness-wearable data to show trends and “what to change before your next test.”

**Wedge for the MVP:** pre-diabetes / metabolic health only. Markers in scope:
fasting glucose, HbA1c, fasting insulin, HOMA-IR, lipid panel (LDL, HDL, TG).
Do NOT build for “all conditions” yet. One condition, done well.

**The defensible part is the normalization + trend/projection layer**, not data
collection. Spend quality there.

## Hard architectural constraints (do not violate)

1. **Native iOS + Android required.** Apple HealthKit and Google Health Connect are
   device-local with no cloud API. Wearable data from Apple/Google/Samsung must be
   read on-device and pushed to our backend. We CANNOT be web-only.
1. **DPDPA from day one.** This is sensitive health data. Every data read requires a
   valid, unexpired, purpose-specific consent record. Never log PHI. Encrypt at rest
   and in transit. Maintain an audit trail of every access.
1. **Projection honesty rule.** Only output a *numeric* prediction for glucose and
   insulin-resistance markers (these are genuinely inferable from wearables). For all
   other markers, use directional language only (“trending toward…”). Never present
   an algorithmically-derived number as if it were a measured lab value.
1. **Extracted data is untrusted until confirmed.** Anything from OCR/LLM extraction
   or handwriting must pass a user “review & confirm” step before it’s stored as truth.

## Tech stack (ZERO-COST pilot — free tiers only)

Goal: build and run the first 100 users at $0 out of pocket. Pick paid upgrades only
after retention is proven. Free-tier limits change, so verify current caps when wiring.

- **Mobile:** React Native (Expo) with native health modules (HealthKit /
  Health Connect). Flutter is acceptable if preferred — decide once, don’t mix.
  Ship BOTH platforms: iOS via TestFlight, Android via Play closed testing.
- **Backend + DB + auth:** Supabase free tier (Postgres + auth + storage). API on
  Render / Railway / Fly.io free tier. Defer Redis/Celery — run extraction jobs inline
  or with a lightweight queue until volume needs it.
- **Wearables:** direct free OAuth APIs (Whoop, Oura, Fitbit, Garmin) + the native
  on-device bridge for Apple/Google. Optionally self-host Open Wearables (MIT, $0/user)
  as the unified layer. NO paid aggregator (Terra) until scale.
- **Lab-report extraction:** abstract behind a `LabExtractor` interface so the provider
  is swappable. For the pilot use a FREE tier (e.g. Gemini free tier) or open-source OCR.
  NOTE: Claude Pro powers the developer (Claude Code), NOT the app — the app’s AI is a
  separate per-token API cost, so keep it on a free provider for now.
- **Auth:** Supabase email/OTP for MVP. ABDM/ABHA consent flow comes later (M6), not now.

## Build order (modules)

Build and verify ONE module before starting the next. Don’t scaffold everything at once.

- **M0 — Foundation.** Repo, CI, env/secrets management, PostgreSQL schema, auth,
  and the consent + audit-log tables. Compliance scaffolding exists before any feature.
- **M1 — Wearable pipe.** Native app shell + on-device HealthKit/Health Connect bridge
  - ONE cloud wearable (start with Whoop or Oura) via its free OAuth API. Goal: real
    wearable data (sleep, RHR, HRV, steps, glucose if available) flowing in and visible.
- **M2 — Report ingestion.** Camera/PDF upload + vision extraction (free-tier provider
  behind the `LabExtractor` interface) for the pre-diabetes panel only. Include the
  mandatory “review & confirm” UX. Store images.
- **M3 — Normalization layer.** Map every extracted value to LOINC, convert units,
  store the per-lab reference range. This is what lets us trend across different labs.
- **M4 — Intelligence.** Per-marker trend engine; the fusion model linking wearable
  signals to lab deltas; projection (numeric for glucose/insulin, directional else).
- **M5 — Presentation.** Dashboard, trend charts, “what changed / what to adjust before
  your next test,” basic nudges. Condition-first framing.
- **M6 — ABDM (post-pilot, not in first 100 users).** Register as a Health Information
  User, integrate the NHA sandbox, build the consent artefact flow, then certify.

## Coding standards

- Tests required for backend logic (normalization and projection especially).
- No secrets in code. No PHI in logs, error messages, or analytics.
- Every endpoint that reads user health data checks consent validity first.
- Small, reviewable PRs per module. Update this file when a decision changes.
- Prefer boring, well-supported libraries over clever ones.

## Explicitly out of scope for now

Handwritten-prescription extraction (store image only), multi-condition support,
insurer/employer B2B features, and ABDM (until M6). Don’t build these unasked.

## Module status

- **M0 — Foundation: DONE.** Backend = Python / FastAPI. DB = Supabase Postgres
  with SQL migrations under `supabase/migrations/`. See `README.md` for layout and
  `docs/M0-foundation.md` for the compliance design (consent + audit log).
- **M1 — Wearable pipe: IN PROGRESS.** Cloud wearable = **Whoop** (free OAuth2).
  Backend slice done: data model, consent-gated ingest, OAuth + sync, normalization
  to a shared sample vocabulary, encrypted tokens at rest. See `docs/M1-wearables.md`.
  Remaining: Expo app shell + on-device HealthKit / Health Connect bridge.
