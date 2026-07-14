import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = () => readFileSync("App.tsx", "utf8");
const guestSource = () => readFileSync("src/features/guest-map/GuestMapScreen.tsx", "utf8");
const operationsSource = () => readFileSync("src/features/operations/OperationsScreen.tsx", "utf8");
const routesSource = () => readFileSync("src/features/routes/RouteListScreen.tsx", "utf8");
const workspaceRefreshSource = () => readFileSync("src/features/workspaces/WorkspaceAccessRefreshControl.tsx", "utf8");

describe("App active workspace integration", () => {
  it("owns one authoritative catalog and shares the active workspace with Map, Saved, and Operations", () => {
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
    assert.match(app, /<OperationsScreen[\s\S]*activeWorkspace=\{activeWorkspace\}[\s\S]*availableWorkspaces=\{availableWorkspaces\}/);
    assert.match(app, /<GuestMapScreen[\s\S]*activeWorkspace=\{activeWorkspace\}[\s\S]*availableWorkspaces=\{availableWorkspaces\}/);
    assert.match(app, /handleSelectSavedRoute[\s\S]*routePlan\.clientId !== activeWorkspace\.id[\s\S]*Choose the saved route again/);
    assert.match(app, /canRetainRouteWorkspace\([\s\S]*currentNavigation\.routeContext[\s\S]*currentNavigation\.routePlan\.clientId/);
    assert.match(app, /canRetainRouteWorkspace\([\s\S]*routePreviewSourceRef\.current[\s\S]*currentPreview\.clientId/);
    assert.match(app, /previewWorkspaceRevoked/);
    assert.match(app, /Active guidance ended because this workspace is no longer available/);
    assert.match(app, /This route closed because its workspace is no longer available/);
    assert.match(app, /<GuestMapScreen[\s\S]*sessionNotice=/);
  });

  it("lets Operations update App's workspace and preserves catalog recovery plus guidance locks", () => {
    const app = appSource();
    const operations = operationsSource();

    assert.match(app, /<OperationsScreen[\s\S]*onWorkspaceChange=\{handleActiveWorkspaceChange\}/);
    assert.match(app, /<OperationsScreen[\s\S]*onRetryWorkspaceCatalog=/);
    assert.match(app, /<OperationsScreen[\s\S]*workspaceCatalogError=\{workspaceCatalogError\}/);
    assert.match(app, /<OperationsScreen[\s\S]*workspaceCatalogLoading=\{workspaceCatalogLoading\}/);
    assert.match(app, /<OperationsScreen[\s\S]*workspaceSwitchDisabled=\{Boolean\(activeNavigationSession\)\}/);
    assert.match(app, /<OperationsScreen[\s\S]*onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(app, /<RouteListScreen[\s\S]*onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(operations, /onWorkspaceChange\(nextWorkspace\)/);
    assert.match(operations, /activeWorkspaceIdRef\.current = nextWorkspace\.id/);
  });

  it("owns fail-closed Operations workspace recovery and rejects stale denied-workspace catalogs", () => {
    const app = appSource();

    assert.match(app, /handleWorkspaceUnavailable = useCallback/);
    assert.match(app, /resolveWorkspaceAccessRecovery\([\s\S]*activeWorkspaceRef\.current\?\.id[\s\S]*normalizedWorkspaceId/);
    assert.match(app, /if \(recovery\.status === 'ignored'\) \{[\s\S]*return/);
    assert.match(app, /normalizedWorkspaceId = workspaceId\.trim\(\)/);
    assert.match(app, /unavailableWorkspaceIdsRef\.current\.add\(normalizedWorkspaceId\)/);
    assert.match(app, /excludeUnavailableWorkspaces\([\s\S]*unavailableWorkspaceIdsRef\.current/);
    assert.match(app, /setAvailableWorkspaces\(recovery\.workspaces\)/);
    assert.match(app, /setActiveWorkspace\(recovery\.activeWorkspace\)/);
    assert.match(app, /navigationUnavailable[\s\S]*clearActiveNavigationSession/);
    assert.match(app, /previewUnavailable[\s\S]*setSelectedRoute\(null\)/);
    assert.match(app, /clearOfflineRouteWorkspace\(userEmail, normalizedWorkspaceId\)/);
    assert.match(app, /saveOfflineWorkspaceContext\(userEmail, \{[\s\S]*workspaces: recovery\.workspaces/);
    assert.match(app, /setWorkspaceDiscoveryRevision\(\(revision\) => revision \+ 1\)/);
  });

  it("restores a denied membership only after an explicit fresh catalog retry", () => {
    const app = appSource();

    assert.match(app, /restoreUnavailableWorkspacesFromFreshCatalogRef = useRef\(false\)/);
    assert.match(app, /allowFreshWorkspaceRestoration[\s\S]*fetchSavedRoutes\(accessToken\)[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = false[\s\S]*normalizedCatalog/);
    assert.match(app, /normalizedCatalog = normalizeWorkspaceCatalog\(result\.clients\)/);
    assert.match(app, /fetchSavedRoutes\(accessToken\)[\s\S]*revision !== workspaceRequestRevisionRef\.current[\s\S]*return[\s\S]*reconcileUnavailableWorkspaceIds/);
    assert.match(app, /reconcileUnavailableWorkspaceIds\(\{[\s\S]*allowFreshRestoration: allowFreshWorkspaceRestoration[\s\S]*freshWorkspaces: normalizedCatalog/);
    assert.match(app, /workspaceAccessRestored[\s\S]*unavailableWorkspaceIds\.size < unavailableWorkspaceIdsRef\.current\.size/);
    assert.match(app, /workspaceAccessRestored[\s\S]*Workspace access refreshed\./);
    assert.match(app, /handleRetryWorkspaceCatalog[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = true[\s\S]*setWorkspaceDiscoveryRevision/);
    assert.match(app, /handleWorkspaceUnavailable[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = false[\s\S]*unavailableWorkspaceIdsRef\.current\.add/);
    assert.equal(
      (app.match(/onRetryWorkspaceCatalog=\{handleRetryWorkspaceCatalog\}/g) || []).length,
      3,
    );
    assert.equal(
      (app.match(/workspaceAccessRefreshAvailable=\{unavailableWorkspaceIdsRef\.current\.size > 0\}/g) || []).length,
      3,
    );
    assert.match(guestSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(routesSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(operationsSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(workspaceRefreshSource(), /accessibilityLabel=\{loading \? "Refreshing workspace access" : "Refresh workspace access"\}/);
    assert.match(workspaceRefreshSource(), /testID=\{uiTestIds\.workspaceAccessRefresh\}/);
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
    assert.match(guest, /routeMessage \|\| sessionNotice \|\| locationErrorMessage/);
    assert.match(guest, /enabled: !workspaceSelectionRequired/);
    assert.match(guest, /cancelRoadRouteUpgrade\(\)[\s\S]*activeRiskAreaRequestRef\.current\?\.abort\(\)[\s\S]*setRoutePlan\(null\)/);
    assert.doesNotMatch(guest, /result\.clients\[0\]/);
    assert.match(routes, /selectedClientId = activeWorkspace\?\.id \|\| null/);
    assert.match(routes, /fetchSavedRoutes\([\s\S]*requestWorkspaceId/);
    assert.match(routes, /routesForWorkspace\(result\.routes, requestWorkspaceId\)/);
    assert.match(routes, /!cached && offline && !refresh[\s\S]*loadOfflineRoutes\(userEmail, null\)/);
    assert.match(routes, /routeDetail\.clientId !== selectedClientId/);
    assert.match(routes, /activeWorkspaceIdRef\.current === selectedClientId/);
    assert.match(routes, /isWorkspaceUnavailableError\(error\)[\s\S]*recoverUnavailableWorkspace\(requestWorkspaceId\)/);
    assert.match(routes, /isWorkspaceForbiddenError\(error\)[\s\S]*recoverUnavailableWorkspace\(selectedClientId\)/);
    assert.match(routes, /setRoutes\(\[\]\)[\s\S]*onWorkspaceChange\(workspace\)/);
    assert.match(routes, /workspaceCatalogLoading/);
    assert.match(routes, /Workspaces unavailable/);
    assert.match(routes, /Choose workspace/);
    assert.match(routes, /No workspace access/);
    assert.doesNotMatch(routes, /setClients\(result\.clients\)/);
    assert.doesNotMatch(operationsSource(), /clients\[0\]|resolveOperationsClientId/);
  });

  it("blocks a cross-workspace switch while guidance remains resumable", () => {
    const app = appSource();

    assert.match(app, /handleActiveWorkspaceChange[\s\S]*activeNavigationSession[\s\S]*workspace\?\.id !== activeWorkspace\?\.id[\s\S]*return/);
    assert.match(app, /workspaceSwitchDisabled=\{Boolean\(activeNavigationSession\)\}/);
  });
});
