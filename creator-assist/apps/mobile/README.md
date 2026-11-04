# Creator Assist: iOS and Android app

Expo (React Native) with Expo Router and TypeScript, built as **development builds** (not Expo Go),
because the share extension and push notifications need native code. It talks to the web app's
`/api/v1` (see `../../docs/api-v1.md`) and signs in with Supabase. The design follows `../../DESIGN.md`;
calculations, API types and the API client come from `packages/shared`.

## Run it on a simulator / emulator (Mac)

You need: Node 22, pnpm 10, **Xcode** (with an iOS Simulator runtime) and **Android Studio**
(with an emulator image, e.g. Pixel 7 on API 35), plus CocoaPods (`brew install cocoapods`).

```bash
cd creator-assist
pnpm install
cp apps/mobile/.env.example apps/mobile/.env      # public values only (API URL + Supabase anon key)

# iOS: builds the dev client, installs it on the simulator and starts Metro
pnpm --filter @creator-assist/mobile ios

# Android: start an emulator in Android Studio first (Device Manager → ▶), then
pnpm --filter @creator-assist/mobile android
```

The first build takes several minutes (it generates `ios/` and `android/`, which are not committed).
After that, `pnpm --filter @creator-assist/mobile start` reloads JavaScript changes instantly.

**Signing in.** Email codes work today. Mobile OTP shows only when the server has SMS switched on
(`NEXT_PUBLIC_SMS_ENABLED`); the store reviewer number gets a fixed code (Supabase → Auth → Phone →
Test phone numbers).

## What's where

- `app/`: screens (file-based routes). `_layout.tsx` loads fonts and routes by session state:
  signed out → `sign-in`, no profile yet → `setup`, otherwise the five tabs in `app/(tabs)/`.
- `src/session.tsx`: the Supabase session plus `me` from `/api/v1/me/bootstrap`, and the remote
  config (feature flags, minimum app version, sign-in methods) read once at start-up.
- `src/lib/secure-storage.ts`: the session lives in the iOS Keychain / Android Keystore
  (expo-secure-store), split into chunks because a session is larger than one entry allows.
- `src/lib/page-tracker.tsx`: `page_view` per screen with the web's paths; the API client sends
  `X-Client-Platform: ios | android`, so every event and sign-up records its platform.
- `src/ui/`: Bold Creator components (text, buttons, fields, rows, chips, tiles) on the shared tokens.

## Checks

```bash
pnpm --filter @creator-assist/mobile typecheck
pnpm --filter @creator-assist/mobile bundle:check   # compiles the iOS and Android JS bundles
```

Nothing secret ships in the app: only `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. Service keys, encryption, email and AI keys stay on the server.
