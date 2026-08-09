import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

describe("iOS polish audit interaction contracts", () => {
  it("keeps the route preview mounted after navigation reaches a terminal state", () => {
    const app = source("App.tsx");
    const liveMap = source("src/features/live-map/LiveMapScreen.tsx");

    assert.match(
      liveMap,
      /navigationState === "stopped" \|\| navigationState === "arrived"[\s\S]*onNavigationSessionChangeRef\.current\?\.\(null\)/,
    );
    assert.match(
      app,
      /if \(!nextSession\) \{[\s\S]*discardPersistedNavigation\(undefined, \{[\s\S]*preserveSelectedRoute: true/,
    );
    assert.match(
      app,
      /if \(!preserveSelectedRoute\) \{[\s\S]*setSelectedRoute\(null\)/,
    );
    assert.match(
      app,
      /const returnFromRoutePreview = \(\) => \{[\s\S]*setSelectedRoute\(null\)/,
    );
  });

  it("does not overwrite a route plotted while saved-session restore finishes", () => {
    const app = source("App.tsx");

    assert.match(
      app,
      /const preserveUserRoutePreview =[\s\S]*currentScreenRef\.current === 'route-preview'[\s\S]*Boolean\(selectedRouteRef\.current\)[\s\S]*if \(!preserveUserRoutePreview\) \{[\s\S]*setSelectedRoute\(null\)/,
    );
    assert.match(
      app,
      /if \(!manualRetry && !preserveUserRoutePreview\) \{[\s\S]*setScreen\('guest-map'\)/,
    );
    assert.match(
      app,
      /if \(!pendingNavigationRestoreRef\.current\) \{[\s\S]*takePendingFullAccessFeature\(\)[\s\S]*currentScreenRef\.current !== 'route-preview' \|\|[\s\S]*!selectedRouteRef\.current[\s\S]*setScreen\('guest-map'\)/,
    );
  });

  it("closes Operations details on route failure and preserves rows while refreshing", () => {
    const operations = source("src/features/operations/OperationsScreen.tsx");

    assert.match(
      operations,
      /const closeRouteDetail = \(\) => \{[\s\S]*setSelectedCalendarRowId\(null\)[\s\S]*setSelectedConvoyId\(null\)[\s\S]*setSelectedVehicle\(null\)/,
    );
    assert.ok((operations.match(/closeRouteDetail\(\);/g) || []).length >= 3);
    assert.match(
      operations,
      /const preserveVisibleResults =[\s\S]*refresh && loadedWorkspaceIdRef\.current === requestWorkspaceId;[\s\S]*if \(!preserveVisibleResults\)/,
    );
  });

  it("keeps Calendar-only cleanup feedback out of Routes and Convoys", () => {
    const operations = source("src/features/operations/OperationsScreen.tsx");

    assert.match(
      operations,
      /activeTab === "calendar" && offlineCalendarRemovalPresentation\.status/,
    );
    assert.match(
      operations,
      /activeTab === "calendar" && offlineCalendarRemovalState === "retry"/,
    );
  });

  it("does not layer search chrome under risk details", () => {
    const guestMap = source("src/features/guest-map/GuestMapScreen.tsx");

    assert.match(
      guestMap,
      /\{!selectedRiskZone && !mapAction \? \([\s\S]*testID=\{uiTestIds\.guestMapCollapsedSheet\}/,
    );
  });

  it("dismisses selected risk details when overlays are hidden and honors safe area", () => {
    const liveMap = source("src/features/live-map/LiveMapScreen.tsx");
    const canvas = source("src/features/live-map/LiveMapCanvas.tsx");

    assert.match(
      liveMap,
      /const handleSetAlertsVisible =[\s\S]*if \(!nextVisible\) \{[\s\S]*setSelectedRiskZoneId\(null\)/,
    );
    assert.match(
      liveMap,
      /renderRevision: nextVisible[\s\S]*current\.renderRevision \+ 1/,
    );
    assert.match(liveMap, /onSetAlertsVisible=\{handleSetAlertsVisible\}/);
    assert.match(
      canvas,
      /key=\{`\$\{riskOverlayRenderRevision\}:\$\{zone\.id\}`\}/,
    );
    assert.match(canvas, /useSafeAreaInsets\(\)/);
    assert.match(canvas, /bottomInset=\{safeAreaInsets\.bottom \+ 12\}/);
  });
});
