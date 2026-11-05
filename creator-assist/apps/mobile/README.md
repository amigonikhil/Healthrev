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

- `app/`: screens (file-based routes, same paths as the web so links map one to one).
  - `_layout.tsx` loads fonts and routes by session state: signed out → `sign-in`, no profile →
    `onboarding`, otherwise `(app)`.
  - `(app)/_layout.tsx` is the signed-in stack with the native header (iOS swipe-back, Android back
    button). Its first screen is the five tabs in `(app)/(tabs)/`; deal, tax and settings pages push
    on top: `deals/new`, `deals/[id]` (+ `agreement`, `invoice`, `reminders`, `payment`, `paid`,
    `escalate`, `notice`), `tax/remind/[brandId]`, `settings/profile|reminders|rates`.
- `src/session.tsx`: the Supabase session plus `me` from `/api/v1/me/bootstrap`, and the remote
  config (feature flags, minimum app version, sign-in methods, support contact) read at start-up.
- `src/lib/`: API client, SecureStore session storage (Keychain / Keystore, chunked), feature flags
  (`useFlag`: an off feature isn't shown at all), WhatsApp / share sheet / PDF download helpers,
  the offline banner, `page_view` tracking with the web's paths.
- `src/ui/`: Bold Creator components on the shared tokens: text, buttons, fields, rows, chips,
  tiles, bottom sheets, switches, steppers, native date pickers (iOS inline calendar, Android
  Material dialog), searchable pickers, toasts (announced to VoiceOver / TalkBack), action bar.

**Not in the app yet:** "File with Creator Assist" (AI call) and the paid legal call. Both charge a
fee and nothing collects payment yet, so they stay hidden even if their flags are switched on.

## Test on your phone (before the store)

Builds come from EAS (expo.dev, free plan) using the profiles in `eas.json`. `preview` and
`development` talk to the `native-app` preview server; `production` talks to the live site.
Test builds use the same Supabase database as the live site (a separate staging database comes
with production hardening), so sign in with your own email.

On your computer (Node 22, pnpm 10):

```bash
git clone https://github.com/amigonikhil/Healthrev.git && cd Healthrev && git checkout native-app
cd creator-assist && pnpm install && cd apps/mobile
npx eas-cli login
```

**Android** (no paid account needed):

```bash
npx eas-cli build --platform android --profile preview
```

When it finishes (about 15 minutes), open the link or scan the QR code on your phone and install
the APK (allow "install unknown apps" for your browser when asked).

**iPhone, free, today: Expo Go.** Install **Expo Go** from the App Store, put the iPhone on the same
Wi-Fi as your computer, then:

```bash
cp .env.example .env
pnpm go            # add --tunnel if the phone and computer aren't on the same network
```

Scan the QR code with the iPhone camera. The app runs inside Expo Go (not under its own icon), so
the share target and https links don't apply there; everything else, including Face ID lock, works.

**iPhone, as a real app** needs the Apple Developer Program ($99 a year, also needed for the App Store):

```bash
npx eas-cli device:create          # open the link on your iPhone to register it
npx eas-cli build --platform ios --profile preview
```

Then open the link on the iPhone to install. After a later production build, TestFlight works too.

`--profile development` makes a development build instead: it also has the share target and
loads JavaScript from `pnpm --filter @creator-assist/mobile start` on your computer, so changes
show up without rebuilding.

Push on Android also needs `google-services.json` from Firebase (see below); without it the app
works, notifications just stay off.

## Push, links and the share target: what each needs

| Feature | Needs | Where it goes |
|---|---|---|
| Push tokens | The EAS project (linked: `037679d5-c8ff-429a-8d5b-6403a5a0fb40`) | `app.config.ts` → `extra.eas.projectId` |
| Push on iPhone | An APNs key (Apple Developer account) | Uploaded once with `eas credentials` |
| Push on Android | A Firebase project (free) → `google-services.json` | EAS file env var `GOOGLE_SERVICES_JSON` |
| Universal links (iOS) | Apple Team ID | `APPLE_TEAM_ID` on the web app (Vercel) |
| App Links (Android) | SHA-256 of the app signing key (Play Console) | `ANDROID_CERT_SHA256` on the web app |
| Share target | Turning on `deal_from_chat` | `SHARE_TARGET=1` in that build's EAS profile |

Without these, the app still works: notifications just stay off, https links open in the browser,
and Paste a chat is only reachable from inside New deal (when its flag is on).

- **Push** (sent by the web app's hourly cron and when a brand signs): WhatsApp reminder due,
  payment due today, overdue, agreement signed, TDS missing from AIS, filing due in 7 days. Each
  event notifies once, only 09:00–21:00 IST (signatures straight away), never for sample deals,
  never with PAN, bank details or codes. Creators switch kinds off in Settings → Notifications.
  The app offers notifications once, after the first deal.
- **Deep links**: `creatorassist://deal/<id>` and https links to the web app open the matching
  screen (same paths as the web); links opened while signed out open after sign-in. The brand
  signing page always stays on the web.
- **App lock**: optional Face ID / Touch ID / fingerprint (Settings), asked at launch and after a
  minute in the background.

## Checks

```bash
pnpm --filter @creator-assist/mobile typecheck
pnpm --filter @creator-assist/mobile bundle:check   # compiles the iOS and Android JS bundles
```

Nothing secret ships in the app: only `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY`. Service keys, encryption, email and AI keys stay on the server.
