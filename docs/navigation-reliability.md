# SafeRoute navigation reliability

## Runtime contract

- Foreground fixes are validated before they can move the vehicle, camera, route progress, reroute evidence, or risk alerts.
- Stale/future fixes, mocked Android locations, very-low-accuracy fixes, and physically implausible teleports are rejected. Two consecutive nearby fixes can confirm a genuine relocation so one bad baseline cannot freeze navigation indefinitely.
- Nearby accepted coordinates are lightly smoothed, while heading uses circular interpolation so transitions such as 358° to 2° do not rotate the map the long way around.
- Route snapping and monotonic progress remain authoritative after signal filtering.

## Active-route recovery

- Only navigating, off-route, and paused sessions are persisted.
- The local record contains route/guidance presentation data and the newest accepted location. It never contains an access token, password, login code, person manifest, or vehicle inventory.
- Records expire after 24 hours and fail closed when malformed, oversized, terminal, or geometrically incomplete.
- Route progress can recover for the full session lifetime, but a last-known vehicle position older than two minutes is never presented as current.
- End, arrival, sign-out, and authenticated-session expiry clear the active record and stop native background updates.
- Leaving the route view does not silently end an active route. A compact text-only **Resume route** action reopens it.

## Background location

- Background guidance is opt-in through **Keep active** after foreground guidance starts.
- Installed iOS builds use the `location` background mode and automotive-navigation activity type.
- Installed Android builds use a foreground-service notification and explicit background-location permission.
- Updates are distance/time bounded to balance navigation responsiveness and battery use.
- The background task writes only the newest valid location to a route-scoped storage key. Foreground code merges it only when it is newer and belongs to the active route.
- Expo Go has no Android background-location support and only limited iOS Simulator support. Foreground flows remain functional, unsupported runtimes add no warning chrome, and lock-screen field acceptance is performed with an installed app build.
- Operating systems may stop updates after a force-quit. SafeRoute resumes after the user reopens the app and a fresh location becomes available.

## Required field QA

1. Start a real snapped route with precise foreground location.
2. Confirm stationary GPS jitter does not spin or repeatedly move the drive-along camera.
3. Enable **Keep active**, lock the screen, move for at least 30 seconds, then unlock and confirm progress resumes at the newest position.
4. Background and foreground the app repeatedly while moving.
5. Deny background permission and verify foreground guidance remains usable without repeated prompts.
6. Pause and confirm background updates stop; resume and confirm authorized tracking restarts.
7. Move off route with good accuracy and verify reroute evidence still triggers; inject a poor-accuracy fix and verify it does not trigger a false reroute.
8. Leave the live map and use **Resume route**.
9. End and arrive on separate runs; verify no resume action remains after relaunch.
10. Repeat on a current iPhone and Android device under strong GPS, urban-canyon GPS, and intermittent network conditions.
