import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = () => readFileSync("App.tsx", "utf8");
const guestSource = () => readFileSync("src/features/guest-map/GuestMapScreen.tsx", "utf8");
const routesSource = () => readFileSync("src/features/routes/RouteListScreen.tsx", "utf8");

describe("App active workspace integration", () => {
  it("owns one authoritative catalog and shares the active workspace with Map and Saved", () => {
    const app = appSource();

    assert.match(app, /availableWorkspaces, setAvailableWorkspaces/);
    assert.match(app, /activeWorkspace, setActiveWorkspace/);
    assert.match(app, /fetchSavedRoutes\(accessToken\)/);
    assert.match(app, /normalizeWorkspaceCatalog\(result\.clients\)/);
    assert.match(app, /resolveActiveWorkspace\([\s\S]*result\.selectedClientId/);
    assert.match(app, /loadOfflineWorkspaceContext\(userEmail\)/);
    assert.match(app, /loadOfflineRoutes\(userEmail, null\)/);
    assert.match(app, /saveOfflineWorkspaceContext\(userEmail/);
    assert.match(app, /navigationWorkspace[\s\S]*activeWorkspaceId: navigationWorkspace\.id/);
    assert.match(app, /<RouteListScreen[\s\S]*activeWorkspace=\{activeWorkspace\}[\s\S]*availableWorkspaces=\{availableWorkspaces\}/);
    assert.match(app, /<GuestMapScreen[\s\S]*activeWorkspace=\{activeWorkspace\}[\s\S]*availableWorkspaces=\{availableWorkspaces\}/);
    assert.match(app, /handleSelectSavedRoute[\s\S]*routePlan\.clientId !== activeWorkspace\.id[\s\S]*Choose the saved route again/);
  });

  it("clears workspace context at authentication boundaries", () => {
    const app = appSource();
    const clearCount = (app.match(/setActiveWorkspace\(null\)/g) || []).length;

    assert.ok(clearCount >= 4);
    assert.match(app, /handleSignOut[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setActiveWorkspace\(null\)/);
    assert.match(app, /handleSessionExpired[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setActiveWorkspace\(null\)/);
    assert.match(app, /handleSignOut[\s\S]*workspaceRequestRevisionRef\.current \+= 1/);
    assert.match(app, /handleSessionExpired[\s\S]*workspaceRequestRevisionRef\.current \+= 1/);
    assert.match(app, /if \(!accessToken \|\| !authenticated\) \{[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setActiveWorkspace\(null\)/);
  });

  it("fails closed on Map and scopes Saved loads to the controlled workspace", () => {
    const guest = guestSource();
    const routes = routesSource();

    assert.match(guest, /workspaceSelectionRequired = authenticated && !routingClientId/);
    assert.match(guest, /routeActionAccessibilityLabel = workspaceSelectionRequired/);
    assert.match(guest, /Choose the SafeRoute workspace above before plotting this route/);
    assert.match(guest, /enabled: !workspaceSelectionRequired/);
    assert.match(guest, /cancelRoadRouteUpgrade\(\)[\s\S]*activeRiskAreaRequestRef\.current\?\.abort\(\)[\s\S]*setRoutePlan\(null\)/);
    assert.doesNotMatch(guest, /result\.clients\[0\]/);
    assert.match(routes, /selectedClientId = activeWorkspace\?\.id \|\| null/);
    assert.match(routes, /fetchSavedRoutes\([\s\S]*selectedClientId \|\| undefined/);
    assert.match(routes, /routesForWorkspace\(result\.routes, selectedClientId\)/);
    assert.match(routes, /!cached && offline && !refresh[\s\S]*loadOfflineRoutes\(userEmail, null\)/);
    assert.match(routes, /routeDetail\.clientId !== selectedClientId/);
    assert.match(routes, /activeWorkspaceIdRef\.current === selectedClientId/);
    assert.match(routes, /setRoutes\(\[\]\)[\s\S]*onWorkspaceChange\(workspace\)/);
    assert.match(routes, /workspaceCatalogLoading/);
    assert.match(routes, /Workspaces unavailable/);
    assert.match(routes, /Choose workspace/);
    assert.match(routes, /No workspace access/);
    assert.doesNotMatch(routes, /setClients\(result\.clients\)/);
  });

  it("blocks a cross-workspace switch while guidance remains resumable", () => {
    const app = appSource();

    assert.match(app, /handleActiveWorkspaceChange[\s\S]*activeNavigationSession[\s\S]*workspace\?\.id !== activeWorkspace\?\.id[\s\S]*return/);
    assert.match(app, /workspaceSwitchDisabled=\{Boolean\(activeNavigationSession\)\}/);
  });
});
