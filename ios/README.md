# SafeRoute Mobile — iOS

The current SafeRoute mobile application lives under the repository `ios/` platform directory. The sibling `android/` directory is intentionally reserved for a future Android application.

Standalone iOS-first mobile app shell for SafeRoute live mapping.

## What is included

- Expo React Native project scaffold
- Saved SafeRoute route sync from the LunarChain mobile API
- LunarChain credential sign in before route access
- Full-screen live map screen for the selected saved route
- Foreground location permission and live position watch with on-device route snapping
- Accuracy-aware GPS filtering, circular heading smoothing, and implausible-jump rejection
- Time-bounded active-route recovery with a compact Resume route action
- Opt-in background guidance for installed builds so active tracking can continue with the screen locked
- Guest route previews can consume a fail-closed road-snapped route geometry before opening live guidance
- Deterministic route-preview movement reserved for explicit development preview sessions
- Route summary, next movement card, position marker, and intelligence overlay controls
- Navigation lifecycle controls for start, pause, resume, stop, off-route, and arrival states

## Requirements

This scaffold targets Expo SDK 54, matching the Expo Go 54.x runtime used for local iOS simulator/device smoke testing. Use the Node `22` runtime from `.nvmrc` before installing dependencies. The package engine requires Node `22.13.0` or newer.

```bash
cd SafeRouteMobile/ios
nvm use
npm install
npm run start
```

Then open the app in Expo Go on an iOS simulator or iOS device.

For the no-build iOS Maestro smoke path and auth coverage, run `npm run start:maestro:ios:preview` for the preview route and map-interaction flows. Use `npm run start:maestro:ios:preview:risk-areas` for the Cape Town risk-area flow so the server is explicitly pinned to preview guest-map mode, `npm run start:maestro:ios:preview:operations` for the operations flow so Expo Go starts directly on the authenticated preview Operations surface, `npm run start:maestro:ios:preview:saved-routes` for the saved-route picker flow so it starts directly on Saved, and `npm run start:maestro:ios:preview:routes-empty` for the no-saved-routes empty-state flow. Use `npm run start:maestro:ios:preview:auth` for the auth UI flow so Expo Go opens directly on the branded sign-in surface, `npm run start:maestro:ios:preview:auth-code` for the two-factor code UI flow so no real OTP is needed, and `npm run start:maestro:ios:preview:session-expired` for the expired-session recovery notice. These start commands preflight the Node 22.13+ runtime declared by `package.json`, the local SDK 54 dependency install, Maestro CLI, a booted iOS simulator, the matching Expo Go SDK family, and port `8081`. If the simulator has a different Expo Go SDK, run `npm run repair:maestro:ios:expo-go`; this downloads and installs the matching simulator-only Expo Go runtime without building SafeRoute. If another Metro/Expo server is already listening, stop it or intentionally reuse it with the matching test command only so Expo Go does not attach to a stale SafeRoute bundle. The guidance-contract matrix additionally reads the live Expo manifest before starting its API and rejects a listener unless the SafeRoute slug, project root, full Git revision, contract API URL, and disabled preview/demo flags exactly match the current checkout. Fresh public and workspace Starts are prepared separately from their tap, then armed, bracketed, and quarantined in the durable request journal. Every instrumented request records one arrival and one correlated terminal outcome from the fixture response `finish` or premature connection closure. Revision-bound device evidence is separately spooled until the local fixture acknowledges the exact event ID, and the matrix requires correlated persistence, restore, workspace-recovery, navigation-cleanup, and tracking-stop evidence before success; its `evidence.jsonl` path is printed beside the request journal. Public Start must issue no protected request; initial, reseed, and denial-seed workspace Starts must each complete exactly `/users/me` as principal A and one unscoped active route catalog with HTTP 200; wrong-principal Start must complete only `/users/me` as principal B with HTTP 200; and denied Start must complete principal A plus the authoritative unscoped empty catalog with HTTP 200, apply and durably persist that catalog without duplicate discovery, purge every newly unavailable workspace cache, close any affected preview or guidance, and settle in the no-access UI. Delayed protected preparation traffic or protected traffic inside the bounded two-second post-close quarantine fails the matrix; this is deterministic local evidence, not causal proof against arbitrarily delayed native retries. The Maestro npm scripts resolve the CLI from `MAESTRO_BIN`, `~/.maestro/bin/maestro`, or `maestro` on `PATH`; they set `MAESTRO_DRIVER_STARTUP_TIMEOUT=180000` unless already configured and retry `maestro test` once by default to recover local XCUITest driver connection drops. Set `MAESTRO_RETRIES=0` when debugging without retries. The iOS flows use `exp://localhost:8081` only; if Expo Go stays on its home screen, retry from a quiet simulator/server state rather than forcing an IPv4 loopback link that can time out before app assertions.

