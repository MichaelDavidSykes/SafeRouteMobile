# SafeRoute Mobile

Standalone mobile app shell for SafeRoute live mapping.

## What is included

- Expo React Native project scaffold
- Saved SafeRoute route sync from the LunarChain mobile API
- LunarChain credential sign in before route access
- Full-screen live map screen for the selected saved route
- Foreground location permission and live position watch with on-device route snapping
- Demo drive mode as an explicit developer/testing toggle
- Route summary, next movement card, convoy marker, and intelligence overlay controls
- Navigation lifecycle controls for start, pause, resume, stop, off-route, and arrival states

## Requirements

This scaffold targets Expo SDK 56, matching the Expo Go 56.x runtime used for local iOS simulator/device smoke testing. Use the Node `22` runtime from `.nvmrc` before installing dependencies. The package engine requires Node `22.13.0` or newer.

```bash
cd SafeRouteMobile
nvm use
npm install
npm run start
```

Then open the app in Expo Go, an iOS simulator, or an Android emulator.

For the no-build iOS Maestro smoke path, start the local Expo listener with `npm run start:maestro:ios` before running `npm run test:maestro:ios`. The start script preflights the local SDK 56 dependency install, Maestro CLI, booted iOS simulator, matching Expo Go SDK family, and port `8081`; if another Metro/Expo server is already listening, stop it or intentionally reuse it with the test command only so Expo Go does not attach to a stale SafeRoute bundle. The iOS smoke flow uses `exp://localhost:8081` only; if Expo Go stays on its home screen, retry from a quiet simulator/server state rather than forcing an IPv4 loopback link that can time out before app assertions.

## Test

```bash
npm test
npx expo install --check
```

`npm test` runs TypeScript, auth helper tests, API helper tests, route DTO mapping tests, and route traversal tests for snapping, off-route detection, arrival, remaining distance, and ETA.

## Release readiness checks

Do not create app bundles or exports during routine automation runs unless that run explicitly authorizes a build/export. When a release run is authorized, the current export targets are:

```bash
npx expo export --platform ios --output-dir dist
npx expo export --platform android --output-dir dist-android
```

For iOS production readiness, confirm:

- Bundle identifier: `com.lunarchain.saferoute`
- URL scheme: `saferoute`
- Foreground location permission copy is approved for App Store review: "Shows your position on the map and guides active SafeRoute trips."
- Release identity is covered by local config tests: app name `SafeRoute`, slug `saferoute-mobile`, bundle id `com.lunarchain.saferoute`, URL scheme `saferoute`, portrait orientation, light UI style, and phone-only support.
- `SAFEROUTE_APP_ENV=production` is used for release artifacts
- `SAFEROUTE_IOS_BUILD_NUMBER` is set and incremented for every signed iOS artifact
- `SAFEROUTE_PROD_API_URL` is set to the hosted HTTPS API, not a generic/local fallback
- `GOOGLE_MAPS_IOS_API_KEY` is set in the release environment
- Firebase App Distribution has a project, iOS app id, authenticated CLI, tester group, and an already-produced `.ipa` artifact before distribution

## Environment

Copy `.env.example` to `.env` when you are ready to wire real services.

```bash
SAFEROUTE_API_URL=https://your-api.example.com
SAFEROUTE_PROD_API_URL=https://api.lunarchain.net
SAFEROUTE_API_VERSION=v1
SAFEROUTE_APP_ENV=development
SAFEROUTE_ENABLE_DEMO_DRIVE=true
SAFEROUTE_ENABLE_PREVIEW_MODE=false
SAFEROUTE_IOS_BUILD_NUMBER=1
GOOGLE_MAPS_ANDROID_API_KEY=...
GOOGLE_MAPS_IOS_API_KEY=...
```

`SAFEROUTE_APP_ENV` must be `development`, `staging`, or `production`. The map works in Expo Go for early iteration. Production iOS config now fails fast unless `SAFEROUTE_PROD_API_URL` is explicitly set to a valid hosted HTTPS URL, `GOOGLE_MAPS_IOS_API_KEY` is present, and `SAFEROUTE_IOS_BUILD_NUMBER` is explicitly set to a valid App Store/TestFlight build number. Production releases intentionally do not accept a generic `SAFEROUTE_API_URL`, `localhost`, or `127.0.0.1` fallback.

Packaged runtime config also defaults to the hosted HTTPS API if a production manifest ever contains a missing or non-HTTPS API URL; local HTTP API URLs remain available for non-production simulator/dev runs.

Set `SAFEROUTE_ENABLE_PREVIEW_MODE=true` only in non-production simulator/dev runs to open the signed-in map home with local SafeRoute fixtures. This supports authenticated Saved-route UI smoke tests without real LunarChain credentials and is ignored when `SAFEROUTE_APP_ENV=production`.


## iOS release readiness notes

- Bundle identifier: `com.lunarchain.saferoute`.
- URL scheme: `saferoute`.
- The iOS release identity and phone-first display shape are guarded by `test/appConfig.test.ts`; update the tests and this checklist together if the bundle id, scheme, portrait orientation, light style, or phone-only target changes intentionally.
- Location permission copy is concise and map-first: "Shows your position on the map and guides active SafeRoute trips."
- Production runtime config should set `SAFEROUTE_APP_ENV=production`, `SAFEROUTE_PROD_API_URL` for the hosted API URL/version, an incremented `SAFEROUTE_IOS_BUILD_NUMBER`, and `GOOGLE_MAPS_IOS_API_KEY` through the build environment.
- Demo drive is intended for development/preview only; the production app config disables it even if `SAFEROUTE_ENABLE_DEMO_DRIVE` is set.
- Preview mode is intended for simulator/dev authenticated UI smoke only; production config disables it even if `SAFEROUTE_ENABLE_PREVIEW_MODE` is set.
- Firebase App Distribution still needs a valid iOS build artifact plus Firebase auth/project/app id before distribution.
- Detailed Firebase distribution prerequisites are tracked in [`docs/ios-firebase-app-distribution.md`](docs/ios-firebase-app-distribution.md).

## Backend contract

The app expects:

- `POST /api/v1/auth/login` with form-encoded credentials and `X-SafeRoute-Client: saferoute-mobile` so hosted auth can recognize native app requests.
- `POST /api/v1/auth/verify-login-code` with JSON verification data and the same mobile client header.
- `GET /api/v1/mobile/safe-route/routes?client_id={optional}`
- `GET /api/v1/mobile/safe-route/routes/{route_id}`

Saved-route endpoints require the LunarChain bearer token and return the standard LunarChain response envelope. Hosted auth remains authoritative for credentials, two-factor challenges, and session validation.

## Manual smoke

- Run Expo in LAN mode.
- Sign in with a valid LunarChain account.
- Refresh saved routes, switch workspace filters, and choose a route.
- Start navigation and verify the snapped convoy marker, off-route warning, pause/resume/stop, and arrival state on a real device.
