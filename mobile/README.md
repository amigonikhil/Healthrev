# Chronic Health Tracker — mobile (Expo / React Native)

The native app shell for M1. Signs in (Supabase email OTP), captures consent,
connects a cloud wearable (Whoop) via the backend OAuth flow, and reads
on-device **HealthKit (iOS)** / **Health Connect (Android)** data and pushes it
to the backend.

> **Native modules required.** HealthKit and Health Connect are native; this app
> **cannot run in Expo Go**. You need a custom dev client / native build
> (`expo run:ios` / `expo run:android`). iOS HealthKit needs a real device or a
> simulator with Health data; Health Connect needs the Health Connect app on an
> Android 14+ device.

## Layout

```
mobile/
├── app/                       # expo-router screens
│   ├── _layout.tsx            # providers + stack
│   ├── index.tsx              # auth gate → sign-in or home
│   ├── sign-in.tsx            # email OTP
│   └── home.tsx               # consent, connect Whoop, sync device, samples list
├── src/
│   ├── api/client.ts          # typed backend client (attaches Supabase JWT)
│   ├── auth/AuthProvider.tsx  # Supabase session + OTP
│   ├── lib/{config,supabase}.ts
│   └── health/
│       ├── types.ts           # mirrors backend WearableMetric + ingest contract
│       ├── normalize.ts       # PURE mapping → backend payload (unit-tested)
│       ├── bridge.ts          # HealthBridge interface + platform selection
│       ├── healthkit.ts       # iOS (react-native-health)
│       └── healthConnect.ts   # Android (react-native-health-connect)
└── __tests__/normalize.test.ts
```

## Setup

```bash
cd mobile
npm install
cp .env.example .env     # fill in Supabase URL + anon key, and the API base URL
```

`.env` holds only **public** values (`EXPO_PUBLIC_*`). Never put the Supabase
service-role key or any secret here — Expo inlines these into the client bundle.

## Run

```bash
npm run ios       # or: npm run android   (builds a dev client)
npm start         # then open the dev client
npm test          # jest — runs the pure normalization tests
npm run lint      # tsc --noEmit
```

Point `EXPO_PUBLIC_API_BASE_URL` at the running FastAPI backend (use your
machine's LAN IP, not `localhost`, when testing on a physical device).

## How data flows

1. **Sign in** with an email OTP (Supabase).
2. **Consent** to `wearable_sync` — required before any health-data call; the
   backend rejects reads/writes without it and audits every access.
3. **Whoop**: the app asks the backend for an authorization URL, opens it, and
   Whoop redirects back to the backend callback, which stores encrypted tokens.
   The app then triggers a sync.
4. **On-device**: the app reads HealthKit / Health Connect locally and pushes
   normalized samples to `POST /wearables/device/{provider}/samples`.
5. **Dashboard**: shows synced samples from `GET /wearables/samples`.

## What's verified vs. not

The **pure** normalization layer (`src/health/normalize.ts`) is unit-tested and
type-checked. The screens and native bridges are written against
`react-native-health` / `react-native-health-connect` and reviewed by
inspection — they require a device/simulator to exercise at runtime, which isn't
available in CI. Verify the native flows on a real dev build before the pilot.