## Test

```bash
npm test
npx expo install --check
```

`npm test` runs TypeScript, auth helper tests, API helper tests, route DTO mapping tests, and route traversal tests for snapping, off-route detection, arrival, remaining distance, and ETA.

## Release readiness checks

Do not create app bundles or exports during routine automation runs unless that run explicitly authorizes a build/export. When a release run is authorized, the current iOS export target is:

```bash
npx expo export --platform ios --output-dir dist
```

For iOS production readiness, confirm:

- Bundle identifier: `com.lunarchain.saferoute`
- URL scheme: `saferoute`
- Foreground location permission copy is approved for App Store review: "Shows your position on the map and guides active SafeRoute trips."
- Launch splash uses the light iOS grouped background (`#f2f2f7`) with a quiet SafeRoute mark so startup matches the map-first UI.
- Release identity is covered by local config tests: app name `SafeRoute`, slug `saferoute-mobile`, bundle id `com.lunarchain.saferoute`, URL scheme `saferoute`, portrait orientation, light UI style, and phone-only support.
- `SAFEROUTE_APP_ENV=production` is used for release artifacts
- `SAFEROUTE_IOS_BUILD_NUMBER` is set and incremented for every signed iOS artifact
- `SAFEROUTE_PROD_API_URL` is set to the hosted HTTPS API, not a generic/local fallback
- The native Apple Maps provider is used on iOS; no Google Maps iOS key is required
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
```

`SAFEROUTE_APP_ENV` must be `development`, `staging`, or `production`. The map works in Expo Go for early iteration. Production iOS config fails fast unless `SAFEROUTE_PROD_API_URL` is explicitly set to a valid hosted HTTPS URL and `SAFEROUTE_IOS_BUILD_NUMBER` is explicitly set to a valid App Store/TestFlight build number. Production releases intentionally do not accept a generic `SAFEROUTE_API_URL`, `localhost`, or `127.0.0.1` fallback.

Foreground route planning and live-location smoke tests work in Expo Go. Release-equivalent background testing requires an installed development, preview, or production build: Expo Go does not provide Android background location, and its iOS Simulator support is only a limited development aid. During a live route, the compact **Keep active** action requests background access only after foreground guidance is already running.

Packaged runtime config also defaults to the hosted HTTPS API if a production manifest ever contains a missing or non-HTTPS API URL; local HTTP API URLs remain available for non-production simulator/dev runs.

Set `SAFEROUTE_ENABLE_PREVIEW_MODE=true` only in non-production simulator/dev runs to open the signed-in map home with local SafeRoute fixtures. `SAFEROUTE_PREVIEW_INITIAL_SCREEN=operations` opens the view-only Operations surface, `SAFEROUTE_PREVIEW_INITIAL_SCREEN=routes` opens Saved routes, `SAFEROUTE_PREVIEW_INITIAL_SCREEN=routes-empty` opens Saved with no local route cards, `SAFEROUTE_PREVIEW_INITIAL_SCREEN=login-code` opens the two-factor code UI, and `SAFEROUTE_PREVIEW_INITIAL_SCREEN=session-expired` opens the sign-in recovery notice, so supporting-flow UI smoke tests do not need real LunarChain credentials or OTP. Preview mode is ignored when `SAFEROUTE_APP_ENV=production`.


## iOS release readiness notes

- Bundle identifier: `com.lunarchain.saferoute`.
- URL scheme: `saferoute`.
- The iOS release identity and phone-first display shape are guarded by `test/appConfig.test.ts`; update the tests and this checklist together if the bundle id, scheme, portrait orientation, light style, or phone-only target changes intentionally.
- Location permission copy is concise and map-first: "Shows your position on the map and guides active SafeRoute trips."
- Background location copy is purpose-specific: "Keeps active SafeRoute guidance and safety monitoring running when the screen is locked."
- The Expo location plugin enables iOS `location` background mode plus Android foreground-service/background-location permissions for installed builds.
- Production runtime config should set `SAFEROUTE_APP_ENV=production`, `SAFEROUTE_PROD_API_URL` for the hosted API URL/version, and an incremented `SAFEROUTE_IOS_BUILD_NUMBER`.
- Demo drive is intended for development/preview only; the production app config disables it even if `SAFEROUTE_ENABLE_DEMO_DRIVE` is set.
- Preview mode is intended for simulator/dev authenticated UI smoke only; production config disables it even if `SAFEROUTE_ENABLE_PREVIEW_MODE` is set.
- Firebase App Distribution still needs a valid iOS build artifact plus Firebase auth/project/app id before distribution.
- Detailed Firebase distribution prerequisites are tracked in [`docs/ios-firebase-app-distribution.md`](docs/ios-firebase-app-distribution.md).

## Backend contract

The app expects:

- `POST /api/v1/auth/mobile-login` with form-encoded credentials. This dedicated, rate-limited native endpoint does not use browser-only Turnstile and does not trust a spoofable client-bypass header.
- `POST /api/v1/auth/verify-login-code` with JSON verification data for two-factor completion.
- `GET /api/v1/users/me` with the LunarChain bearer token for session restore validation.
- `GET /api/v1/mobile/safe-route/routes?client_id={optional}`
- `GET /api/v1/mobile/safe-route/routes/{route_id}`
- `GET /api/v1/mobile/safe-route/operations/client/{client_id}` for the sanitized, read-only planned-trip, calendar, person, and vehicle projection. Sensitive inventory fields stay on the web operations API.

Saved-route endpoints require the LunarChain bearer token and return the standard LunarChain response envelope. Route list rows must include stable non-empty `id` values before they are shown in the picker; malformed list payloads fall back to the empty picker state instead of crashing. Route detail payloads should echo that id, and the app falls back to the requested id if the detail response omits it; malformed detail payloads surface concise retry copy instead of opening a broken map. Risk overlay radii should be expressed in meters; the mobile mapper treats malformed/negative radii as a compact 250 m overlay and caps imported circular overlays at 50 km so bad hosted data cannot flood the map. Hosted auth remains authoritative for credentials, two-factor challenges, and session validation.

Guest route road snapping is intentionally fail-closed in production: the mobile route service accepts only snapped provider geometry that covers every requested stop in order, applies bounded high-risk avoidance areas, and scans bounded corridor-risk chunks before presenting a drivable route. Local straight-line fixtures remain available only in explicit non-production preview mode.

## Manual smoke

- Run Expo in LAN mode.
- Sign in with a valid LunarChain account.
- Refresh saved routes, switch workspace filters, and choose a route.
- Start navigation and verify the snapped convoy marker, off-route warning, pause/resume/stop, and arrival state on a real device.
- Enable **Keep active**, lock the phone for at least two location updates, unlock it, and verify the route resumes from the newest accepted position without moving backwards.
- Leave active guidance for another screen and verify the text-only **Resume route** action returns to the active route; confirm End, arrival, sign-out, and session expiry clear it.

See [`docs/navigation-reliability.md`](docs/navigation-reliability.md) for the background-permission, persistence, privacy, and field-QA contract.
