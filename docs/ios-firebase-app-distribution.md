# iOS Firebase App Distribution Checklist

This checklist documents the SafeRoute Mobile inputs needed to distribute an already-produced iOS `.ipa` through Firebase App Distribution. It is intentionally no-build: do not create an Expo export, EAS build, Xcode archive, or frontend bundle from routine automation runs unless that run explicitly authorizes a build.

## Current local status

- Firebase CLI: not installed on the default shell (`firebase` command not found on 2026-07-07).
- EAS CLI: not installed globally on the default shell (`eas` command not found on 2026-07-07).
- Firebase project config: no `firebase.json` or `.firebaserc` found in the SafeRoute Mobile workspace.
- Firebase iOS app config: no `GoogleService-Info.plist` found in the SafeRoute Mobile workspace.
- iOS distribution artifact: no `.ipa` found in the SafeRoute Mobile workspace.
- Release environment: production iOS config requires `SAFEROUTE_APP_ENV=production`, an HTTPS production API URL, and `GOOGLE_MAPS_IOS_API_KEY`.
- Runtime/build tooling note: Expo CLI checks require Node 22.13+; the default shell currently reports Node 18.15.0.

## Required inputs before distribution

1. Firebase project id for the LunarChain/SafeRoute mobile distribution project.
2. Firebase iOS app id matching bundle identifier `com.lunarchain.saferoute`.
3. Firebase authentication for the CLI, preferably a scoped CI token or service account process approved by the project owner.
4. Tester group alias(es) or tester email list for the initial iOS distribution cohort.
5. A valid, signed iOS `.ipa` produced outside routine no-build automation, using the approved Apple team, signing certificate, provisioning profile, and bundle id.
6. Release notes text that identifies the SafeRoute Mobile source state, API environment, and any known limitations.
7. Confirmation that production secrets are present in the build/distribution environment and not committed to the repository.

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
```

Do not proceed if the app id, project id, tester group, artifact path, or release environment is unknown.

## Local readiness helper

The pure helper at `src/config/firebaseDistributionReadiness.ts` maps local distribution inputs into explicit blockers and produces a Firebase upload command only when every required input is present. It is covered by `test/firebaseDistributionReadiness.test.ts` and is intended for no-build release planning, not for generating artifacts.

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
- Confirm Apple signing/provisioning ownership for the first production-ready iOS artifact.
