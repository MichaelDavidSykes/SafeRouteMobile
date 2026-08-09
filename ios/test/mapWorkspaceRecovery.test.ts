import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("authenticated Map workspace recovery integration", () => {
  it("wires one central recovery boundary into planner and live guidance", () => {
    const app = source("App.tsx");
    const liveProps = app.match(/<LiveMapScreen[\s\S]*?\/>/)?.[0] || "";
    const guestProps = app.match(/<GuestMapScreen[\s\S]*?\/>/)?.[0] || "";

    assert.match(liveProps, /onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(guestProps, /onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(app, /handleNavigationSessionChange[\s\S]*canResumeActiveNavigationSession\([\s\S]*activeWorkspaceRef\.current\?\.id[\s\S]*unavailableWorkspaceIdsRef\.current\.has\(workspaceId\)[\s\S]*return false/);
    assert.match(app, /openRoutePreview[\s\S]*unavailableWorkspaceIdsRef\.current\.has\(routeWorkspaceId\)[\s\S]*Plot the route again/);
    assert.match(app, /onNavigationSessionChange=\{handleNavigationSessionChange\}/);
  });

  it("falls route planning back to public while keeping workspace writes fail closed", () => {
    const guest = source("src/features/guest-map/GuestMapScreen.tsx");

    assert.match(guest, /requestAccessToken = routingAccessToken;[\s\S]*requestWorkspaceId = requestAccessToken[\s\S]*requestWorkspaceContextId[\s\S]*: null/);
    assert.match(guest, /const requestUsesWorkspace = Boolean\([\s\S]*requestAccessToken && requestWorkspaceId/);
    assert.match(guest, /activeRoadRouteWorkspaceIdRef\.current = requestWorkspaceId/);
    assert.match(guest, /const requestOwnsState = \(\) =>[\s\S]*roadRouteRequestIdRef\.current === requestId/);
    assert.match(guest, /handleRouteWorkspaceUnavailable[\s\S]*getRequestUnavailableWorkspaceId\([\s\S]*requestActive:[\s\S]*requestIsCurrent\(\)/);
    assert.match(guest, /recoverWorkspaceAccessRef\.current = \(workspaceId\) => \{[\s\S]*clearWorkspaceScopedMapState\(\);[\s\S]*onWorkspaceUnavailableRef\.current\?\.\(workspaceId\)/);
    assert.match(guest, /useViewportRiskAreas\(\{[\s\S]*onWorkspaceUnavailable: onWorkspaceUnavailable[\s\S]*recoverWorkspaceAccessRef\.current\(workspaceId\)/);
    assert.match(guest, /workspaceUnavailableHandled = true;[\s\S]*recoverWorkspaceAccessRef\.current\(unavailableWorkspaceId\)/);
    assert.match(
      guest,
      /\.catch\(\(error\) => \{[\s\S]*handleRouteSessionExpiry\(error\)[\s\S]*handleRouteWorkspaceUnavailable\(error\)[\s\S]*finalizer fails closed/,
    );
    assert.match(guest, /createGuestRiskArea\([\s\S]*getRequestSessionExpiry\([\s\S]*getRequestUnavailableWorkspaceId\([\s\S]*recoverWorkspaceAccessRef\.current\(unavailableWorkspaceId\)/);
    assert.match(guest, /!acceptedRoadPreview && !sessionExpiryHandled && !workspaceUnavailableHandled/);
    assert.match(
      guest,
      /clearWorkspaceScopedMapState =[\s\S]*if \(activeRoadRouteWorkspaceIdRef\.current\)[\s\S]*setRoutePlan\(\(current\) => current\?\.clientId \? null : current\)[\s\S]*filter\(\(plan\) => !plan\.clientId\)/,
    );
  });

  it("purges denied viewport intelligence once without changing public or transient semantics", () => {
    const hook = source("src/features/live-map/useViewportRiskAreas.ts");

    assert.match(hook, /let workspaceUnavailableHandled = false/);
    assert.match(hook, /getRequestSessionExpiry\([\s\S]*getRequestUnavailableWorkspaceId\(/);
    assert.match(hook, /handled: workspaceUnavailableHandled/);
    assert.match(hook, /accessToken,[\s\S]*clientIdRef\.current === clientId[\s\S]*Boolean\(onWorkspaceUnavailableRef\.current\)/);
    assert.match(hook, /workspaceUnavailableHandled = true;[\s\S]*requestRevisionRef\.current \+= 1;[\s\S]*controller\.abort\(\);[\s\S]*cacheRef\.current\.clear\(\);[\s\S]*setZones\(\[\]\);[\s\S]*onWorkspaceUnavailableRef\.current\?\.\(unavailableWorkspaceId\)/);
    assert.match(hook, /failedRequestCount \+= 1/);
  });

  it("ends matching live guidance before an owned reroute or viewport denial can fall back", () => {
    const live = source("src/features/live-map/LiveMapScreen.tsx");
    const closeStart = live.indexOf("const closeRouteForWorkspaceLoss");
    const closeEnd = live.indexOf("const viewportRisk", closeStart);
    const closeBlock = live.slice(closeStart, closeEnd);

    assert.match(closeBlock, /activeRouteWorkspaceIdRef\.current = null/);
    assert.match(closeBlock, /activeRerouteRequestRef\.current\?\.abort\(\)/);
    assert.match(closeBlock, /clearActiveNavigationSession\(\)/);
    assert.match(closeBlock, /stopBackgroundNavigation\(\)/);
    assert.ok(
      closeBlock.indexOf("onWorkspaceUnavailableRef.current?.(normalizedWorkspaceId)") <
        closeBlock.indexOf("onNavigationSessionChangeRef.current?.(null)"),
      "central recovery must observe active guidance before the child clears its session",
    );
    assert.match(live, /useViewportRiskAreas\(\{[\s\S]*onWorkspaceUnavailable: onWorkspaceUnavailable \? closeRouteForWorkspaceLoss : undefined/);
    assert.match(live, /getRequestSessionExpiry\([\s\S]*getRequestUnavailableWorkspaceId\([\s\S]*activeRouteWorkspaceIdRef\.current === requestWorkspaceId/);
    assert.match(live, /if \(unavailableWorkspaceId\) \{[\s\S]*closeRouteForWorkspaceLoss\(unavailableWorkspaceId\);[\s\S]*return;[\s\S]*failRerouteRequest\(request\)/);
  });

  it("pauses workspace intelligence without cancelling public-capable route plotting", () => {
    const app = source("App.tsx");
    const guest = source("src/features/guest-map/GuestMapScreen.tsx");
    const live = source("src/features/live-map/LiveMapScreen.tsx");

    assert.match(
      app.match(/<LiveMapScreen[\s\S]*?\/>/)?.[0] || "",
      /workspaceAuthorizationFresh=\{activeWorkspaceAuthorizationFresh\}/,
    );
    const routeUpgrade = guest.slice(
      guest.indexOf('const upgradeGuestRouteWithRoadPreview ='),
      guest.indexOf('const handleOpenPreview ='),
    );
    const authorizationPauseEffect = guest.slice(
      guest.indexOf('if (!workspaceAuthorizationRequired)'),
      guest.indexOf('useEffect(() => {\n    if (online)', guest.indexOf('if (!workspaceAuthorizationRequired)')),
    );
    assert.doesNotMatch(routeUpgrade, /isCurrentWorkspaceAuthorizationEpoch/);
    assert.doesNotMatch(authorizationPauseEffect, /cancelRoadRouteUpgrade\(\)/);
    assert.match(authorizationPauseEffect, /activeRiskAreaRequestRef\.current\?\.abort\(\)/);
    assert.match(
      live,
      /useViewportRiskAreas\(\{[\s\S]*refreshEnabled:[\s\S]*online &&[\s\S]*\(!activeRoutePlan\.clientId \|\| workspaceAuthorizationFresh\)/,
    );
    assert.match(
      live,
      /requestAuthorizationIsCurrent[\s\S]*Verify current workspace access before rerouting[\s\S]*const requestIsCurrent[\s\S]*fetchSafeRouteRoadRoutePreview[\s\S]*requestIsCurrent\(\)/,
    );
    assert.doesNotMatch(live, /fetchAreaRiskAlongRoute|buildLiveRerouteAvoidRectangles/);
    assert.match(
      live,
      /rerouteMonitoringActive = Boolean\([\s\S]*!activeRoutePlan\.clientId \|\| workspaceAuthorizationFresh/,
    );
    assert.match(
      live,
      /startWasPending[\s\S]*cancelNavigationStartAuthorization\(navigationAuthorizationGateRef\.current\)[\s\S]*setPendingNavigationStart\(false\)/,
    );
  });
});
