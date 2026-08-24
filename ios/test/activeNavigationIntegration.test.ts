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
    assert.match(
      appSource,
      /persistedNavigation\?\.accessScope\.kind === 'public'[\s\S]*discardPersistedNavigation\(undefined, \{[\s\S]*evidenceSession: persistedNavigation[\s\S]*persistedNavigation = null/,
    );
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
    const summarySource = source(
      "src/features/live-map/LiveMapRouteSummarySheet.tsx",
    );
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
    assert.match(
      liveMapSource,
      /automaticNavigationStartPendingRef = useRef\([\s\S]*automaticNavigationStartRequested/,
    );
    assert.match(
      liveMapSource,
      /setPendingNavigationStart\] = useState\([\s\S]*automaticNavigationStartRequested/,
    );
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
    assert.match(
      liveMapSource,
      /navigationPresentationState = automaticNavigationStartInProgress[\s\S]*\? "navigating"/,
    );
    assert.match(
      liveMapSource,
      /<LiveMapOverlay[\s\S]*activeNavigationState=\{navigationPresentationState\}[\s\S]*primaryActionPending=\{automaticNavigationStartInProgress\}/,
    );
    assert.match(
      liveMapSource,
      /driveAlongCameraActiveRef = useRef\([\s\S]*automaticNavigationStartRequested/,
    );
    assert.match(
      liveMapSource,
      /driveAlongCameraCoordinate =[\s\S]*automaticNavigationStartInProgress[\s\S]*liveRoutePlan\.route\.coordinates\[0\]/,
    );
    assert.match(
      liveMapSource,
      /navigationHandoffCamera =[\s\S]*automaticNavigationStartInProgress[\s\S]*resolveDriveAlongHandoffCamera/,
    );
    assert.match(liveMapSource, /initialCamera=\{navigationHandoffCamera\}/);
    const commitBlock = liveMapSource.slice(
      liveMapSource.indexOf("const commitNavigationStart"),
      liveMapSource.indexOf("const authorizeAndStartNavigation"),
    );
    assert.doesNotMatch(commitBlock, /animateCamera/);
    assert.match(
      liveMapSource,
      /duration: automaticNavigationStartInProgress[\s\S]*\? 320[\s\S]*driveAlongCamera\.durationMs/,
    );
    assert.match(
      summarySource,
      /primaryActionPending \? null : \([\s\S]*styles\.actionRow/,
    );
    assert.doesNotMatch(summarySource, /RouteStartLoadingBar|useLoopingPulse/);
    assert.doesNotMatch(resetBlock, /commitNavigationStart\(/);
  });

  it("keeps active guidance running until the single End action is used", () => {
    const liveMapSource = source("src/features/live-map/LiveMapScreen.tsx");
    const summarySource = source(
      "src/features/live-map/LiveMapRouteSummarySheet.tsx",
    );
    const primaryActionBlock = liveMapSource.slice(
      liveMapSource.indexOf("const handlePrimaryNavigationAction"),
      liveMapSource.indexOf("const liveNavigationBlockedReason"),
    );
    const stopActionBlock = liveMapSource.slice(
      liveMapSource.indexOf("const handleStopRoute"),
      liveMapSource.indexOf("const handleRiskZonePress"),
    );

    assert.doesNotMatch(primaryActionBlock, /setNavigationState\("paused"\)/);
    assert.match(
      primaryActionBlock,
      /activeNavigationState === "navigating"[\s\S]*activeNavigationState === "off-route"[\s\S]*return;/,
    );
    assert.match(
      summarySource,
      /showPrimaryAction = !showStopAction \|\| navigationState === "paused"/,
    );
    assert.match(summarySource, /\{showPrimaryAction \? \(/);
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
    assert.match(
      stopActionBlock,
      /routeContext === "guest"[\s\S]*onChangeRoute\(\);[\s\S]*return;[\s\S]*fitRoute\(\)/,
    );
    assert.ok(
      stopActionBlock.indexOf("onChangeRoute();") <
        stopActionBlock.indexOf("fitRoute();"),
    );
  });

  it("preserves the plotted guest route and alternatives across navigation", () => {
    const appSource = source("App.tsx");
    const guestMapSource = source("src/features/guest-map/GuestMapScreen.tsx");

    assert.match(
      guestMapSource,
      /onOpenRoutePreview\?\.\(nextRoutePlan, \{[\s\S]*routeAlternatives:[\s\S]*routeDraft,[\s\S]*routePlan: nextRoutePlan,[\s\S]*travelMode/,
    );
    assert.match(
      appSource,
      /setGuestRouteReturnState\(returnState\)[\s\S]*setScreen\('route-preview'\)/,
    );
    assert.match(
      appSource,
      /<GuestMapScreen[\s\S]*initialRouteState=\{guestRouteReturnState\}/,
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

  it("removes the screen-lock prompt from the live route summary", () => {
    const summarySource = source(
      "src/features/live-map/LiveMapRouteSummarySheet.tsx",
    );
    const summaryStyles = source(
      "src/features/live-map/LiveMapRouteSummarySheet.styles.ts",
    );

    assert.doesNotMatch(summarySource, /liveMapBackgroundNavigationAction/);
    assert.doesNotMatch(summarySource, /backgroundNavigationPresentation/);
    assert.doesNotMatch(summaryStyles, /continuityAction|continuityMessage/);
  });

  it("keeps active guidance compact and removes spoken guidance completely", () => {
    const guidanceSource = source(
      "src/features/live-map/LiveMapGuidanceCard.tsx",
    );
    const overlaySource = source("src/features/live-map/LiveMapOverlay.tsx");
    const screenSource = source("src/features/live-map/LiveMapScreen.tsx");
    const packageSource = source("package.json");

    assert.match(guidanceSource, /testID=\{uiTestIds\.liveMapReturn\}/);
    assert.match(guidanceSource, /onPress=\{onChangeRoute\}/);
    assert.match(
      guidanceSource,
      /top: Math\.max\(layout\.guidanceTop, safeAreaInsets\.top \+ 8\)/,
    );
    assert.match(
      overlaySource,
      /useSafeAreaInsets\(\)[\s\S]*guidanceCardVisible \? null : \([\s\S]*<LiveMapRouteHeader/,
    );
    assert.doesNotMatch(
      guidanceSource,
      /Volume2|VolumeX|RotateCcw|repeat-voice|spokenGuidance/,
    );
    assert.doesNotMatch(screenSource, /SpokenGuidance|spokenGuidance/);
    assert.doesNotMatch(packageSource, /expo-speech/);
  });
});
