import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("cold-start connectivity integration", () => {
  it("owns one checking-first native snapshot for every SafeRoute surface", () => {
    const app = source("App.tsx");
    const index = source("index.ts");
    const network = source("src/features/api/useNetworkAvailability.ts");

    assert.match(
      network,
      /useState<NetworkAvailabilityStatus>\("checking"\)/,
    );
    assert.match(network, /createContext<NetworkAvailability \| null>/);
    assert.match(network, /NetInfo\.addEventListener/);
    assert.match(
      network,
      /nextState !== "active"[\s\S]*active: false[\s\S]*NetInfo\.refresh\(\)[\s\S]*refresh-settled/,
    );
    assert.match(
      network,
      /AppState\.addEventListener\([\s\S]*handleAppStateChange[\s\S]*handleAppStateChange\(AppState\.currentState\)/,
    );
    assert.match(
      network,
      /reduceNetworkAvailabilityMachine\(machineRef\.current, action\)/,
    );
    assert.match(
      app,
      /<NetworkAvailabilityProvider>[\s\S]*<SafeRouteApp \/>[\s\S]*<\/NetworkAvailabilityProvider>/,
    );
    assert.match(
      app,
      /if \(online\) \{[\s\S]*flushGuidanceContractEvidence\(\)/,
    );
    assert.ok(
      index.indexOf("configureNetworkAvailabilityContract();") <
        index.indexOf("registerRootComponent(App);"),
    );
    const contract = source(
      "src/features/api/networkAvailabilityContractCore.ts",
    );
    assert.match(contract, /useNativeReachability: false/);
    assert.match(contract, /reachabilityMethod: "HEAD"/);
    assert.match(contract, /X-SafeRoute-Source-Revision/);
  });

  it("waits for settled connectivity before restoring or discovering protected data", () => {
    const app = source("App.tsx");
    const restore = source("src/features/auth/sessionRestore.ts");

    assert.match(
      app,
      /sessionRestoreNetworkStatus === null[\s\S]*networkStatus !== 'checking' \|\| SAFEROUTE_PREVIEW_MODE_ENABLED[\s\S]*setSessionRestoreNetworkStatus\(networkStatus\)/,
    );
    assert.match(
      app,
      /restoreSavedSession\([\s\S]*\{ validateOnline: sessionRestoreNetworkStatus === 'online' \}/,
    );
    assert.match(
      restore,
      /options\.validateOnline === false[\s\S]*restoreStrictOfflineSession/,
    );
    assert.match(
      app,
      /if \(!online\) \{[\s\S]*freshWorkspaceAuthorizationRef\.current = \{[\s\S]*workspaceIds: new Set<string>\(\)/,
    );
    const offlineGate = app.indexOf("if (!online) {", app.indexOf("const cachedCatalog"));
    const principalRequest = app.indexOf(
      "const currentUser = await getCurrentUser(accessToken)",
      offlineGate,
    );
    const catalogRequest = app.indexOf(
      "const result = await fetchSavedRoutes(accessToken)",
      principalRequest,
    );
    assert.ok(offlineGate >= 0);
    assert.ok(principalRequest > offlineGate);
    assert.ok(catalogRequest > principalRequest);
    assert.match(
      app,
      /networkRequestEpoch === networkRequestEpochRef\.current/,
    );
    assert.match(
      app,
      /networkStatusRef\.current === 'online'[\s\S]*request\.networkRequestEpoch === networkRequestEpochRef\.current/,
    );
  });

  it("fails a cold inactive account into Login after clearing protected guidance", () => {
    const app = source("App.tsx");

    assert.match(
      app,
      /restoreResult\.status === 'expired'[\s\S]*restoreResult\.reason === 'inactive-account'/,
    );
    assert.match(
      app,
      /restoreResult\.reason === 'inactive-account'[\s\S]*discardPersistedNavigation\(undefined, \{[\s\S]*evidenceSession: persistedNavigation[\s\S]*setSession\(null\)[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setAuthPrompt\(inactiveMessage\)[\s\S]*setScreen\('login'\)/,
    );
  });

  it("keeps map tiles and automatic risk work off until native reachability is online", () => {
    const guest = source("src/features/guest-map/GuestMapScreen.tsx");
    const live = source("src/features/live-map/LiveMapScreen.tsx");
    const liveCanvas = source("src/features/live-map/LiveMapCanvas.tsx");
    const viewportRisk = source(
      "src/features/live-map/useViewportRiskAreas.ts",
    );

    assert.match(
      guest,
      /mapType=\{resolveSafeRouteMapType\(\{[\s\S]*online,[\s\S]*platform: Platform\.OS/,
    );
    assert.match(
      liveCanvas,
      /mapType=\{resolveSafeRouteMapType\(\{[\s\S]*online: !offline,[\s\S]*platform: Platform\.OS/,
    );
    assert.match(
      guest,
      /enabled:[\s\S]*online &&[\s\S]*!workspaceSelectionRequired/,
    );
    assert.match(
      guest,
      /if \(!online\) \{[\s\S]*Checking connection before searching/,
    );
    assert.match(
      guest,
      /if \(!online\) \{[\s\S]*cancelRoadRouteUpgrade\(\)[\s\S]*activeRiskAreaRequestRef\.current\?\.abort\(\)[\s\S]*activeMapReverseGeocodeRef\.current\?\.abort\(\)/,
    );
    assert.match(
      guest,
      /plotNetworkRequestEpoch === networkRequestEpochRef\.current/,
    );
    assert.match(
      guest,
      /activeMapReverseGeocodeRef\.current === controller[\s\S]*onlineRef\.current/,
    );
    assert.match(
      guest,
      /handleAddMapRiskArea[\s\S]*!onlineRef\.current[\s\S]*const requestNetworkEpoch = networkRequestEpochRef\.current[\s\S]*requestNetworkEpoch === networkRequestEpochRef\.current[\s\S]*await createGuestRiskArea/,
    );
    assert.match(
      guest,
      /activeLocationSearchRef\.current === controller[\s\S]*requestNetworkEpoch === networkRequestEpochRef\.current[\s\S]*if \(!requestIsCurrent\(\)\) \{[\s\S]*searchGuestLocations/,
    );
    assert.match(
      live,
      /enabled:[\s\S]*online &&[\s\S]*workspaceAuthorizationFresh/,
    );
    assert.match(
      live,
      /const rerouteMonitoringActive = Boolean\([\s\S]*online &&/,
    );
    assert.match(
      live,
      /requestNetworkEpoch === networkRequestEpochRef\.current/,
    );
    assert.match(live, /offline=\{!online\}/);
    assert.match(
      viewportRisk,
      /requestEligibilityEpochRef\.current === requestEligibilityEpoch[\s\S]*const timer = setTimeout\(\(\) => \{[\s\S]*if \(!requestIsCurrent\(\)\) \{[\s\S]*fetchAreaRiskViewport/,
    );
  });

  it("keeps Saved and Operations cache/review paths ahead of protected loads", () => {
    const operations = source("src/features/operations/OperationsScreen.tsx");
    const routes = source("src/features/routes/RouteListScreen.tsx");

    assert.match(
      routes,
      /if \(cachedSnapshot\) \{[\s\S]*if \(reviewOnly\)[\s\S]*return;[\s\S]*fetchSavedRoutes/,
    );
    assert.match(
      routes,
      /if \(reviewOnly\) \{[\s\S]*loadOfflineRouteDetail[\s\S]*return;[\s\S]*fetchRouteDetail/,
    );
    assert.match(
      routes,
      /protectedRequestsAvailableRef\.current !== protectedRequestsAvailable[\s\S]*detailRevisionRef\.current \+= 1/,
    );
    assert.match(
      routes,
      /reviewOnly && networkChecking[\s\S]*Checking connection\. No cached saved routes are available\./,
    );
    const operationsGate = operations.indexOf(
      "if (!protectedRequestsAvailable) {",
    );
    const operationsRequest = operations.indexOf(
      "const result = await loadOperationsWorkspaceData",
    );
    assert.ok(operationsGate >= 0);
    assert.ok(operationsRequest > operationsGate);
    assert.match(
      operations,
      /protectedRequestsAvailableRef\.current !== protectedRequestsAvailable[\s\S]*loadRevisionRef\.current \+= 1/,
    );
    assert.match(
      operations,
      /!protectedRequestsAvailable && networkChecking[\s\S]*Checking connection\. No cached operations are available\./,
    );
    assert.match(
      operations,
      /Checking connection\. Current operations remain available for review only\./,
    );
  });
});
