# iOS Firebase App Distribution Checklist

This checklist documents the SafeRoute Mobile inputs needed to distribute an already-produced iOS `.ipa` through Firebase App Distribution. It is intentionally no-build: do not create an Expo export, EAS build, Xcode archive, or frontend bundle from routine automation runs unless that run explicitly authorizes a build.

## Current local status

- Firebase CLI: not installed on the default shell (`firebase` command not found on 2026-07-07).
- EAS CLI: not installed globally on the default shell (`eas` command not found on 2026-07-07).
- Firebase project config: no `firebase.json` or `.firebaserc` found in the SafeRoute Mobile workspace.
- Firebase iOS app config: no `GoogleService-Info.plist` found in the SafeRoute Mobile workspace.
- iOS distribution artifact: no `.ipa` found in the SafeRoute Mobile workspace.
- Release environment: production iOS config requires `SAFEROUTE_APP_ENV=production`, an HTTPS production API URL, `GOOGLE_MAPS_IOS_API_KEY`, and an explicit `SAFEROUTE_IOS_BUILD_NUMBER`.
- Runtime/build tooling note: Expo CLI checks require Node 22.13+; the default shell currently reports Node 18.15.0.

## Required inputs before distribution

1. Firebase project id for the LunarChain/SafeRoute mobile distribution project.
2. Firebase iOS app id matching bundle identifier `com.lunarchain.saferoute`.
3. Firebase authentication for the CLI, preferably a scoped CI token or service account process approved by the project owner.
4. Tester group alias(es) or tester email list for the initial iOS distribution cohort.
5. A valid, signed iOS `.ipa` produced outside routine no-build automation, using the approved Apple team, signing certificate, provisioning profile, and bundle id.
6. An incremented `SAFEROUTE_IOS_BUILD_NUMBER` for the signed artifact so Firebase/TestFlight testers can distinguish releases.
7. `SAFEROUTE_APP_ENV=production`, HTTPS `SAFEROUTE_PROD_API_URL`, `GOOGLE_MAPS_IOS_API_KEY`, and the exact `SAFEROUTE_IOS_BUILD_NUMBER` used by the signed artifact.
8. Release notes text that identifies the SafeRoute Mobile source state, API environment, build number, and any known limitations.
9. Confirmation that production secrets are present in the build/distribution environment and not committed to the repository.

## Pre-distribution verification

Run these checks before uploading an already-produced `.ipa`:

```bash
# Confirm Firebase CLI auth and project visibility.
firebase login:list
firebase projects:list

# Confirm the target app is registered under the expected project.
firebase apps:list --project <firebase-project-id>

# Confirm the artifact exists and is an iOS package.
ls -lh /path/to/SafeRoute.ipa
file /path/to/SafeRoute.ipa

# Confirm the production config has the exact iOS build number intended for this artifact.
SAFEROUTE_APP_ENV=production SAFEROUTE_IOS_BUILD_NUMBER=<build-number> \
  SAFEROUTE_PROD_API_URL=https://api.lunarchain.net GOOGLE_MAPS_IOS_API_KEY=<redacted> \
  npx expo config --type public
```

Do not proceed if the app id, project id, tester group, artifact path, or release environment is unknown.

## Local readiness helper

The pure helper at `src/config/firebaseDistributionReadiness.ts` maps local distribution inputs into explicit blockers and produces a Firebase upload command only when every required input is present. It also checks the production iOS release environment (`SAFEROUTE_APP_ENV=production`, HTTPS API URL, iOS Google Maps key presence, and valid build number) without exposing secret values in its normalized output. It is covered by `test/firebaseDistributionReadiness.test.ts` and is intended for no-build release planning, not for generating artifacts.

## Upload command template

Use this only after the required inputs are confirmed and an `.ipa` already exists:

```bash
firebase appdistribution:distribute /path/to/SafeRoute.ipa \
  --app <firebase-ios-app-id> \
  --project <firebase-project-id> \
  --groups <tester-group-alias> \
  --release-notes-file /path/to/release-notes.txt
```

Record the Firebase release URL, tester group, artifact filename/checksum, CLI account used, and command result in the production readiness progress log.

## Blockers to resolve

- Install or provide Firebase CLI access for this machine or CI environment.
- Provide the Firebase project id and iOS app id for `com.lunarchain.saferoute`.
- Provide a signed `.ipa` artifact from an authorized iOS build process.
- Confirm tester groups and release notes owner.
- Confirm the signed artifact was produced with production app config, an HTTPS API URL, a present iOS Google Maps key, and the recorded build number.
- Confirm Apple signing/provisioning ownership and the build-number increment policy for the first production-ready iOS artifact.
