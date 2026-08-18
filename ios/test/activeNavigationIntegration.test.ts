import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("production navigation reliability integration", () => {
  it("registers the background task before the React app mounts", () => {
    const indexSource = source("index.ts");
    const taskSource = source(
      "src/features/live-map/backgroundNavigationTask.ts",
    );

    assert.match(indexSource, /backgroundNavigationTask/);
    assert.match(taskSource, /TaskManager\.defineTask/);
    assert.match(taskSource, /saveBackgroundNavigationLocation/);
    assert.match(taskSource, /location\.mocked !== true/);
    assert.match(taskSource, /runtimePermitStatus === "none"/);
    assert.match(taskSource, /getPersistedActiveNavigationAuthorization/);
    assert.match(taskSource, /authorization\.navigationInstanceId/);
    assert.match(taskSource, /runtimePermitStatus === "pending"/);
    assert.match(taskSource, /stopUnauthorizedBackgroundNavigationTask/);
    assert.match(taskSource, /stopLocationUpdatesAsync/);
    assert.match(
      source("src/features/live-map/activeNavigationSession.ts"),
      /runtimeBackgroundNavigationPermit\.matches\(permit\)[\s\S]*isBackgroundNavigationWriteAuthorized/,
    );
  });

  it("uses battery-bounded automotive background tracking without persisting credentials", () => {
    const backgroundSource = source(
      "src/features/live-map/backgroundNavigation.ts",
    );
    const sessionCoreSource = source(
      "src/features/live-map/activeNavigationSessionCore.ts",
    );

    assert.match(backgroundSource, /AutomotiveNavigation/);
    assert.match(backgroundSource, /deferredUpdatesDistance:\s*30/);
    assert.match(backgroundSource, /deferredUpdatesInterval:\s*15_000/);
    assert.match(backgroundSource, /distanceInterval:\s*10/);
    assert.match(backgroundSource, /timeInterval:\s*5_000/);
    assert.match(backgroundSource, /foregroundService:/);
    assert.doesNotMatch(sessionCoreSource, /accessToken|password|loginCode/);
    assert.match(backgroundSource, /await revokeBackgroundNavigationPermit\(\)/);
    assert.match(backgroundSource, /prepareBackgroundNavigationPermit/);
    assert.match(backgroundSource, /activateBackgroundNavigationPermit/);
    assert.match(backgroundSource, /backgroundNavigationLifecycle\.requestStart/);
    assert.match(backgroundSource, /backgroundNavigationLifecycle\.requestStop/);
    assert.match(
      backgroundSource,
      /confirmBackgroundNavigationStopped[\s\S]*getRuntimeBackgroundNavigationPermitStatus[\s\S]*hasStartedLocationUpdatesAsync/,
    );
    const authorizedStart = backgroundSource.slice(
      backgroundSource.indexOf("async function startAuthorizedBackgroundNavigation"),
    );
    assert.ok(
      authorizedStart.indexOf("prepareBackgroundNavigationPermit") <
        authorizedStart.indexOf("Location.startLocationUpdatesAsync"),
    );
    assert.ok(
      authorizedStart.indexOf("Location.startLocationUpdatesAsync") <
        authorizedStart.indexOf("activateBackgroundNavigationPermit"),
    );
  });

  it("persists, restores, resumes, and clears active navigation sessions", () => {
    const appSource = source("App.tsx");
    const activeSessionSource = source(
      "src/features/live-map/activeNavigationSession.ts",
    );
    const liveMapSource = source("src/features/live-map/LiveMapScreen.tsx");

    assert.match(appSource, /loadActiveNavigationSession/);
    assert.match(
      activeSessionSource,
      /readActiveNavigationSession[\s\S]*status: "absent"[\s\S]*status: "present"[\s\S]*status: "unknown"/,
    );
    assert.match(
      appSource,
      /entryTrackingVerification[\s\S]*confirmBackgroundNavigationStopped\(\)[\s\S]*stopBackgroundNavigation\(\)[\s\S]*readActiveNavigationSession\(\)[\s\S]*navigationReadback\.status === 'absent'[\s\S]*recordNavigationAbsenceReadback\(entryTrackingVerification\)/,
    );
    assert.match(appSource, /openActiveNavigationSession/);
    assert.match(appSource, /ResumeNavigationButton/);
    assert.match(appSource, /clearActiveNavigationSession/);
    assert.match(
      activeSessionSource,
      /revokeTerminalActiveNavigationStorage[\s\S]*clearActiveNavigationSession\(\)[\s\S]*if \(!revoked\)[\s\S]*throw new Error/,
    );
    assert.match(liveMapSource, /createActiveNavigationSession/);
    assert.match(liveMapSource, /saveActiveNavigationSession/);
    assert.match(liveMapSource, /initialNavigationSession/);
    assert.match(
      liveMapSource,
      /isNavigationSessionForRoutePreview\(\{[\s\S]*navigationSession: initialNavigationSession[\s\S]*routeContext[\s\S]*routePlan/,
    );
    assert.doesNotMatch(
      liveMapSource,
      /initialNavigationSession\?\.routePlan\.route\.id\s*===\s*routePlan\.route\.id/,
    );
    assert.match(
      liveMapSource,
      /resumedNavigationSession\?\.navigationInstanceId[\s\S]*createActiveNavigationInstanceId/,
    );
    assert.match(
      liveMapSource,
      /backgroundTrackingRequested[\s\S]*resumedNavigationSession\?\.backgroundTrackingEnabled/,
    );
    assert.match(
      liveMapSource,
      /navigationState === "loaded" \|\| navigationState === "stopped"[\s\S]*setNavigationInstanceId\(createActiveNavigationInstanceId\(startedAtMs\)\)/,
    );
    assert.match(
      liveMapSource,
      /saved = await saveActiveNavigationSession\(snapshot\)[\s\S]*recordGuidanceContractEvidence/,
    );
    assert.match(
      liveMapSource,
      /evidenceRecorded = await recordGuidanceContractEvidence[\s\S]*if \(evidenceRecorded\)[\s\S]*persistedEvidenceNavigationIdRef\.current/,
    );
    assert.match(
      liveMapSource,
      /SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED[\s\S]*navigationState !== "loaded"[\s\S]*readActiveNavigationSession\(\)[\s\S]*confirmBackgroundNavigationStopped\(\)[\s\S]*type: "navigation\.prestart\.readback"/,
    );
    const prestartReadback = liveMapSource.slice(
      liveMapSource.indexOf("const recordPrestartReadback"),
      liveMapSource.indexOf("void recordPrestartReadback"),
    );
    assert.ok(
      prestartReadback.indexOf("readActiveNavigationSession()") <
        prestartReadback.indexOf("confirmBackgroundNavigationStopped()"),
    );
    assert.doesNotMatch(prestartReadback, /stopBackgroundNavigation\(/);
    assert.match(
      liveMapSource,
      /setInterval\(\(\) => \{[\s\S]*void persistCurrentSession\(\);[\s\S]*\}, 15_000\)/,
    );
    assert.match(activeSessionSource, /ACTIVE_NAVIGATION_SESSION_DELTA_KEY/);
    assert.match(
      activeSessionSource,
      /persistedRouteRevision !== routeRevision \|\|[\s\S]*persistedNavigationInstanceId !== session\.navigationInstanceId/,
    );
  });

  it("requires a fresh route start to be near the live vehicle location", () => {
    const liveMapSource = source("src/features/live-map/LiveMapScreen.tsx");

    assert.match(liveMapSource, /routeStartProximityBlockedReason/);
    assert.match(
      liveMapSource,
      /navigationState === "loaded" \|\| navigationState === "stopped"[\s\S]*currentCoordinate: rawVehicleCoordinate[\s\S]*routeStartCoordinate: liveRoutePlan\.route\.coordinates\[0\]/,
    );
    assert.match(
      liveMapSource,
      /navigationBlockedReason =[\s\S]*riskStartBlockedReason[\s\S]*startProximityBlockedReason/,
    );
    assert.match(
      liveMapSource,
      /riskStartBlockedReason \|\|[\s\S]*startProximityBlockedReason[\s\S]*setPendingNavigationStart\(false\)/,
    );
  });

  it("turns the guest Start route handoff into one gated navigation start", () => {
    const appSource = source("App.tsx");
    const liveMapSource = source("src/features/live-map/LiveMapScreen.tsx");
    const resetBlock = liveMapSource.slice(
      liveMapSource.indexOf("const nextResumeSession ="),
      liveMapSource.indexOf("const workspaceId =", liveMapSource.indexOf("const nextResumeSession =")),
    );
    const pendingStartBlock = liveMapSource.slice(
      liveMapSource.indexOf("if (!pendingNavigationStart)"),
      liveMapSource.indexOf("const handleStopRoute"),
    );

    assert.match(
      appSource,
      /startNavigationOnOpen=\{routePreviewSource === 'guest'\}/,
    );
    assert.match(resetBlock, /startNavigationOnOpen[\s\S]*!nextResumeSession/);
    assert.match(resetBlock, /automaticNavigationStartRouteKeyRef/);
    assert.match(resetBlock, /setLiveLocationRequested\([\s\S]*automaticNavigationStartPendingRef/);
    assert.match(resetBlock, /setPendingNavigationStart\(automaticNavigationStartPendingRef\.current\)/);
    assert.match(
      pendingStartBlock,
      /permissionStatus !== "granted" \|\| !rawVehicleCoordinate \|\| navigationBlockedReason[\s\S]*authorizeAndStartNavigation/,
    );
    assert.match(
      liveMapSource,
      /const commitNavigationStart = \(\) => \{[\s\S]*automaticNavigationStartPendingRef\.current = false;[\s\S]*setNavigationState\("navigating"\)/,
    );
    assert.doesNotMatch(resetBlock, /commitNavigationStart\(/);
  });

  it("updates pause and end-route controls before cleanup work", () => {
    const liveMapSource = source("src/features/live-map/LiveMapScreen.tsx");
    const primaryActionBlock = liveMapSource.slice(
      liveMapSource.indexOf("const handlePrimaryNavigationAction"),
      liveMapSource.indexOf("const liveNavigationBlockedReason"),
    );
    const stopActionBlock = liveMapSource.slice(
      liveMapSource.indexOf("const handleStopRoute"),
      liveMapSource.indexOf("const handleRiskZonePress"),
    );

    assert.match(
      primaryActionBlock,
      /setNavigationState\("paused"\);[\s\S]*setFollowModeEnabled\(false\);/,
    );
    assert.ok(
      stopActionBlock.indexOf('setNavigationState("stopped")') <
        stopActionBlock.indexOf("stopLiveRerouteMonitoring"),
    );
    assert.ok(
      stopActionBlock.indexOf('setNavigationState("stopped")') <
        stopActionBlock.indexOf("clearActiveNavigationSession"),
    );
    assert.ok(
      stopActionBlock.indexOf('setNavigationState("stopped")') <
        stopActionBlock.indexOf("stopBackgroundNavigation"),
    );
  });

  it("filters foreground samples and recovers the newest background fix", () => {
    const locationHookSource = source(
      "src/features/live-map/useLiveLocation.ts",
    );

    assert.match(locationHookSource, /applyReliableLocationSample/);
    assert.match(locationHookSource, /loadBackgroundNavigationLocation/);
    assert.match(locationHookSource, /AppState\.addEventListener/);
    assert.match(
      locationHookSource,
      /canAcceptLocationSource\(location\.mocked, __DEV__\)/,
    );
    assert.match(locationHookSource, /Low accuracy/);
    assert.match(
      locationHookSource,
      /if \(!navigationActive\)[\s\S]*stopBackgroundNavigation\(\)/,
    );
    assert.match(
      locationHookSource,
      /if \(!backgroundTrackingRequested\)[\s\S]*stopBackgroundNavigation\(\)[\s\S]*inspectBackgroundNavigation\(\)/,
    );
  });

  it("keeps background permission UI compact and text-led", () => {
    const summarySource = source(
      "src/features/live-map/LiveMapRouteSummarySheet.tsx",
    );
    const summaryStyles = source(
      "src/features/live-map/LiveMapRouteSummarySheet.styles.ts",
    );

    assert.match(summarySource, /liveMapBackgroundNavigationAction/);
    assert.match(summarySource, /backgroundNavigationPresentation\.actionLabel/);
    assert.doesNotMatch(summarySource, /Ionicons/);
    assert.match(summaryStyles, /continuityAction:[\s\S]*borderRadius:\s*radius\.pill/);
  });
});
