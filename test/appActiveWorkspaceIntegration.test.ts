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
    assert.match(app, /loadOfflineWorkspaceContext\(principalId\)/);
    assert.match(app, /loadOfflineRoutes\(principalId, null\)/);
    assert.match(app, /saveOfflineWorkspaceContext\(principalId/);
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
    assert.match(app, /<OperationsScreen[\s\S]*workspaceCatalogLoading=\{workspaceCatalogBusy\}/);
    assert.match(app, /<OperationsScreen[\s\S]*workspaceSwitchDisabled=\{navigationWorkspaceLocked\}/);
    assert.match(app, /<OperationsScreen[\s\S]*onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(app, /<RouteListScreen[\s\S]*onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(operations, /onWorkspaceChange\(nextWorkspace\)/);
    assert.match(operations, /activeWorkspaceIdRef\.current = nextWorkspace\.id/);
  });

  it("owns fail-closed Operations workspace recovery and rejects stale denied-workspace catalogs", () => {
    const app = appSource();

    assert.match(app, /handleWorkspaceUnavailable = useCallback\(async/);
    assert.match(app, /resolveWorkspaceAccessRecovery\([\s\S]*activeWorkspaceRef\.current\?\.id[\s\S]*normalizedWorkspaceId/);
    assert.match(app, /if \(recovery\.status === 'ignored'\) \{[\s\S]*return/);
    assert.match(app, /normalizedWorkspaceId = workspaceId\.trim\(\)/);
    assert.match(
      app,
      /unavailableWorkspaceIdsRef\.current = freshRecovery[\s\S]*normalizedWorkspaceId/,
    );
    assert.match(app, /excludeUnavailableWorkspaces\([\s\S]*unavailableWorkspaceIdsRef\.current/);
    assert.match(app, /setAvailableWorkspaces\(recovery\.workspaces\)/);
    assert.match(app, /setActiveWorkspace\(recovery\.activeWorkspace\)/);
    assert.match(
      app,
      /resolveWorkspaceSurfaceClosure\(\{[\s\S]*navigationWorkspaceId: currentNavigation\?\.routePlan\.clientId[\s\S]*previewWorkspaceId: currentPreview\?\.clientId[\s\S]*unavailableWorkspaceIds: unavailableWorkspaceIdsRef\.current/,
    );
    assert.match(app, /navigationUnavailable[\s\S]*discardPersistedNavigation/);
    assert.match(app, /previewUnavailable[\s\S]*setSelectedRoute\(null\)/);
    assert.match(
      app,
      /Array\.from\(unavailableWorkspaceIdsRef\.current\)\.map\([\s\S]*clearOfflineRouteWorkspace\(principalId, workspaceId\)/,
    );
    assert.match(
      app,
      /await Promise\.all\(\[[\s\S]*navigationCleanup[\s\S]*persistWorkspaceRecoveryWithEvidence[\s\S]*clearOfflineRouteWorkspace/,
    );
    assert.match(app, /workspaceRecoveryPersistence === 'failed'[\s\S]*workspaceIds: new Set<string>\(\)/);
    assert.match(
      app,
      /recoveryAccessToken = activeSessionTokenRef\.current[\s\S]*recoveryPrincipalId = activeSessionPrincipalIdRef\.current[\s\S]*recoverySessionEpoch = sessionEpochRef\.current[\s\S]*recoveryIsCurrent = \(\) =>/,
    );
    assert.match(
      app,
      /const \[, workspaceRecoveryPersistence\] = await Promise\.all\([\s\S]*if \(!recoveryIsCurrent\(\)\) \{[\s\S]*return;[\s\S]*workspaceRecoveryPersistence === 'failed'/,
    );
    assert.match(app, /setWorkspaceDiscoveryRevision\(\(revision\) => revision \+ 1\)/);
  });

  it("restores a denied membership only after an explicit fresh catalog retry", () => {
    const app = appSource();

    assert.match(app, /restoreUnavailableWorkspacesFromFreshCatalogRef = useRef\(false\)/);
    assert.match(app, /allowFreshWorkspaceRestoration[\s\S]*fetchSavedRoutes\(accessToken\)[\s\S]*normalizedCatalog[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = false/);
    assert.match(app, /normalizedCatalog = normalizeWorkspaceCatalog\(result\.clients\)/);
    assert.match(app, /fetchSavedRoutes\(accessToken\)[\s\S]*!requestIsCurrent\(\)[\s\S]*return[\s\S]*reconcileUnavailableWorkspaceIds/);
    assert.match(app, /reconcileUnavailableWorkspaceIds\(\{[\s\S]*allowFreshRestoration: allowFreshWorkspaceRestoration[\s\S]*freshWorkspaces: normalizedCatalog/);
    assert.match(app, /previousUnavailableWorkspaceIds[\s\S]*workspaceAccessRestored = findRestoredWorkspaceIds\([\s\S]*previousUnavailableWorkspaceIds,[\s\S]*unavailableWorkspaceIds,[\s\S]*\)\.length > 0/);
    assert.match(app, /workspaceAccessRestored[\s\S]*Workspace access refreshed\./);
    assert.match(app, /handleRetryWorkspaceCatalog[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = true[\s\S]*setWorkspaceDiscoveryRevision/);
    assert.match(
      app,
      /handleWorkspaceUnavailable[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = false[\s\S]*unavailableWorkspaceIdsRef\.current =/,
    );
    assert.match(app, /handleRetryWorkspaceCatalog[\s\S]*setWorkspaceCatalogRetrying\(true\)[\s\S]*setWorkspaceDiscoveryRevision/);
    assert.match(app, /handleRetryWorkspaceCatalog[\s\S]*workspaceCatalogRetryingRef\.current[\s\S]*return;[\s\S]*workspaceCatalogRetryingRef\.current = true/);
    assert.match(app, /shouldOfferWorkspaceAccessRefresh\(\{[\s\S]*catalogError: Boolean\(workspaceCatalogError\)[\s\S]*catalogRetrying: workspaceCatalogRetrying/);
    assert.equal(
      (app.match(/workspaceCatalogLoading=\{workspaceCatalogBusy\}/g) || []).length,
      3,
    );
    assert.match(app, /finally \{[\s\S]*setWorkspaceCatalogLoading\(false\)[\s\S]*setWorkspaceCatalogRetrying\(false\)/);
    assert.equal(
      (app.match(/onRetryWorkspaceCatalog=\{handleRetryWorkspaceCatalog\}/g) || []).length,
      3,
    );
    assert.equal(
      (app.match(/workspaceAccessRefreshAvailable=\{workspaceAccessRefreshAvailable\}/g) || []).length,
      3,
    );
    assert.equal(
      (app.match(/workspaceAccessRecoveryPending=\{workspaceAccessRecoveryPending\}/g) || []).length,
      3,
    );
    assert.match(guestSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(routesSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(operationsSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    for (const source of [guestSource(), routesSource(), operationsSource()]) {
      assert.match(
        source,
        /<WorkspaceAccessRefreshControl[\s\S]*availableWorkspaceCount=\{availableWorkspaces\.length\}/,
      );
      assert.match(
        source,
        /<WorkspaceAccessRefreshControl[\s\S]*accessRecoveryPending=\{workspaceAccessRecoveryPending\}[\s\S]*verificationUnavailable=\{Boolean\(workspaceCatalogError\)\}/,
      );
    }
    assert.match(workspaceRefreshSource(), /accessibilityLabel=\{state\.accessibilityLabel\}/);
    assert.match(workspaceRefreshSource(), /accessibilityLiveRegion="polite"/);
    assert.match(workspaceRefreshSource(), /accessibilityState=\{\{ disabled: loading, busy: loading \}\}/);
    assert.match(workspaceRefreshSource(), /shouldStackWorkspaceAccessControl\(\{ fontScale, width \}\)/);
    assert.match(workspaceRefreshSource(), /useNetworkAvailability\(\)/);
    assert.doesNotMatch(workspaceRefreshSource(), /numberOfLines=/);
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
    assert.match(guest, /workspaceAuthorizationRequired =[\s\S]*authenticated && Boolean\(routingClientId\) && !workspaceAuthorizationFresh/);
    assert.match(guest, /routeActionDisabled =[\s\S]*workspaceAuthorizationRequired/);
    assert.match(guest, /Reconnect to verify workspace access before plotting this route/);
    assert.match(guest, /routeActionAccessibilityLabel = workspaceSelectionRequired/);
    assert.match(guest, /retryAvailable =[\s\S]*!loading && Boolean\(onRetry && errorMessage\)/);
    assert.match(guest, /Choose the SafeRoute workspace above before plotting this route/);
    assert.match(guest, /routeMessage \|\| sessionNotice \|\| locationErrorMessage/);
    assert.match(guest, /enabled: !workspaceSelectionRequired && !workspaceAuthorizationRequired/);
    assert.match(guest, /cancelRoadRouteUpgrade\(\)[\s\S]*activeRiskAreaRequestRef\.current\?\.abort\(\)[\s\S]*setRoutePlan\(null\)/);
    assert.doesNotMatch(guest, /result\.clients\[0\]/);
    assert.match(routes, /selectedClientId = activeWorkspace\?\.id \|\| null/);
    assert.match(routes, /fetchSavedRoutes\([\s\S]*requestWorkspaceId/);
    assert.match(routes, /routesForWorkspace\(result\.routes, requestWorkspaceId\)/);
    assert.match(routes, /!cached && offline && !refresh[\s\S]*loadOfflineRoutes\(cacheIdentity, null\)/);
    assert.match(routes, /routeDetail\.clientId !== selectedClientId/);
    assert.match(routes, /activeWorkspaceIdRef\.current === selectedClientId/);
    assert.match(routes, /isWorkspaceUnavailableError\(error\)[\s\S]*recoverUnavailableWorkspace\(requestWorkspaceId\)/);
    assert.match(routes, /isWorkspaceForbiddenError\(error\)[\s\S]*recoverUnavailableWorkspace\(selectedClientId\)/);
    assert.match(routes, /setRoutes\(\[\]\)[\s\S]*onWorkspaceChange\(workspace\)/);
    assert.match(routes, /workspaceCatalogLoading/);
    assert.match(routes, /Workspaces unavailable/);
    assert.match(routes, /Choose workspace/);
    assert.match(routes, /Offline saved copy · reconnect before starting guidance/);
    assert.match(routes, /No workspace access/);
    assert.doesNotMatch(routes, /setClients\(result\.clients\)/);
    assert.doesNotMatch(operationsSource(), /clients\[0\]|resolveOperationsClientId/);
  });

  it("blocks a cross-workspace switch while guidance remains resumable", () => {
    const app = appSource();

    assert.match(app, /handleActiveWorkspaceChange[\s\S]*activeNavigationSession[\s\S]*workspace\?\.id !== activeWorkspace\?\.id[\s\S]*return/);
    assert.match(app, /navigationWorkspaceLocked = Boolean\([\s\S]*activeNavigationSession \|\| pendingNavigationRestore/);
    assert.match(app, /workspaceSwitchDisabled=\{navigationWorkspaceLocked\}/);
  });

  it("does not open a replacement route until prior guidance cleanup succeeds", () => {
    const app = appSource();
    const guestOpen = app.slice(
      app.indexOf("const openRoutePreview ="),
      app.indexOf("const handleSelectSavedRoute ="),
    );
    const savedOpen = app.slice(
      app.indexOf("const handleSelectSavedRoute ="),
      app.indexOf("const returnFromRoutePreview ="),
    );

    for (const routeOpen of [guestOpen, savedOpen]) {
      assert.match(
        routeOpen,
        /pendingNavigationRestoreRef\.current\)[\s\S]*discardPersistedNavigation\([\s\S]*return;/,
      );
      assert.match(
        routeOpen,
        /activeNavigationSession[\s\S]*route\.id !== routePlan\.route\.id[\s\S]*discardPersistedNavigation\([\s\S]*return;/,
      );
      const cleanupIndex = routeOpen.indexOf("void discardPersistedNavigation(");
      const publishIndex = routeOpen.indexOf("setSelectedRoute(routePlan)");
      assert.ok(cleanupIndex >= 0);
      assert.ok(publishIndex > cleanupIndex);
    }
  });

  it("keeps cached workspaces browse-only until a fresh catalog authorizes guidance", () => {
    const app = appSource();
    const guest = guestSource();
    const cachedCatalogIndex = app.indexOf('if (cachedCatalog.length)');
    const freshRequestIndex = app.indexOf('const result = await fetchSavedRoutes(accessToken)');
    const freshAuthorizationIndex = app.indexOf(
      'freshWorkspaceAuthorizationRef.current = {',
      freshRequestIndex,
    );

    assert.ok(cachedCatalogIndex >= 0);
    assert.ok(freshRequestIndex > cachedCatalogIndex);
    assert.ok(freshAuthorizationIndex > freshRequestIndex);
    assert.doesNotMatch(
      app.slice(cachedCatalogIndex, freshRequestIndex),
      /freshWorkspaceAuthorizationRef\.current/,
    );
    assert.match(
      app.slice(freshAuthorizationIndex, freshAuthorizationIndex + 220),
      /principalId[\s\S]*new Set\(stagedCatalog\.map\(\(workspace\) => workspace\.id\)\)/,
    );
    assert.match(
      app,
      /openRoutePreview[\s\S]*!freshWorkspaceAuthorizationRef\.current\.workspaceIds\.has\(routeWorkspaceId\)[\s\S]*Reconnect and refresh workspace access before starting guidance/,
    );
    assert.match(
      app,
      /handleSelectSavedRoute[\s\S]*!freshWorkspaceAuthorizationRef\.current\.workspaceIds\.has\(routePlan\.clientId\)[\s\S]*Reconnect and refresh workspace access before starting guidance/,
    );
    assert.match(
      app,
      /<GuestMapScreen[\s\S]*workspaceAuthorizationFresh=\{activeWorkspaceAuthorizationFresh\}/,
    );
    assert.match(
      guest,
      /workspaceAuthorizationRequired =[\s\S]*!workspaceAuthorizationFresh[\s\S]*routeActionDisabled =[\s\S]*workspaceAuthorizationRequired/,
    );
    assert.match(
      app,
      /previousUnavailableWorkspaceIds[\s\S]*findRestoredWorkspaceIds\([\s\S]*workspaceAccessRestored[\s\S]*stagedUnavailableWorkspaceIds/,
    );
    assert.match(
      app,
      /purgeStagedWorkspaceCaches[\s\S]*Array\.from\(stagedUnavailableWorkspaceIds\)\.map[\s\S]*if \(workspaceAccessRestored\)[\s\S]*stagedPersistence = await persistWorkspaceRecoveryWithEvidence[\s\S]*fallbackUnavailableWorkspaceIds: stagedUnavailableWorkspaceIds[\s\S]*return persistWorkspaceRecoveryWithEvidence[\s\S]*requireFallback: workspaceAccessRestored/,
    );
    assert.match(
      app,
      /workspaceAccessRestored && recoveryPersistence !== 'persisted'[\s\S]*Workspace access could not be restored safely[\s\S]*if \(workspaceAccessRestored\) \{[\s\S]*unavailableWorkspaceIdsRef\.current = unavailableWorkspaceIds/,
    );
  });

  it("revalidates the current principal and catalog immediately before workspace guidance starts", () => {
    const app = appSource();
    const liveMap = readFileSync("src/features/live-map/LiveMapScreen.tsx", "utf8");

    assert.match(
      app,
      /handleAuthorizeNavigationStart[\s\S]*authorizeWorkspaceNavigationStart\([\s\S]*getCurrentUser\(accessToken\)[\s\S]*fetchSavedRoutes\(accessToken\)/,
    );
    assert.match(
      app,
      /authorization\.status === 'workspace-unavailable'[\s\S]*await handleWorkspaceUnavailable\(workspaceId, authorization\.workspaces\)/,
    );
    assert.match(
      app,
      /resolveFreshWorkspaceAccessRecovery\([\s\S]*unavailableWorkspaceIds: unavailableWorkspaceIdsRef\.current[\s\S]*setWorkspaceCatalogLoading\(!freshCatalog\)[\s\S]*if \(!freshCatalog\) \{[\s\S]*setWorkspaceDiscoveryRevision/,
    );
    assert.match(
      app,
      /Array\.from\(unavailableWorkspaceIdsRef\.current\)\.map\(\(workspaceId\) =>[\s\S]*clearOfflineRouteWorkspace\(principalId, workspaceId\)/,
    );
    const startAuthorization = app.slice(
      app.indexOf("const handleAuthorizeNavigationStart"),
      app.indexOf("useEffect(() =>", app.indexOf("const handleAuthorizeNavigationStart")),
    );
    assert.match(
      startAuthorization,
      /reconcileFreshWorkspaceCatalog\([\s\S]*freshWorkspaces: authorization\.workspaces[\s\S]*knownWorkspaces: availableWorkspacesRef\.current/,
    );
    assert.match(
      startAuthorization,
      /persistWorkspaceRecoveryWithEvidence\([\s\S]*Array\.from\(reconciliation\.unavailableWorkspaceIds\)\.map[\s\S]*await Promise\.all\([\s\S]*persistenceResult === 'failed'[\s\S]*freshWorkspaceAuthorizationRef\.current =/,
    );
    assert.match(
      app,
      /routePreviewRevisionRef[\s\S]*lastRenderedSelectedRouteRef[\s\S]*routePreviewRevisionRef\.current \+= 1/,
    );
    assert.match(
      app,
      /handleAuthorizeNavigationStart[\s\S]*routePlan,[\s\S]*routePreviewRevision: routePreviewRevisionRef\.current[\s\S]*isNavigationStartRequestCurrent\(request/,
    );
    assert.match(
      app,
      /onAuthorizeNavigationStart=\{handleAuthorizeNavigationStart\}/,
    );
    assert.match(
      app,
      /handleNavigationSessionChange[\s\S]*freshWorkspaceAuthorizationRef\.current\.workspaceIds\.has\(workspaceId\)/,
    );
    const authorizationStart = liveMap.indexOf("const authorizeAndStartNavigation");
    const authorizationEnd = liveMap.indexOf("const handlePrimaryNavigationAction", authorizationStart);
    const authorizationFlow = liveMap.slice(authorizationStart, authorizationEnd);
    assert.match(
      authorizationFlow,
      /runNavigationStartAuthorization\([\s\S]*authorize: \(\) => onAuthorizeNavigationStartRef\.current\(routePlan\)[\s\S]*commit: commitNavigationStart[\s\S]*validate: \(\) => navigationStartBlockedReasonRef\.current/,
    );
    assert.doesNotMatch(
      authorizationFlow,
      /onAuthorizeNavigationStartRef\.current\(liveRoutePlan\)/,
    );
    assert.match(
      liveMap,
      /activeSessionSnapshotRef\.current =[\s\S]*routePlan: liveRoutePlan/,
    );
    assert.match(
      liveMap,
      /Checking workspace access before starting guidance/,
    );
  });

  it("defers persisted workspace guidance until the fresh catalog authorizes it", () => {
    const app = appSource();
    const guest = guestSource();
    const liveMap = readFileSync("src/features/live-map/LiveMapScreen.tsx", "utf8");

    assert.match(app, /pendingNavigationRestoreRef = useRef<ActiveNavigationSession \| null>\(null\)/);
    assert.match(app, /await stopBackgroundNavigation\(\);[\s\S]*loadActiveNavigationSession\(\);[\s\S]*const storedSession = await loadAuthSession\(\)/);
    assert.match(app, /catch \{[\s\S]*clearAuthSession\(\)\.catch\(\(\) => undefined\)[\s\S]*openActiveNavigationSession\(persistedNavigation, false/);
    assert.match(app, /persistedNavigation\?\.accessScope\.kind === 'workspace'[\s\S]*stagePendingNavigationRestore\(persistedNavigation\)/);
    assert.match(app, /hasMatchingAuthPrincipal\([\s\S]*persistedNavigation\.accessScope\.principalId/);
    assert.match(app, /stagePendingNavigationRestore\(persistedNavigation\);[\s\S]*stopBackgroundNavigation\(\)/);
    assert.match(
      app,
      /getCurrentUser\(accessToken\)[\s\S]*currentPrincipalId !== principalId[\s\S]*Workspace access belongs to another signed-in account[\s\S]*currentPrincipalId !== pendingNavigationForAuthorization\.accessScope\.principalId[\s\S]*Active guidance belongs to another signed-in account/,
    );
    const principalRevalidationIndex = app.indexOf(
      'const currentUser = await getCurrentUser(accessToken)',
    );
    const catalogRequestIndex = app.indexOf(
      'const result = await fetchSavedRoutes(accessToken)',
      principalRevalidationIndex,
    );
    assert.ok(principalRevalidationIndex >= 0);
    assert.ok(catalogRequestIndex > principalRevalidationIndex);
    assert.match(app, /fetchSavedRoutes\(accessToken\)[\s\S]*pendingNavigationWorkspace = findWorkspace\([\s\S]*openActiveNavigationSession\([\s\S]*pendingNavigation,[\s\S]*true,[\s\S]*resolvedWorkspace\?\.id/);
    assert.match(app, /pendingNavigation && !pendingNavigationWorkspace[\s\S]*discardPersistedNavigation\([\s\S]*Plot the route again/);
    assert.match(app, /performPersistedNavigationCleanup[\s\S]*stopBackgroundNavigation\(\)[\s\S]*clearActiveNavigationSession\(\)/);
    assert.match(app, /navigationCleanupRequiredRef = useRef\(false\)/);
    assert.match(app, /performPersistedNavigationCleanup[\s\S]*cleanup\[1\]\.value === true/);
    assert.match(app, /confirmBackgroundNavigationStopped/);
    assert.match(app, /navigationCleanupRequiredRef\.current = !cleanupSucceeded/);
    assert.match(app, /!durableClearSucceeded[\s\S]*Saved guidance could not be removed/);
    assert.match(app, /handleRetryNavigationCleanup[\s\S]*Saved guidance removed/);
    assert.match(app, /navigationCleanupRequiredRef\.current \|\|[\s\S]*canResumeActiveNavigationSession/);
    assert.match(app, /handleNavigationSessionChange[\s\S]*navigationCleanupRequiredRef\.current/);
    assert.match(app, /openRoutePreview[\s\S]*navigationCleanupRequiredRef\.current[\s\S]*Finish saved-guidance cleanup/);
    assert.match(app, /NavigationCleanupNotice[\s\S]*onRetry=/);
    assert.match(app, /unavailableWorkspaceIdsRef\.current = stagedUnavailableWorkspaceIds[\s\S]*availableWorkspacesRef\.current = stagedCatalog[\s\S]*currentNavigationCleanup[\s\S]*persistWorkspaceRecoveryWithEvidence/);
    assert.match(app, /recoveryPersistence !== 'persisted'[\s\S]*return;[\s\S]*if \(workspaceAccessRestored\) \{[\s\S]*unavailableWorkspaceIdsRef\.current = unavailableWorkspaceIds[\s\S]*availableWorkspacesRef\.current = catalog/);
    const persistenceIndex = app.indexOf(
      'const workspaceRecoveryPersistence = (async () => {',
    );
    const cleanupAwaitIndex = app.indexOf(
      'const [, , recoveryPersistence] = await Promise.all([',
    );
    assert.ok(persistenceIndex >= 0);
    assert.ok(cleanupAwaitIndex > persistenceIndex);
    assert.match(
      app.slice(cleanupAwaitIndex, cleanupAwaitIndex + 250),
      /currentNavigationCleanup[\s\S]*pendingNavigationCleanup[\s\S]*workspaceRecoveryPersistence/,
    );
    assert.match(app, /recoveryPersistence === 'failed'[\s\S]*workspaceIds: new Set<string>\(\)/);
    assert.match(app, /handleNavigationSessionChange[\s\S]*canResumeActiveNavigationSession[\s\S]*return false/);
    assert.match(app, /activeSessionPrincipalIdRef\.current/);
    assert.match(app, /principalId=\{sessionPrincipalId\}/);
    assert.match(app, /handleNavigationSessionChange[\s\S]*pendingNavigationRestoreRef\.current[\s\S]*return false/);
    assert.match(guest, /retryAvailable =[\s\S]*!loading && Boolean\(onRetry && errorMessage\)[\s\S]*catalogUnavailable \|\| switchDisabled/);
    assert.match(guest, /disabled = retryAvailable[\s\S]*\? false[\s\S]*switchDisabled/);
    assert.match(guest, /onPress=\{retryAvailable \? onRetry : onToggle\}/);
    assert.match(liveMap, /accepted === false[\s\S]*clearActiveNavigationSession\(\)[\s\S]*return[\s\S]*saveActiveNavigationSession/);
    assert.match(app, /stagePendingNavigationRestore\(persistedNavigation\)/);
    assert.match(app, /pendingNavigationRestoreRef\.current[\s\S]*setPendingNavigationRestoreStatus\('paused'\)/);
    assert.match(app, /SuspendedNavigationNotice[\s\S]*onRetry=\{handleRetryWorkspaceCatalog\}/);
    assert.match(app, /discardPersistedNavigation\('Suspended route ended\.'\)/);
    assert.match(app, /wasOffline[\s\S]*reconnectRetryPendingRef\.current = true[\s\S]*pendingNavigationRestore\?\.status === 'paused'[\s\S]*!workspaceCatalogLoading[\s\S]*handleRetryWorkspaceCatalog\(\)/);
  });
});
