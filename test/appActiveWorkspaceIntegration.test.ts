import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const appSource = () => readFileSync("App.tsx", "utf8");
const guestSource = () => readFileSync("src/features/guest-map/GuestMapScreen.tsx", "utf8");
const operationsSource = () => readFileSync("src/features/operations/OperationsScreen.tsx", "utf8");
const routesSource = () => readFileSync("src/features/routes/RouteListScreen.tsx", "utf8");
const routeFiltersSource = () => readFileSync("src/features/routes/RouteListFilters.tsx", "utf8");
const workspaceRefreshSource = () => readFileSync("src/features/workspaces/WorkspaceAccessRefreshControl.tsx", "utf8");
const suspendedNavigationSource = () =>
  readFileSync("src/features/live-map/SuspendedNavigationNotice.tsx", "utf8");

describe("App active workspace integration", () => {
  it("returns a freshly restored removed target to the exact retry without switching", () => {
    const app = appSource();
    const restoredTargetBranch = app.slice(
      app.indexOf("const alternativeRecovery ="),
      app.indexOf("if (alternativeRecovery !== 'clear-stale')"),
    );

    assert.match(
      app,
      /workspaceHandoffAlternativeReasonRef[\s\S]*WorkspaceHandoffAlternativeReason/,
    );
    assert.match(
      app,
      /retainWorkspaceHandoffForAlternativeSelection[\s\S]*workspaceHandoffAlternativeReasonRef\.current = 'target-removed'/,
    );
    assert.match(
      app,
      /handleChooseAnotherWorkspace[\s\S]*workspaceHandoffAlternativeReasonRef\.current = 'explicit-choice'/,
    );
    assert.match(
      app,
      /resolveWorkspaceHandoffAlternativeRecovery\(\{[\s\S]*targetAuthorizationFresh:[\s\S]*networkStatusRef\.current === 'online'[\s\S]*networkAuthorizationReady[\s\S]*freshWorkspaceAuthorizationRef\.current\.workspaceIds\.has/,
    );
    assert.match(
      restoredTargetBranch,
      /setWorkspaceHandoffAlternativeSelectionPending\(false\)[\s\S]*setWorkspaceHandoffRetryTargetAccessRestored\(true\)[\s\S]*setWorkspaceSelectionStatus\('failed'\)/,
    );
    assert.match(
      restoredTargetBranch,
      /is available again\.[\s\S]*workspaceHandoffRetryFocusTargetRef\.current/,
    );
    assert.doesNotMatch(
      restoredTargetBranch,
      /handleActiveWorkspaceChange|persistOfflineReviewWorkspaceSelection|performPersistedNavigationCleanup/,
    );
    assert.match(
      app,
      /<WorkspaceHandoffRetryNotice[\s\S]*targetAccessRestored=\{workspaceHandoffRetryTargetAccessRestored\}/,
    );
    for (const surface of [
      guestSource(),
      operationsSource(),
      routeFiltersSource(),
    ]) {
      assert.match(
        surface,
        /if \(!workspaceAlternativeSelectionPending\) \{[\s\S]*set(?:Workspace|Client)MenuOpen\(false\);[\s\S]*\}, \[workspaceAlternativeSelectionPending\]\);/,
      );
    }
  });

  it("owns one authoritative catalog and shares the active workspace with Map, Saved, and Operations", () => {
    const app = appSource();

    assert.match(app, /availableWorkspaces, setAvailableWorkspaces/);
    assert.match(app, /activeWorkspace, setActiveWorkspace/);
    assert.match(app, /fetchSavedRoutes\(accessToken\)/);
    assert.match(app, /normalizeWorkspaceCatalog\(result\.clients\)/);
    assert.match(app, /resolveActiveWorkspace\([\s\S]*result\.selectedClientId/);
    assert.match(app, /loadOfflineWorkspaceContext\(principalId\)/);
    assert.match(app, /loadOfflineRoutesSnapshot\(principalId, null\)/);
    assert.match(app, /migrateOfflineWorkspaceCatalogFromRouteCache\([\s\S]*legacyRouteCacheSnapshot\.storedAtMs/);
    assert.match(
      app,
      /navigationWorkspace[\s\S]*persistOfflineReviewWorkspaceSelection\([\s\S]*navigationWorkspace\.id/,
    );
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
    assert.equal(
      (app.match(/workspaceCatalogStoredAtMs=\{workspaceCatalogStoredAtMs\}/g) || [])
        .length,
      3,
    );
  });

  it("advances catalog age only for owned full-catalog responses", () => {
    const app = appSource();

    assert.match(
      app,
      /const authoritativeCatalogStoredAtMs = Date\.now\(\);[\s\S]*normalizeWorkspaceCatalog\(result\.clients\)/,
    );
    assert.match(
      app,
      /catalog-restoration-staged[\s\S]*authoritativeCatalogStoredAtMs[\s\S]*catalog-restoration-final/,
    );
    assert.match(
      app,
      /const authoritativeCatalogStoredAtMs = freshCatalog \? Date\.now\(\) : undefined[\s\S]*persistWorkspaceRecoveryWithEvidence\([\s\S]*\{ authoritativeCatalogStoredAtMs \}/,
    );
    assert.match(
      app,
      /handleActiveWorkspaceChange[\s\S]*runDurableWorkspaceSelectionAttempt\(\{[\s\S]*persistOfflineReviewWorkspaceSelection\([\s\S]*requestedTargetWorkspaceId/,
    );
    assert.match(
      app,
      /getWorkspaceCatalogExpiryDelayMs[\s\S]*Saved workspace list expired[\s\S]*setAvailableWorkspaces\(\[\]\)/,
    );
    assert.match(
      app,
      /scheduleExpiryCheck[\s\S]*getWorkspaceCatalogExpiryDelayMs[\s\S]*setTimeout\(scheduleExpiryCheck/,
    );
    assert.match(
      app,
      /setAvailableWorkspaces\(stagedCatalog\)[\s\S]*setWorkspaceCatalogRetentionStoredAtMs\(authoritativeCatalogStoredAtMs\)[\s\S]*workspaceRecoveryPersistence/,
    );
    assert.match(
      app,
      /resolveWorkspaceAccessAnnouncement\(\{[\s\S]*catalogStoredAtMs: activeWorkspaceAuthorizationFresh[\s\S]*workspaceCatalogStoredAtMs/,
    );
  });

  it("persists and verifies ordinary workspace selection before publishing it", () => {
    const app = appSource();
    const selection = app.slice(
      app.indexOf("const handleActiveWorkspaceChange ="),
      app.indexOf("const handleGuardedWorkspaceChange ="),
    );
    const persistenceIndex = selection.indexOf(
      "runDurableWorkspaceSelectionAttempt({",
    );
    const targetWriteIndex = selection.indexOf(
      "persistOfflineReviewWorkspaceSelection(",
    );
    const readbackIndex = selection.indexOf(
      "persistedSelection?.activeWorkspaceId",
    );
    const refPublishIndex = selection.indexOf(
      "activeWorkspaceRef.current = persistedTarget",
    );
    const statePublishIndex = selection.indexOf(
      "setActiveWorkspace(persistedTarget)",
    );

    assert.ok(persistenceIndex >= 0);
    assert.ok(targetWriteIndex > persistenceIndex);
    assert.ok(readbackIndex > targetWriteIndex);
    assert.ok(refPublishIndex > readbackIndex);
    assert.ok(statePublishIndex > refPublishIndex);
    assert.match(
      selection,
      /requestedPrincipalId = activeSessionPrincipalIdRef\.current[\s\S]*requestedSessionEpoch = sessionEpochRef\.current[\s\S]*requestedWorkspaceRequestRevision = workspaceRequestRevisionRef\.current[\s\S]*requestedSourceWorkspaceId = activeWorkspaceRef\.current\?\.id \|\| null/,
    );
    assert.match(
      selection,
      /workspaceSelectionPendingRef\.current = true[\s\S]*resolveEndRouteWorkspaceChangeTarget\(\{[\s\S]*hasActiveNavigation: Boolean\(activeNavigationSessionRef\.current\)[\s\S]*hasPendingNavigation: Boolean\(pendingNavigationRestoreRef\.current\)/,
    );
    assert.match(
      selection,
      /retryingVisibleWorkspace[\s\S]*allowSameSourceTarget: retryingVisibleWorkspace/,
    );
    assert.match(
      selection,
      /reconcileOfflineReviewWorkspaceSelection\([\s\S]*activeWorkspaceId: visibleWorkspace\?\.id \|\| null/,
    );
    assert.match(
      selection,
      /workspaceCatalogBusyRef\.current[\s\S]*workspaceCatalogRetryingRef\.current[\s\S]*workspaceForegroundRefreshPendingRef\.current/,
    );
    assert.match(
      selection,
      /currentMessage === savingMessage \? stoppedMessage : currentMessage/,
    );
    assert.match(
      selection,
      /requestStillOwnsSelection = requestOwnerIsCurrent\(\)[\s\S]*uiRequestOwnerIsCurrent =[\s\S]*requestStillOwnsSelection[\s\S]*requestedSourceWorkspaceId ===[\s\S]*activeWorkspaceRef\.current\?\.id/,
    );
    assert.match(
      selection,
      /publishStorageFailure[\s\S]*Platform\.OS === 'ios'[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.request/,
    );
    assert.match(
      selection,
      /const publishSelectionFailure =[\s\S]*Workspace unchanged\.[\s\S]*Choose a workspace again\.[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.request/,
    );
    assert.match(
      selection,
      /runDurableWorkspaceSelectionAttempt\(\{[\s\S]*persistTarget:[\s\S]*persistOfflineReviewWorkspaceSelection\([\s\S]*reconcileSource: reconcileVisibleSelection[\s\S]*attempt\.status === 'failed'[\s\S]*settleFailedPersistence\(attempt\.reconciliation\)[\s\S]*finally \{[\s\S]*workspaceSelectionPendingRef\.current = false/,
    );
    assert.match(
      selection,
      /Workspace changed to \$\{persistedTarget\.name\}\.[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.request/,
    );
    assert.doesNotMatch(
      selection,
      /void persistOfflineReviewWorkspaceSelection\(|catch\(\(\) => undefined\)/,
    );
    assert.match(
      app,
      /openRoutePreview[\s\S]*workspaceSelectionPendingRef\.current[\s\S]*Wait for the workspace change before opening another route/,
    );
    assert.match(
      app,
      /handleSelectSavedRoute[\s\S]*workspaceSelectionPendingRef\.current[\s\S]*Wait for the workspace change before opening another route/,
    );
    assert.equal(
      (app.match(/workspaceSelectionPending=\{workspaceSelectionPending\}/g) || [])
        .length,
      3,
    );
    assert.equal(
      (
        app.match(
          /workspaceSelectionFailed=\{surfaceWorkspaceSelectionFailed\}/g,
        ) || []
      )
        .length,
      3,
    );
  });

  it("lets Operations request App's guarded workspace handoff and preserves catalog recovery", () => {
    const app = appSource();
    const operations = operationsSource();

    assert.match(app, /<OperationsScreen[\s\S]*onWorkspaceChange=\{handleGuardedWorkspaceChange\}/);
    assert.match(app, /<OperationsScreen[\s\S]*onRetryWorkspaceCatalog=/);
    assert.match(app, /<OperationsScreen[\s\S]*workspaceCatalogError=\{workspaceCatalogError\}/);
    assert.match(app, /<OperationsScreen[\s\S]*workspaceCatalogLoading=\{workspaceCatalogBusy\}/);
    assert.match(
      app,
      /<OperationsScreen[\s\S]*workspaceChangeEndsNavigation=\{navigationWorkspaceLocked\}[\s\S]*workspaceSwitchDisabled=\{workspaceCleanupLocked\}/,
    );
    assert.match(app, /<OperationsScreen[\s\S]*onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(app, /<RouteListScreen[\s\S]*onWorkspaceUnavailable=\{handleWorkspaceUnavailable\}/);
    assert.match(operations, /onWorkspaceChange\(nextWorkspace\)/);
    assert.doesNotMatch(operations, /activeWorkspaceIdRef\.current = nextWorkspace\.id/);
  });

  it("returns local offline End to the same cached review workspace without fresh authorization", () => {
    const app = appSource();
    const suspended = suspendedNavigationSource();
    const routes = routesSource();

    assert.match(
      app,
      /handleEndSuspendedNavigation[\s\S]*endedWorkspaceId[\s\S]*endedPrincipalId[\s\S]*endedSessionEpoch[\s\S]*endRequestIsCurrent[\s\S]*await discardPersistedNavigation\(undefined, \{[\s\S]*publishCleanupFailure: false/,
    );
    assert.match(
      app,
      /await persistOfflineReviewWorkspaceSelection\([\s\S]*endedPrincipalId[\s\S]*endedWorkspaceId[\s\S]*reviewWorkspaceRequestIsCurrent\(\)[\s\S]*persistedReviewWorkspace[\s\S]*setActiveWorkspace\(persistedReviewWorkspace\)[\s\S]*setSessionMessage\('Suspended route ended\.'\)/,
    );
    assert.match(
      app,
      /isSuspendedNavigationEndRequestCurrent\(\{[\s\S]*currentPrincipalId: activeSessionPrincipalIdRef\.current[\s\S]*currentSessionEpoch: sessionEpochRef\.current/,
    );
    assert.match(
      app,
      /catch \{[\s\S]*reviewWorkspaceRequestIsCurrent\(\)[\s\S]*Choose a cached workspace/,
    );
    assert.doesNotMatch(
      app,
      /discardPersistedNavigation\('Suspended route ended\.'\)/,
    );
    assert.match(
      app,
      /if \(!ended\) \{[\s\S]*endRequestIsCurrent\(\)[\s\S]*Saved guidance could not be removed/,
    );
    assert.match(
      app,
      /<SuspendedNavigationNotice[\s\S]*onEnd=\{\(\) => \{[\s\S]*handleEndSuspendedNavigation\(\)/,
    );
    assert.match(
      suspended,
      /testID=\{uiTestIds\.suspendedNavigationStatus\}[\s\S]*testID=\{uiTestIds\.suspendedNavigationRetry\}[\s\S]*testID=\{uiTestIds\.suspendedNavigationEnd\}/,
    );
    assert.doesNotMatch(
      suspended,
      /testID=\{uiTestIds\.suspendedNavigationNotice\}[\s\S]{0,160}accessibilityRole="alert"/,
    );
    assert.match(
      routes,
      /accessibilityLabel=\{offlineReviewPresentation\.accessibilityLabel\}[\s\S]*accessibilityRole="alert"[\s\S]*testID=\{uiTestIds\.routeListOfflineNotice\}/,
    );
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
    assert.match(
      app,
      /clearOfflineWorkspaceProductCaches[\s\S]*clearOfflineRouteWorkspace\([\s\S]*clearOfflineOperationsWorkspace\(/,
    );
  });

  it("revokes the secure Operations calendar at every terminal authentication boundary", () => {
    const app = appSource();

    assert.match(
      app,
      /restoreResult\.status === 'expired'[\s\S]*purgeOfflineOperationsPrincipalAtTerminalBoundary\([\s\S]*getAuthSessionPrincipalId\(storedSession\)/,
    );
    assert.match(
      app,
      /handleSignOut[\s\S]*signingOutPrincipalId[\s\S]*purgeOfflineOperationsPrincipalAtTerminalBoundary\([\s\S]*signingOutPrincipalId,[\s\S]*clearAuthSession/,
    );
    assert.match(
      app,
      /handleSessionExpired[\s\S]*expiredPrincipalId[\s\S]*purgeOfflineOperationsPrincipalAtTerminalBoundary\([\s\S]*expiredPrincipalId,[\s\S]*clearAuthSession/,
    );
    assert.match(
      app,
      /restoreResult\.status === 'restored'[\s\S]*tryActivateOfflineOperationsPrincipal\(restoredPrincipalId\)/,
    );
    assert.match(
      app,
      /handleAuthenticated[\s\S]*prepareOfflineOperationsPrincipalForFreshAuthentication\([\s\S]*getAuthSessionPrincipalId\(acceptedSession\)/,
    );
    assert.match(
      app,
      /operationsPreparation\.persistenceSafe[\s\S]*saveAuthSession\(acceptedSession\)[\s\S]*authSessionPersisted = true/,
    );
    assert.match(
      app,
      /recoverOfflineOperationsPrincipalCleanup\([\s\S]*null,[\s\S]*clearAuthSession[\s\S]*\)[\s\S]*loadAuthSession\(\)/,
    );
    assert.match(
      app,
      /operationsCleanup\.status !== 'clean'[\s\S]*setSession\(null\)[\s\S]*return;[\s\S]*const storedSession = await loadAuthSession\(\)/,
    );
    assert.match(
      app,
      /if \(!storedSession\) \{[\s\S]*ensureSignedOutOfflineOperationsCalendarRemoved\(\)[\s\S]*setOfflineCalendarCleanupStatus/,
    );
    assert.match(
      app,
      /handleRetryOfflineCalendarCleanup[\s\S]*recoverOfflineOperationsPrincipalCleanup\([\s\S]*ensureSignedOutOfflineOperationsCalendarRemoved\(\)[\s\S]*Offline data storage restored for this session/,
    );
    const calendarCleanupRetry = app.slice(
      app.indexOf('const handleRetryOfflineCalendarCleanup'),
      app.indexOf('const handleEndSuspendedNavigation'),
    );
    assert.doesNotMatch(calendarCleanupRetry, /saveAuthSession/);
    assert.match(
      app,
      /OfflineCalendarCleanupNotice[\s\S]*navigationCleanupStatus === 'idle'/,
    );
  });

  it("restores a denied membership only after an explicit fresh catalog retry", () => {
    const app = appSource();

    assert.match(app, /restoreUnavailableWorkspacesFromFreshCatalogRef = useRef\(false\)/);
    assert.match(app, /allowFreshWorkspaceRestoration[\s\S]*fetchSavedRoutes\(accessToken\)[\s\S]*normalizedCatalog[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = false/);
    assert.match(app, /normalizedCatalog = normalizeWorkspaceCatalog\(result\.clients\)/);
    assert.match(app, /fetchSavedRoutes\(accessToken\)[\s\S]*!onlineRequestIsCurrent\(\)[\s\S]*return[\s\S]*reconcileUnavailableWorkspaceIds/);
    assert.match(app, /reconcileUnavailableWorkspaceIds\(\{[\s\S]*allowFreshRestoration: allowFreshWorkspaceRestoration[\s\S]*freshWorkspaces: normalizedCatalog/);
    assert.match(app, /previousUnavailableWorkspaceIds[\s\S]*workspaceAccessRestored = findRestoredWorkspaceIds\([\s\S]*previousUnavailableWorkspaceIds,[\s\S]*unavailableWorkspaceIds,[\s\S]*\)\.length > 0/);
    assert.match(app, /workspaceAccessRestored[\s\S]*Workspace access refreshed\./);
    assert.match(app, /catalogRetryWasRequested[\s\S]*Workspace access verified\./);
    assert.match(app, /workspaceAccessRefreshWillRemain = shouldOfferWorkspaceAccessRefresh\(\{[\s\S]*accessRecoveryPending: unavailableWorkspaceIds\.size > 0[\s\S]*availableWorkspaceCount: catalog\.length[\s\S]*issue: 'none'/);
    assert.match(app, /Platform\.OS === 'ios' && !workspaceAccessRefreshWillRemain[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.request\([\s\S]*confirmation[\s\S]*workspaceAccessFocusTargetRef\.current/);
    assert.match(app, /AccessibilityInfo\.sendAccessibilityEvent\(target, 'focus'\)/);
    assert.equal(
      (app.match(/workspaceAccessFocusTargetRef=\{updateWorkspaceAccessFocusTarget\}/g) || []).length,
      3,
    );
    assert.match(app, /transition\.announcement[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.cancel\(\)[\s\S]*announceForAccessibilityWithOptions/);
    assert.match(app, /beginWorkspaceCatalogRetry = useCallback\(\(replaceInFlight: boolean\) => \{[\s\S]*workspaceCatalogRetryingRef\.current[\s\S]*workspaceCatalogBusyRef\.current[\s\S]*return false;[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.cancel\(\)[\s\S]*workspaceCatalogRetryingRef\.current = true/);
    assert.match(
      app,
      /Platform\.OS === 'ios' && transition\.announcement[\s\S]*AccessibilityInfo\.announceForAccessibilityWithOptions\([\s\S]*transition\.announcement/,
    );
    assert.match(
      app,
      /workspaceContextResolved:[\s\S]*authenticated[\s\S]*workspaceCatalogLoading && availableWorkspaces\.length === 0/,
    );
    assert.match(
      app,
      /automaticReconnectAnnouncementPendingRef\.current[\s\S]*networkStatus === 'online'[\s\S]*!workspaceCatalogLoading[\s\S]*return;/,
    );
    assert.match(
      app,
      /!catalogRetryWasRequested[\s\S]*automaticReconnectCompleted[\s\S]*Connection restored\. Workspace access verified\./,
    );
    assert.match(
      app,
      /shouldArmAutomaticReconnectAnnouncement\(\{[\s\S]*authenticated[\s\S]*networkStatus[\s\S]*offlineObserved: reconnect\.offlineObserved/,
    );
    assert.match(app, /beginWorkspaceCatalogRetry[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = true[\s\S]*setWorkspaceDiscoveryRevision/);
    assert.match(
      app,
      /handleWorkspaceUnavailable[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = false[\s\S]*unavailableWorkspaceIdsRef\.current =/,
    );
    assert.match(app, /beginWorkspaceCatalogRetry[\s\S]*setWorkspaceCatalogRetrying\(true\)[\s\S]*setWorkspaceDiscoveryRevision/);
    assert.match(app, /beginWorkspaceCatalogRetry[\s\S]*workspaceCatalogRetryingRef\.current[\s\S]*return false;[\s\S]*workspaceCatalogRetryingRef\.current = true/);
    assert.match(app, /shouldOfferWorkspaceAccessRefresh\(\{[\s\S]*catalogRetrying: workspaceCatalogRetrying[\s\S]*issue: workspaceAccessIssue/);
    assert.equal(
      (app.match(/completeWorkspaceCatalogRetry\([\s\S]{0,160}workspaceRequestRevisionRef\.current \+= 1/g) || []).length,
      2,
    );
    assert.match(app, /setWorkspaceCatalogError\('Workspaces could not be loaded\. Retry\.'\);[\s\S]*setWorkspaceAccessIssue\('verification-unavailable'\)/);
    assert.match(app, /setWorkspaceCatalogError\('Offline workspace cleanup needs retry\.'\);[\s\S]*setWorkspaceAccessIssue\('offline-safety'\)/);
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
    assert.equal(
      (app.match(/workspaceAccessIssue=\{workspaceAccessIssue\}/g) || []).length,
      3,
    );
    assert.match(guestSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(routesSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(operationsSource(), /workspaceAccessRefreshAvailable[\s\S]*<WorkspaceAccessRefreshControl/);
    assert.match(guestSource(), /workspaceAccessFocusTargetRef\?\.\(sheetCollapsed \? null : target\)/);
    assert.match(guestSource(), /accessibilityElementsHidden=\{sheetCollapsed\}[\s\S]*importantForAccessibility=\{sheetCollapsed \? 'no-hide-descendants' : 'auto'\}/);
    assert.match(guestSource(), /ref=\{focusTargetRef\}[\s\S]*testID=\{uiTestIds\.guestMapWorkspaceSelector\}/);
    assert.match(routeFiltersSource(), /ref=\{workspaceAccessFocusTargetRef\}[\s\S]*testID=\{uiTestIds\.routeListWorkspaceSelector\}/);
    assert.match(operationsSource(), /ref=\{workspaceAccessFocusTargetRef\}[\s\S]*testID=\{uiTestIds\.operationsWorkspaceSelector\}/);
    for (const source of [guestSource(), routesSource(), operationsSource()]) {
      assert.match(
        source,
        /<WorkspaceAccessRefreshControl[\s\S]*availableWorkspaceCount=\{availableWorkspaces\.length\}/,
      );
      assert.match(
        source,
        /<WorkspaceAccessRefreshControl[\s\S]*accessRecoveryPending=\{workspaceAccessRecoveryPending\}[\s\S]*issue=\{workspaceAccessIssue\}/,
      );
    }
    assert.match(workspaceRefreshSource(), /accessibilityLabel=\{state\.accessibilityLabel\}/);
    assert.match(workspaceRefreshSource(), /accessibilityLiveRegion="polite"/);
    assert.match(
      workspaceRefreshSource(),
      /const disabled = loading \|\| !online[\s\S]*busy: loading \|\| networkChecking,[\s\S]*disabled,/,
    );
    assert.match(workspaceRefreshSource(), /shouldStackWorkspaceAccessControl\(\{ fontScale, width \}\)/);
    assert.match(workspaceRefreshSource(), /useNetworkAvailability\(\)/);
    assert.doesNotMatch(workspaceRefreshSource(), /numberOfLines=/);
    assert.match(workspaceRefreshSource(), /testID=\{uiTestIds\.workspaceAccessRefresh\}/);
    assert.doesNotMatch(guestSource(), /workspaceAccessRefreshAvailable &&\s*\(availableWorkspaces\.length > 0 \|\| !workspaceCatalogError\)/);
    assert.doesNotMatch(routesSource(), /workspaceAccessRefreshAvailable &&\s*\(availableWorkspaces\.length > 0 \|\| !workspaceCatalogError\)/);
    assert.doesNotMatch(operationsSource(), /workspaceAccessRefreshAvailable &&\s*\(availableWorkspaces\.length > 0 \|\| !workspaceCatalogError\)/);
    assert.match(routesSource(), /workspaceState\.retry && !workspaceAccessRefreshAvailable/);
    assert.match(operationsSource(), /workspaceState\.retry && !workspaceAccessRefreshAvailable/);
  });

  it("revalidates workspace authorization once after a real background epoch", () => {
    const app = appSource();

    assert.match(app, /AppState\.addEventListener\('change'/);
    assert.match(app, /resolveWorkspaceForegroundRevalidation\(\{[\s\S]*backgrounded: workspaceWasBackgroundedRef\.current[\s\S]*catalogBusy: workspaceCatalogBusyRef\.current/);
    assert.match(app, /workspaceWasBackgroundedRef\.current = decision\.backgrounded/);
    assert.match(
      app,
      /nextAppState === 'background'[\s\S]*setWorkspaceForegroundAuthorizationPaused\(true\)/,
    );
    assert.match(app, /if \(!decision\.revalidate\) \{[\s\S]*return;/);
    assert.match(
      app,
      /if \(!workspaceCatalogBusy\) \{[\s\S]*requestWorkspaceForegroundRevalidation\(AppState\.currentState\)/,
    );
    assert.match(
      app,
      /workspaceForegroundRefreshPendingRef\.current = true[\s\S]*restoreUnavailableWorkspacesFromFreshCatalogRef\.current = false[\s\S]*setWorkspaceDiscoveryRevision/,
    );
    assert.match(app, /activeWorkspaceAuthorizationFresh[\s\S]*!workspaceForegroundRefreshPendingRef\.current[\s\S]*!workspaceForegroundAuthorizationPaused/);
    assert.match(
      app,
      /workspaceAuthorizationChecking=\{[\s\S]*workspaceCatalogBusy && !activeWorkspaceAuthorizationFresh/,
    );
    assert.match(
      app,
      /workspaceAuthorizationUnavailable=\{[\s\S]*workspaceForegroundAuthorizationPaused && !workspaceCatalogBusy/,
    );
    assert.match(
      app,
      /recoveryPersistence === 'revoked'[\s\S]*setWorkspaceAccessIssue\('offline-safety'\)[\s\S]*!workspaceWasBackgroundedRef\.current[\s\S]*setWorkspaceForegroundAuthorizationPaused\(false\)/,
    );
    assert.match(app, /workspaceForegroundRefreshPendingRef\.current\) \{[\s\S]*workspaceIds: new Set<string>\(\)/);
    assert.match(
      app,
      /continuesCurrentWorkspaceNavigation[\s\S]*!freshWorkspaceAuthorizationRef\.current\.workspaceIds\.has\(workspaceId\)[\s\S]*!continuesCurrentWorkspaceNavigation/,
    );
    assert.match(
      app,
      /authoritativelyUnavailableWorkspaceIds\.length > 0[\s\S]*Workspace access changed\. Unavailable workspace data was removed\./,
    );
    assert.match(
      app,
      /finally \{[\s\S]*workspaceCatalogBusyRef\.current = false[\s\S]*workspaceForegroundRefreshPendingRef\.current = false/,
    );
  });

  it("clears workspace context at authentication boundaries", () => {
    const app = appSource();
    const clearCount = (app.match(/setActiveWorkspace\(null\)/g) || []).length;

    assert.ok(clearCount >= 4);
    assert.match(app, /handleSignOut[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setActiveWorkspace\(null\)/);
    assert.match(app, /handleSessionExpired[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setActiveWorkspace\(null\)/);
    assert.match(app, /handleSignOut[\s\S]*workspaceRequestRevisionRef\.current \+= 1/);
    assert.match(app, /handleSessionExpired[\s\S]*workspaceRequestRevisionRef\.current \+= 1/);
    assert.match(
      app,
      /if \([\s\S]*!accessToken \|\|[\s\S]*!authenticated \|\|[\s\S]*sessionExpiryHandledRef\.current \|\|[\s\S]*activeSessionTokenRef\.current !== accessToken[\s\S]*\) \{[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setActiveWorkspace\(null\)/,
    );
  });

  it("fails closed on Map and scopes Saved loads to the controlled workspace", () => {
    const guest = guestSource();
    const routes = routesSource();

    assert.match(guest, /workspaceSelectionRequired = authenticated && !routingClientId/);
    assert.match(guest, /workspaceAuthorizationRequired =[\s\S]*authenticated && Boolean\(routingClientId\) && !workspaceAuthorizationFresh/);
    assert.match(guest, /routeActionDisabled =[\s\S]*workspaceAuthorizationRequired/);
    assert.match(guest, /Verify workspace access before plotting this route/);
    assert.match(guest, /Checking workspace access before plotting this route/);
    assert.match(guest, /busy: workspaceAuthorizationRequired && workspaceCatalogLoading/);
    assert.match(
      guest,
      /riskAreaAuthorizationRequired =[\s\S]*workspaceSelectionPending[\s\S]*workspaceSelectionRequired \|\|[\s\S]*workspaceAuthorizationRequired/,
    );
    assert.match(
      guest,
      /!action \|\|[\s\S]*!onlineRef\.current \|\|[\s\S]*!routingClientId \|\|[\s\S]*!routingAccessToken/,
    );
    assert.match(guest, /disabled=\{riskAreaSavePending \|\| riskAreaAuthorizationRequired\}/);
    assert.match(guest, /Verify current workspace access before adding a risk area/);
    assert.match(guest, /routeActionAccessibilityLabel = networkChecking/);
    assert.match(guest, /retryAvailable =[\s\S]*!loading && Boolean\(onRetry && errorMessage\)/);
    assert.match(guest, /Choose the SafeRoute workspace above before plotting this route/);
    assert.match(guest, /routeMessage \|\| sessionNoticeState\?\.message \|\| locationErrorMessage/);
    assert.match(guest, /sessionNoticeState\.accessibilityRole/);
    assert.match(
      guest,
      /enabled:[\s\S]*online &&[\s\S]*!workspaceSelectionPending &&[\s\S]*!workspaceSelectionRequired &&[\s\S]*!workspaceAuthorizationRequired/,
    );
    assert.match(
      guest,
      /if \(!workspaceAuthorizationRequired\) \{[\s\S]*cancelRoadRouteUpgrade\(\)[\s\S]*activeRiskAreaRequestRef\.current\?\.abort\(\)/,
    );
    assert.match(guest, /cancelRoadRouteUpgrade\(\)[\s\S]*activeRiskAreaRequestRef\.current\?\.abort\(\)[\s\S]*setRoutePlan\(null\)/);
    assert.doesNotMatch(guest, /result\.clients\[0\]/);
    assert.match(routes, /selectedClientId = activeWorkspace\?\.id \|\| null/);
    assert.match(routes, /fetchSavedRoutes\([\s\S]*requestWorkspaceId/);
    assert.match(routes, /routesForWorkspace\(result\.routes, requestWorkspaceId\)/);
    assert.match(
      routes,
      /!cachedSnapshot && reviewOnly[\s\S]*loadOfflineRoutesSnapshot\(cacheIdentity, null\)/,
    );
    assert.match(routes, /routeDetail\.clientId !== selectedClientId/);
    assert.match(routes, /activeWorkspaceIdRef\.current === selectedClientId/);
    assert.match(routes, /isWorkspaceUnavailableError\(error\)[\s\S]*recoverUnavailableWorkspace\(requestWorkspaceId\)/);
    assert.match(routes, /isWorkspaceForbiddenError\(error\)[\s\S]*recoverUnavailableWorkspace\(selectedClientId\)/);
    assert.match(
      routes,
      /!workspace \|\|[\s\S]*workspace\.id === selectedClientId[\s\S]*!workspaceSelectionFailed[\s\S]*!workspaceAlternativeSelectionPending[\s\S]*onWorkspaceChange\(workspace\)/,
    );
    assert.match(routes, /workspaceCatalogLoading/);
    assert.match(routes, /Workspaces unavailable/);
    assert.match(routes, /Choose workspace/);
    assert.match(routes, /createRouteListOfflineReviewPresentation/);
    assert.match(routes, /offlineCopyStoredAtMs/);
    assert.match(routes, /No workspace access/);
    assert.doesNotMatch(routes, /setClients\(result\.clients\)/);
    assert.doesNotMatch(operationsSource(), /clients\[0\]|resolveOperationsClientId/);
  });

  it("shares one guarded workspace change with confirmed durable guidance cleanup", () => {
    const app = appSource();
    const guest = guestSource();
    const operations = operationsSource();
    const routes = routesSource();
    const guardedChange = app.slice(
      app.indexOf("const handleGuardedWorkspaceChange ="),
      app.indexOf("const handleWorkspaceUnavailable ="),
    );
    const keepRouteAction = guardedChange.slice(
      guardedChange.indexOf("Keeping ${routeName}"),
      guardedChange.indexOf("style: 'cancel'"),
    );

    assert.match(
      app,
      /handleActiveWorkspaceChange[\s\S]*pendingNavigationRestoreRef\.current \|\|[\s\S]*activeNavigationSessionRef\.current[\s\S]*return/,
    );
    assert.match(app, /navigationWorkspaceLocked = Boolean\([\s\S]*activeNavigationSession \|\| pendingNavigationRestore/);
    assert.match(
      app,
      /handleGuardedWorkspaceChange[\s\S]*Alert\.alert\([\s\S]*End route and change workspace\?[\s\S]*Keep route[\s\S]*End route and change workspace/,
    );
    assert.match(
      app,
      /handleGuardedWorkspaceChange[\s\S]*requestIsCurrentBeforeCleanup\(\)[\s\S]*pendingWorkspaceHandoffRef\.current = handoffRequest[\s\S]*await discardPersistedNavigation\([\s\S]*continuePendingWorkspaceHandoff\(handoffRequest\)/,
    );
    assert.doesNotMatch(
      keepRouteAction,
      /pendingWorkspaceHandoffRef|setPendingWorkspaceHandoffTargetName/,
    );
    assert.match(
      app,
      /requestedSourceWorkspaceId = requestedSource\?\.id \|\| null[\s\S]*requestedSourceName =[\s\S]*requestedRouteWorkspace\?\.name/,
    );
    assert.match(
      app,
      /workspaceHandoffPendingRef\.current = true[\s\S]*setWorkspaceHandoffPending\(true\)[\s\S]*finally \{[\s\S]*continuationStillPending[\s\S]*workspaceHandoffPendingRef\.current = continuationStillPending[\s\S]*setWorkspaceHandoffPending\(continuationStillPending\)/,
    );
    assert.match(
      app,
      /workspaceCleanupLocked =[\s\S]*navigationCleanupStatus !== 'idle' \|\| workspaceHandoffPending/,
    );
    assert.match(
      app,
      /resolvePendingWorkspaceHandoffDecision[\s\S]*resolveWorkspaceHandoffContinuation\(\{[\s\S]*cleanupRequired: navigationCleanupRequiredRef\.current[\s\S]*hasActiveNavigation:[\s\S]*hasPendingNavigation:/,
    );
    assert.match(
      app,
      /requestIsCurrentBeforeCleanup[\s\S]*isCurrentPendingNavigationRestore\([\s\S]*requestedNavigation/,
    );
    assert.match(
      app,
      /handleActiveWorkspaceChange[\s\S]*persistOfflineReviewWorkspaceSelection\([\s\S]*persistedSelection\?\.activeWorkspaceId ===[\s\S]*requestedTargetWorkspaceId[\s\S]*completedRouteHandoff[\s\S]*Route ended\. Workspace changed to \$\{persistedTarget\.name\}\.[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.request/,
    );
    assert.match(
      app,
      /Keeping \$\{routeName\}\. Workspace remains \$\{requestedSourceName\}\.[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.request/,
    );
    assert.match(
      app,
      /continuePendingWorkspaceHandoff[\s\S]*resolvePendingWorkspaceHandoffDecision\(request\)[\s\S]*decision\.status === 'deferred'[\s\S]*clearPendingWorkspaceHandoff\(request\)[\s\S]*Route ended, but the change to \$\{request\.requestedTargetName\} stopped because workspace access changed/,
    );
    assert.match(
      app,
      /continuePendingWorkspaceHandoff[\s\S]*workspaceHandoffPendingRef\.current = false[\s\S]*handleActiveWorkspaceChange\(decision\.target, \{[\s\S]*completedRouteHandoff: true/,
    );
    assert.match(
      app,
      /pendingWorkspaceSelectionRetryRef =[\s\S]*useRef<PendingWorkspaceSelectionRetry \| null>\(null\)/,
    );
    assert.match(
      app,
      /continuePendingWorkspaceHandoff[\s\S]*publishPendingWorkspaceSelectionRetry\(selectionRetry\)[\s\S]*handleActiveWorkspaceChange\(decision\.target, \{[\s\S]*selectionRetry/,
    );
    assert.match(
      app,
      /resolveSelectionRetryFailure[\s\S]*resolveWorkspaceHandoffSelectionFailure\([\s\S]*sourceReconciliationPersisted: reconciliation === 'persisted'/,
    );
    assert.match(
      app,
      /settleFailedPersistence[\s\S]*retryResolution === 'storage-blocked'[\s\S]*publishStorageFailure\(\)[\s\S]*retryResolution === 'retain-retry'[\s\S]*publishSelectionFailure\(\)[\s\S]*retryResolution === 'clear-stale'[\s\S]*clearStaleSelectionRetry\(\)/,
    );
    assert.match(
      app,
      /handleRetryPendingWorkspaceSelection[\s\S]*resolvePendingWorkspaceSelectionRetryDecision\(request\)[\s\S]*handleActiveWorkspaceChange\(decision\.target, \{[\s\S]*selectionRetry: request/,
    );
    const retrySelection = app.slice(
      app.indexOf("const handleRetryPendingWorkspaceSelection ="),
      app.indexOf("const handleKeepCurrentWorkspace ="),
    );
    assert.doesNotMatch(
      retrySelection,
      /discardPersistedNavigation|performPersistedNavigationCleanup|continuePendingWorkspaceHandoff/,
    );
    assert.match(
      app,
      /<WorkspaceHandoffRetryNotice[\s\S]*onChooseAnother=\{handleChooseAnotherWorkspace\}[\s\S]*onKeepCurrent=\{handleKeepCurrentWorkspace\}[\s\S]*onRetry=\{handleRetryPendingWorkspaceSelection\}/,
    );
    assert.match(
      app,
      /pendingWorkspaceSelectionRetryNoticeDecision[\s\S]*resolveWorkspaceHandoffContinuation\([\s\S]*workspaceHandoffRetryCheckingAccess = Boolean\([\s\S]*status === 'deferred'[\s\S]*status === 'stale'[\s\S]*workspaceCatalogLoading[\s\S]*workspaceCatalogRetrying[\s\S]*workspaceForegroundAuthorizationPaused/,
    );
    assert.match(
      app,
      /workspaceHandoffRetrySourceName =[\s\S]*activeWorkspace\.id ===[\s\S]*requestedSourceWorkspaceId[\s\S]*findWorkspace\([\s\S]*requestedSourceWorkspaceId[\s\S]*requestedSourceWorkspaceName/,
    );
    assert.match(
      app,
      /liveWorkspaceHandoffRetryTarget =[\s\S]*pendingWorkspaceSelectionRetryNoticeDecision\?\.target[\s\S]*findWorkspace\([\s\S]*requestedTargetWorkspaceId[\s\S]*workspaceHandoffTargetDisplayNameRef\.current = \{[\s\S]*workspaceHandoffRetryTargetName =[\s\S]*liveWorkspaceHandoffRetryTarget\?\.name[\s\S]*workspaceHandoffTargetDisplayNameRef\.current\.name[\s\S]*requestedTargetName/,
    );
    assert.match(
      app,
      /<WorkspaceHandoffRetryNotice[\s\S]*checkingAccess=\{workspaceHandoffRetryCheckingAccess\}[\s\S]*sourceWorkspaceName=\{workspaceHandoffRetrySourceName\}[\s\S]*targetWorkspaceName=\{workspaceHandoffRetryTargetName\}/,
    );
    assert.match(
      app,
      /decision\.status === 'stale'[\s\S]*retainWorkspaceHandoffForAlternativeSelection\(request\)[\s\S]*clearPendingWorkspaceSelectionRetry\(request\)[\s\S]*Workspace context changed before the retry\.[\s\S]*workspaceAccessFocusTargetRef\.current/,
    );
    const chooseAnotherStart = app.indexOf(
      "const handleChooseAnotherWorkspace =",
    );
    const chooseAnother = app.slice(
      chooseAnotherStart,
      app.indexOf("useEffect(() =>", chooseAnotherStart),
    );
    assert.match(
      chooseAnother,
      /workspaceHandoffAlternativeSelectionPendingRef\.current = true[\s\S]*setWorkspaceHandoffAlternativeSelectionPending\(true\)[\s\S]*setWorkspaceSelectionStatus\('idle'\)[\s\S]*selectorReady[\s\S]*workspaceHandoffAlternativeFocusPendingRef\.current = !selectorReady[\s\S]*access check finishes[\s\S]*Platform\.OS === 'ios' && selectorReady[\s\S]*workspaceAccessFocusTargetRef\.current/,
    );
    assert.doesNotMatch(
      chooseAnother,
      /clearPendingWorkspaceSelectionRetry|discardPersistedNavigation|performPersistedNavigationCleanup/,
    );
    assert.match(
      app,
      /workspaceHandoffAlternativeFocusPendingRef\.current[\s\S]*workspaceHandoffAlternativeSelectionPending[\s\S]*workspaceCatalogBusyRef\.current[\s\S]*workspaceForegroundRefreshPendingRef\.current[\s\S]*workspaceHandoffAlternativeFocusPendingRef\.current = false[\s\S]*Choose another workspace\.[\s\S]*workspaceAccessFocusTargetRef\.current/,
    );
    const retargetSelection = app.slice(
      app.indexOf("const handleGuardedWorkspaceChange ="),
      app.indexOf("const handleWorkspaceUnavailable ="),
    );
    assert.match(
      retargetSelection,
      /pendingWorkspaceSelectionRetryRef\.current[\s\S]*resolvePendingWorkspaceSelectionRetargetDecision\([\s\S]*retargetDecision\.status === 'keep-current'[\s\S]*handleKeepCurrentWorkspace\(\)[\s\S]*replaceWorkspaceHandoffTarget\(\{[\s\S]*target: retargetDecision\.target[\s\S]*publishPendingWorkspaceSelectionRetry\(replacementRetry\)[\s\S]*completedRouteHandoff: true[\s\S]*selectionRetry: replacementRetry/,
    );
    assert.match(
      app,
      /surfaceWorkspaceSelectionFailed =[\s\S]*workspaceSelectionFailed && !workspaceHandoffSelectionNoticeVisible/,
    );
    assert.match(
      app,
      /directContinuation =[\s\S]*resolvePendingWorkspaceSelectionRetryDecision\(request\)[\s\S]*workspaceHandoffAlternativeSelectionPendingRef\.current[\s\S]*resolvePendingWorkspaceSelectionRetargetOwnershipDecision\(request\)[\s\S]*alternativeRecovery !== 'clear-stale'[\s\S]*continuationStatus = 'stale'[\s\S]*continuationStatus !== 'stale'[\s\S]*retainWorkspaceHandoffForAlternativeSelection\(request\)[\s\S]*clearPendingWorkspaceSelectionRetry\(request\)/,
    );
    assert.match(
      app,
      /publishUnavailableSelectionFailure[\s\S]*unavailableWorkspaceIdsRef\.current\.has\([\s\S]*requestedTargetWorkspaceId[\s\S]*!findWorkspace\([\s\S]*retainWorkspaceHandoffForAlternativeSelection\(selectionRetry, \{[\s\S]*currentSelectionOwnsPending: true[\s\S]*Workspace context changed before the change completed\.[\s\S]*retryResolution === 'clear-stale'[\s\S]*publishUnavailableSelectionFailure/,
    );
    assert.match(
      app,
      /retainWorkspaceHandoffForAlternativeSelection[\s\S]*resolvePendingWorkspaceSelectionTargetRemovalRecovery[\s\S]*recovery !== 'choose-alternative'[\s\S]*workspaceHandoffAlternativeSelectionPendingRef\.current = true[\s\S]*removedTargetName[\s\S]*workspaceHandoffTargetDisplayNameRef\.current\.name[\s\S]*request\.requestedTargetName[\s\S]*is no longer available\.[\s\S]*Choose another workspace\./,
    );
    const targetRemovalRecovery = app.slice(
      app.indexOf(
        "const retainWorkspaceHandoffForAlternativeSelection =",
      ),
      app.indexOf(
        "const handleRetryPendingWorkspaceSelection =",
      ),
    );
    assert.match(
      targetRemovalRecovery,
      /recovery !== 'choose-alternative'[\s\S]*return recovery[\s\S]*workspaceHandoffAlternativeSelectionPendingRef\.current = true/,
    );
    assert.match(
      app,
      /targetRemovalRecovery === 'choose-alternative'[\s\S]*selectionStatus = 'idle'[\s\S]*targetRemovalRecovery === 'deferred'[\s\S]*selectionStatus = 'failed'[\s\S]*clearStaleSelectionRetry\(\)/,
    );
    assert.match(
      app,
      /retainWorkspaceHandoffForAlternativeSelection\(request\) !== 'clear-stale'[\s\S]*activeNavigationSession,[\s\S]*navigationCleanupStatus,[\s\S]*workspaceCatalogLoading,[\s\S]*workspaceCatalogRetrying,[\s\S]*workspaceForegroundAuthorizationPaused,[\s\S]*workspaceHandoffAlternativeSelectionPending/,
    );
    assert.match(
      app,
      /workspaceHandoffAlternativeFocusedScreenRef[\s\S]*selectorIsVisible =[\s\S]*screen === 'guest-map'[\s\S]*screen === 'routes'[\s\S]*screen === 'operations'[\s\S]*workspaceHandoffAlternativeFocusedScreenRef\.current !== screen[\s\S]*workspaceHandoffAlternativeFocusPendingRef\.current = true[\s\S]*workspaceHandoffAlternativeFocusedScreenRef\.current = screen[\s\S]*workspaceAccessFocusHandoffRef\.current\?\.request/,
    );
    assert.equal(
      (
        app.match(
          /workspaceHandoffAlternativeFocusedScreenRef\.current =[\s\S]{0,80}currentScreenRef\.current/g,
        ) || []
      ).length,
      2,
    );
    assert.match(
      app,
      /workspaceHandoffSelectionNoticeVisible = Boolean\([\s\S]*!workspaceHandoffAlternativeSelectionPending/,
    );
    assert.doesNotMatch(
      retargetSelection.slice(
        0,
        retargetSelection.indexOf("const requestedTarget ="),
      ),
      /discardPersistedNavigation|performPersistedNavigationCleanup|continuePendingWorkspaceHandoff/,
    );
    assert.match(
      app,
      /workspaceHandoffAlternativePrompt =[\s\S]*workspaceHandoffAlternativePromptRef\.current[\s\S]*surfaceSessionMessage = workspaceHandoffSelectionNoticeVisible[\s\S]*workspaceHandoffAlternativePrompt \|\| sessionMessage[\s\S]*routeListSessionNotice = workspaceHandoffSelectionNoticeVisible[\s\S]*workspaceHandoffAlternativePrompt[\s\S]*sessionNotice=\{routeListSessionNotice\}[\s\S]*sessionNotice=\{session && isPreviewAccessToken\(session\.accessToken\)[\s\S]*surfaceSessionMessage/,
    );
    assert.doesNotMatch(
      app,
      /type PendingWorkspaceHandoff = \{[\s\S]{0,240}phase:/,
    );
    assert.match(
      app,
      /handleRetryNavigationCleanup[\s\S]*retainedHandoff\?\.evidenceSession \|\| null[\s\S]*Retry cleanup to finish changing to \$\{retainedDecision\.target\.name\}[\s\S]*continuePendingWorkspaceHandoff\(retainedHandoff\)/,
    );
    assert.match(
      app,
      /pendingWorkspaceHandoffRef\.current[\s\S]*workspaceCatalogRefreshDeferredRef\.current = true/,
    );
    assert.match(
      app,
      /resolveDeferredWorkspaceRefreshAfterSelection\(\{[\s\S]*requestOwnerIsCurrent: requestStillOwnsSelection[\s\S]*deferredRefreshResolution === 'resume'[\s\S]*resumeDeferredWorkspaceCatalogRefresh\(\)/,
    );
    assert.match(
      app,
      /useEffect\(\(\) => \{[\s\S]*pendingWorkspaceHandoffRef\.current[\s\S]*continuePendingWorkspaceHandoff\(pendingHandoff\)/,
    );
    assert.match(
      app,
      /pendingWorkspaceHandoffRef = useRef<PendingWorkspaceHandoff \| null>\(null\)/,
    );
    assert.ok(
      (
        app.match(/clearPendingWorkspaceHandoff\(undefined, \{[\s\S]{0,100}discardDeferredCatalogRefresh: true[\s\S]{0,120}workspaceHandoffPendingRef\.current = false/g) ||
        []
      ).length >= 3,
    );
    assert.match(
      app,
      /<GuestMapScreen[\s\S]*onWorkspaceChange=\{handleGuardedWorkspaceChange\}[\s\S]*workspaceChangeEndsNavigation=\{navigationWorkspaceLocked\}[\s\S]*workspaceSwitchDisabled=\{workspaceCleanupLocked\}/,
    );
    assert.equal(
      (
        app.match(
          /onWorkspaceChange=\{handleGuardedWorkspaceChange\}/g,
        ) || []
      ).length,
      3,
    );
    assert.equal(
      (
        app.match(
          /workspaceChangeEndsNavigation=\{navigationWorkspaceLocked\}/g,
        ) || []
      ).length,
      3,
    );
    assert.equal(
      (
        app.match(/workspaceSwitchDisabled=\{workspaceCleanupLocked\}/g) || []
      ).length,
      3,
    );
    assert.equal(
      (app.match(/workspaceSwitchFailure=\{workspaceCleanupFailed\}/g) || [])
        .length,
      3,
    );
    assert.equal(
      (
        app.match(
          /workspaceAlternativeSelectionPending=\{[\s\S]{0,100}workspaceHandoffAlternativeSelectionPending[\s\S]{0,20}\}/g,
        ) || []
      ).length,
      3,
    );
    assert.match(
      guest,
      /Choosing another workspace asks before ending active guidance/,
    );
    assert.match(guest, /Finishing…/);
    assert.match(guest, /Cleanup needed/);
    assert.match(guest, /Finish guidance cleanup before changing workspace/);
    assert.match(
      guest,
      /Retry guidance cleanup before changing workspace/,
    );
    for (const surface of [routeFiltersSource(), operations]) {
      assert.match(
        surface,
        /Choosing another workspace asks before ending active guidance/,
      );
      assert.match(surface, /Finishing…/);
      assert.match(surface, /Cleanup needed/);
      assert.match(
        surface,
        /Finish guidance cleanup before changing workspace/,
      );
      assert.match(
        surface,
        /Retry guidance cleanup before changing workspace/,
      );
    }
    assert.match(
      guest,
      /handleWorkspaceChange[\s\S]*setWorkspaceMenuOpen\(false\)[\s\S]*onWorkspaceChange\?\.\(workspace\)/,
    );
    assert.doesNotMatch(
      guest.slice(
        guest.indexOf("const handleWorkspaceChange ="),
        guest.indexOf("const handlePlotRoute ="),
      ),
      /clearWorkspaceScopedMapState/,
    );
    assert.match(
      routes,
      /previousSelectedClientIdRef[\s\S]*detailRevisionRef\.current \+= 1[\s\S]*setRoutes\(\[\]\)[\s\S]*setQuery\(""\)/,
    );
    assert.match(
      operations,
      /previousSelectedWorkspaceIdRef[\s\S]*setLoadedWorkspaceId\(null\)[\s\S]*setOfflineCalendarEntries\(\[\]\)/,
    );
    assert.match(
      app,
      /workspaceHandoffPendingRef\.current[\s\S]*Finish saved-guidance cleanup before starting another route/,
    );
    assert.match(
      app,
      /<NavigationCleanupNotice[\s\S]*workspaceName=\{workspaceHandoffNoticeTargetName\}/,
    );
    assert.match(
      app,
      /onLayoutHeight=\{setSuspendedNavigationNoticeHeight\}/,
    );
    assert.equal(
      (
        app.match(/suspendedNavigationNoticeHeight \+ spacing\.sm/g) || []
      ).length,
      3,
    );
    assert.match(
      guest,
      /workspaceNavigationNoticeInset > 0[\s\S]*marginTop: workspaceNavigationNoticeInset/,
    );
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
        /activeNavigationSession[\s\S]*!isNavigationSessionForRoutePreview\(\{[\s\S]*navigationSession: activeNavigationSession[\s\S]*routePlan[\s\S]*discardPersistedNavigation\([\s\S]*return;/,
      );
      assert.doesNotMatch(
        routeOpen,
        /activeNavigationSession\.routePlan\.route\.id\s*[!=]==?\s*routePlan\.route\.id/,
      );
      const cleanupIndex = routeOpen.indexOf("void discardPersistedNavigation(");
      const publishIndex = routeOpen.indexOf("setSelectedRoute(routePlan)");
      assert.ok(cleanupIndex >= 0);
      assert.ok(publishIndex > cleanupIndex);
    }
  });

  it("uses immutable plan identity for App and LiveMap route resume decisions", () => {
    const app = appSource();
    const liveMap = readFileSync("src/features/live-map/LiveMapScreen.tsx", "utf8");
    const guestMap = guestSource();

    assert.match(
      guestMap,
      /const routePlanId = createGuestRoutePlanId\(\);[\s\S]*createGuestRoutePlan\(\{[\s\S]*planId: routePlanId/,
    );
    assert.match(
      guestMap,
      /createGuestRoadSnappedRoutePlan\(\{[\s\S]*planId: localRoutePlan\.id/,
    );
    assert.match(
      app,
      /initialNavigationSession=\{[\s\S]*isNavigationSessionForRoutePreview\(\{[\s\S]*routeContext: routePreviewSource[\s\S]*routePlan: selectedRoute/,
    );
    assert.equal(
      (
        liveMap.match(/isNavigationSessionForRoutePreview\(\{/g) || []
      ).length,
      2,
    );
    assert.doesNotMatch(
      liveMap,
      /initialNavigationSession\?\.routePlan\.route\.id\s*===\s*routePlan\.route\.id/,
    );
  });

  it("keeps cached workspaces browse-only until a fresh catalog authorizes guidance", () => {
    const app = appSource();
    const guest = guestSource();
    const openRoutePreview = app.slice(
      app.indexOf('const openRoutePreview ='),
      app.indexOf('const handleSelectSavedRoute ='),
    );
    const handleSelectSavedRoute = app.slice(
      app.indexOf('const handleSelectSavedRoute ='),
      app.indexOf('const returnFromRoutePreview ='),
    );
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
    assert.doesNotMatch(openRoutePreview, /freshWorkspaceAuthorizationRef/);
    assert.doesNotMatch(handleSelectSavedRoute, /freshWorkspaceAuthorizationRef/);
    assert.match(
      app,
      /handleAuthorizeNavigationStart[\s\S]*authorizeWorkspaceNavigationStart\([\s\S]*loadCurrentPrincipalId[\s\S]*loadWorkspaceCatalog/,
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
      /handleAuthorizeNavigationStart[\s\S]*workspaceForegroundAuthorizationPausedRef\.current[\s\S]*workspaceAuthorizationEpoch: workspaceForegroundAuthorizationEpochRef\.current[\s\S]*request\.workspaceAuthorizationEpoch ===[\s\S]*workspaceForegroundAuthorizationEpochRef\.current/,
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
    assert.match(
      liveMap,
      /workspaceStartBlockedReason[\s\S]*Workspace access is being checked\. Wait before starting guidance\.[\s\S]*navigationBlockedReason/,
    );
    assert.match(
      liveMap,
      /if \(routePlan\.clientId && !workspaceAuthorizationFreshRef\.current\)[\s\S]*return;[\s\S]*runNavigationStartAuthorization/,
    );
  });

  it("defers persisted workspace guidance until the fresh catalog authorizes it", () => {
    const app = appSource();
    const guest = guestSource();
    const liveMap = readFileSync("src/features/live-map/LiveMapScreen.tsx", "utf8");

    assert.match(app, /pendingNavigationRestoreRef = useRef<ActiveNavigationSession \| null>\(null\)/);
    assert.match(app, /entryTrackingVerification[\s\S]*confirmBackgroundNavigationStopped\(\)[\s\S]*await stopBackgroundNavigation\(\);[\s\S]*recoverOfflineOperationsPrincipalCleanup\([\s\S]*operationsCleanup\.status !== 'clean'[\s\S]*return;[\s\S]*readActiveNavigationSession\(\);[\s\S]*recordNavigationAbsenceReadback\(entryTrackingVerification\);[\s\S]*const storedSession = await loadAuthSession\(\)/);
    const restoreCatch = app.slice(
      app.indexOf(
        "} catch {\n        if (!restoreIsCurrent())",
        app.indexOf("const restoreSession = async"),
      ),
      app.indexOf("} finally {", app.indexOf("const restoreSession = async")),
    );
    assert.match(
      restoreCatch,
      /setSession\(null\)[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setNetworkAuthorizationReady\(false\)[\s\S]*setScreen\('login'\)/,
    );
    assert.doesNotMatch(
      restoreCatch,
      /openActiveNavigationSession|tryActivateOfflineOperationsPrincipal/,
    );
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
    assert.match(
      app,
      /performPersistedNavigationCleanup[\s\S]*const clearPersistedNavigation[\s\S]*clearActiveNavigationSession\(\)[\s\S]*Promise\.allSettled\(\[[\s\S]*stopBackgroundNavigation\(\),[\s\S]*clearPersistedNavigation\(\)/,
    );
    assert.match(app, /navigationCleanupRequiredRef = useRef\(false\)/);
    assert.match(
      app,
      /performPersistedNavigationCleanup[\s\S]*cleanup\[1\]\.value\.cleared/,
    );
    assert.match(app, /confirmBackgroundNavigationStopped/);
    assert.match(
      app,
      /recordNavigationAbsenceReadback[\s\S]*cold-start-readback[\s\S]*activeNavigation: 'absent'[\s\S]*runtimePermit: entryTrackingVerification\.runtimePermit[\s\S]*navigation\.absence\.readback/,
    );
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
    assert.match(guest, /retryAvailable =[\s\S]*!sharedRetryAvailable &&[\s\S]*!loading && Boolean\(onRetry && errorMessage\)[\s\S]*catalogUnavailable \|\| switchDisabled/);
    assert.match(guest, /disabled = retryAvailable[\s\S]*\? false[\s\S]*switchDisabled/);
    assert.match(guest, /onPress=\{retryAvailable \? onRetry : onToggle\}/);
    assert.match(liveMap, /accepted === false[\s\S]*clearActiveNavigationSession\(\)[\s\S]*return[\s\S]*saveActiveNavigationSession/);
    assert.match(app, /stagePendingNavigationRestore\(persistedNavigation\)/);
    assert.match(app, /pendingNavigationRestoreRef\.current[\s\S]*setPendingNavigationRestoreStatus\('paused'\)/);
    assert.match(app, /SuspendedNavigationNotice[\s\S]*onRetry=\{handleRetryWorkspaceCatalog\}/);
    assert.match(
      app,
      /handleEndSuspendedNavigation[\s\S]*await discardPersistedNavigation\(undefined, \{[\s\S]*publishCleanupFailure: false[\s\S]*setSessionMessage\('Suspended route ended\.'\)/,
    );
    assert.match(
      app,
      /const pendingNavigationForAuthorization = pendingNavigationRestoreRef\.current[\s\S]*resolvePendingNavigationRestore\(\{[\s\S]*candidate: pendingNavigationForAuthorization,[\s\S]*current: pendingNavigationRestoreRef\.current,[\s\S]*pendingNavigationWorkspace &&[\s\S]*pendingNavigationResolution === 'resume'/,
    );
    assert.match(
      app,
      /pendingNavigationForAuthorization\?\.accessScope\.kind === 'workspace'[\s\S]*isCurrentPendingNavigationRestore\([\s\S]*pendingNavigationRestoreRef\.current,[\s\S]*pendingNavigationForAuthorization,[\s\S]*currentPrincipalId !== pendingNavigationForAuthorization\.accessScope\.principalId/,
    );
    assert.match(
      app,
      /navigationRestoreRejected =[\s\S]*pendingNavigationResolution === 'stale'[\s\S]*!navigationRestoreRejected[\s\S]*Workspace access verified/,
    );
    assert.match(
      app,
      /resolveNetworkReconnectTransition\(\{[\s\S]*current: networkStatus,[\s\S]*offlineObserved:[\s\S]*previous,[\s\S]*pendingNavigationRestore\?\.status === 'paused'[\s\S]*handleNetworkReconnectWorkspaceCatalog\(\)/,
    );
  });

  it("records redacted Calendar cleanup evidence at failure, Retry, and cold absence boundaries", () => {
    const app = appSource();
    const evidence = readFileSync(
      "src/testing/offlineCalendarCleanupContractEvidence.ts",
      "utf8",
    );

    assert.match(
      app,
      /purgeOfflineOperationsPrincipalAtTerminalBoundary\([\s\S]*operationsCleanupNeedsRetry[\s\S]*recordOfflineCalendarCleanupContractEvidence\([\s\S]*'inactive-account'[\s\S]*'retry-required'/,
    );
    assert.match(
      app,
      /recoverOfflineOperationsPrincipalCleanup\([\s\S]*operationsCleanup\.status !== 'clean'[\s\S]*recordOfflineCalendarCleanupContractEvidence\([\s\S]*'startup-terminal-replay'[\s\S]*'retry-required'/,
    );
    assert.match(
      app,
      /handleRetryOfflineCalendarCleanup[\s\S]*ensureSignedOutOfflineOperationsCalendarRemoved\(\)[\s\S]*recordOfflineCalendarCleanupContractEvidence\([\s\S]*'cleanup-retry'[\s\S]*'clean'[\s\S]*setOfflineCalendarCleanupStatus\('idle'\)/,
    );
    assert.match(
      app,
      /ensureSignedOutOfflineOperationsCalendarRemoved\(\)[\s\S]*signedOutCalendarRemoved[\s\S]*recordOfflineCalendarCleanupContractEvidence\([\s\S]*'signed-out-boot'[\s\S]*'clean'/,
    );
    assert.match(
      evidence,
      /SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED[\s\S]*SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED/,
    );
    assert.match(
      evidence,
      /navigationInstanceId: null[\s\S]*routeId: null[\s\S]*unavailableWorkspaceIds: \[\][\s\S]*workspaceId: null/,
    );
    assert.doesNotMatch(
      evidence,
      /accessToken|authorizationHeader|email/,
    );
  });

  it("injects a source-bound handoff target fault only before the owned target write", () => {
    const app = appSource();
    const selectionStart = app.indexOf(
      "const handleActiveWorkspaceChange = useCallback",
    );
    const durableAttempt = app.indexOf(
      "runDurableWorkspaceSelectionAttempt({",
      selectionStart,
    );
    const faultResolverStart = app.indexOf(
      "const targetSelectionFaultRequestIsCurrent",
      selectionStart,
    );
    const faultResolverEnd = app.indexOf(
      "const settleFailedPersistence",
      faultResolverStart,
    );
    const hookIndex = app.indexOf(
      "shouldInjectConnectivityContractStorageFault(",
      durableAttempt,
    );
    const targetWriteIndex = app.indexOf(
      "return persistOfflineReviewWorkspaceSelection(",
      hookIndex,
    );
    const reconcileIndex = app.indexOf(
      "reconcileSource: reconcileVisibleSelection",
      targetWriteIndex,
    );
    const faultResolverSlice = app.slice(
      faultResolverStart,
      faultResolverEnd,
    );
    const hookSlice = app.slice(durableAttempt, targetWriteIndex);

    assert.ok(selectionStart >= 0);
    assert.ok(faultResolverStart > selectionStart);
    assert.ok(faultResolverEnd > faultResolverStart);
    assert.ok(durableAttempt > selectionStart);
    assert.ok(hookIndex > durableAttempt);
    assert.ok(targetWriteIndex > hookIndex);
    assert.ok(reconcileIndex > targetWriteIndex);
    assert.match(
      faultResolverSlice,
      /canRequestWorkspaceHandoffTargetSelectionFault\(\{[\s\S]*completedRouteHandoff[\s\S]*SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED[\s\S]*requestOwnerIsCurrent\(\)[\s\S]*selectionRetryIsCurrent\(\)[\s\S]*resolveCurrentTarget\(\)/,
    );
    assert.match(
      hookSlice,
      /selectionRetry && targetSelectionFaultRequestIsCurrent\(\)[\s\S]*await shouldInjectConnectivityContractStorageFault\([\s\S]*workspace-handoff-target-selection-set[\s\S]*!targetSelectionFaultRequestIsCurrent\(\)[\s\S]*return null/,
    );
    assert.doesNotMatch(
      readFileSync(
        "src/features/workspaces/offlineWorkspaceCache.ts",
        "utf8",
      ),
      /workspace-handoff-target-selection-set/,
    );
  });

  it("injects a source-bound cleanup fault only for the exact retained handoff", () => {
    const app = appSource();
    const cleanupStart = app.indexOf(
      "const performPersistedNavigationCleanup =",
    );
    const cleanupEnd = app.indexOf(
      "const discardPersistedNavigation =",
      cleanupStart,
    );
    const cleanup = app.slice(cleanupStart, cleanupEnd);
    const retryStart = app.indexOf(
      "const handleRetryNavigationCleanup =",
    );
    const retryEnd = app.indexOf(
      "const handleRetryOfflineCalendarCleanup =",
      retryStart,
    );
    const retry = app.slice(retryStart, retryEnd);
    const guardedStart = app.indexOf(
      "const handleGuardedWorkspaceChange =",
    );
    const guardedEnd = app.indexOf(
      "const handleWorkspaceUnavailable =",
      guardedStart,
    );
    const guarded = app.slice(guardedStart, guardedEnd);

    assert.match(
      cleanup,
      /canRequestWorkspaceHandoffNavigationCleanupFault\(\{[\s\S]*evidenceSessionIsCurrent:[\s\S]*SAFEROUTE_STORAGE_FAULT_CONTRACT_ENABLED[\s\S]*workspaceHandoffPendingRef\.current[\s\S]*!pendingNavigationRestoreRef\.current[\s\S]*!activeNavigationSessionRef\.current[\s\S]*pendingWorkspaceHandoffRef\.current ===[\s\S]*workspaceHandoffFaultRequest[\s\S]*requestedPrincipalId[\s\S]*requestedSessionEpoch[\s\S]*requestedSourceWorkspaceId[\s\S]*targetIsCurrent/,
    );
    assert.match(
      cleanup,
      /shouldInjectWorkspaceHandoffNavigationCleanupFault\(\{[\s\S]*workspace-handoff-navigation-cleanup-set[\s\S]*workspaceHandoffCleanupFaultRequestIsCurrent/,
    );
    assert.match(
      cleanup,
      /if \(injectWorkspaceHandoffCleanupFault\) \{[\s\S]*cleared: false[\s\S]*workspaceHandoffFaultInjected: true[\s\S]*cleared: await clearActiveNavigationSession\(\)[\s\S]*workspaceHandoffFaultInjected: false/,
    );
    assert.match(
      cleanup,
      /Promise\.allSettled\(\[[\s\S]*stopBackgroundNavigation\(\),[\s\S]*clearPersistedNavigation\(\)/,
    );
    assert.match(
      cleanup,
      /Promise\.allSettled\(\[[\s\S]*clearPersistedNavigation\(\),[\s\S]*\.then\(async \(cleanup\)[\s\S]*workspaceHandoffFaultInjected[\s\S]*recoverWorkspaceHandoffNavigationCleanupAfterOwnershipLoss\(\{[\s\S]*clearNavigation: clearActiveNavigationSession[\s\S]*workspaceHandoffCleanupFaultRequestIsCurrent/,
    );
    assert.match(
      guarded,
      /discardPersistedNavigation\(undefined, \{[\s\S]*evidenceSession: requestedNavigation[\s\S]*publishCleanupFailure: false[\s\S]*workspaceHandoffFaultRequest: handoffRequest/,
    );
    assert.match(
      retry,
      /performPersistedNavigationCleanup\([\s\S]*retainedHandoff\?\.evidenceSession \|\| null[\s\S]*workspaceHandoffFaultRequest: retainedHandoff/,
    );
    assert.doesNotMatch(
      retry,
      /workspace-handoff-navigation-cleanup-set/,
    );
    assert.equal(
      (
        app.match(/'workspace-handoff-navigation-cleanup-set'/g) ||
        []
      ).length,
      1,
    );
    assert.doesNotMatch(
      readFileSync(
        "src/features/live-map/activeNavigationSession.ts",
        "utf8",
      ),
      /workspace-handoff-navigation-cleanup-set|ConnectivityContractStorageFault/,
    );
  });

  it("records exact workspace-denial Calendar absence without mutating saving preferences", () => {
    const app = appSource();
    const evidence = readFileSync(
      "src/testing/offlineCalendarCleanupContractEvidence.ts",
      "utf8",
    );
    const cache = readFileSync(
      "src/features/operations/offlineOperationsCache.ts",
      "utf8",
    );

    assert.match(
      app,
      /networkStatus === 'offline' && cachedContext[\s\S]*workspace-denial-relaunch[\s\S]*cachedContext\.unavailableWorkspaceIds/,
    );
    assert.match(
      app,
      /result === 'persisted'[\s\S]*authoritativeCatalogObserved[\s\S]*workspace-denial[\s\S]*unavailableWorkspaceIds/,
    );
    assert.match(
      app,
      /if \(!freshCatalog\) \{[\s\S]*setNetworkAuthorizationReady\(false\)[\s\S]*setWorkspaceDiscoveryRevision/,
    );
    assert.match(
      evidence,
      /SAFEROUTE_CONNECTIVITY_CONTRACT_ENABLED[\s\S]*SAFEROUTE_GUIDANCE_CONTRACT_EVIDENCE_ENABLED/,
    );
    assert.match(
      evidence,
      /CONTRACT_CALENDAR_WORKSPACE_ID[\s\S]*CONTRACT_PREFERENCE_WORKSPACE_ID[\s\S]*offline\.calendar\.workspace-lifecycle/,
    );
    assert.match(
      evidence,
      /offlineCalendarPayload: calendar\.payload[\s\S]*offlineCalendarPreference: calendar\.preference[\s\S]*offlineCalendarSlot: calendar\.slot[\s\S]*workspaceContext: "persisted"/,
    );
    assert.match(
      operationsSource(),
      /saveOfflineOperationsSnapshotIfAllowed[\s\S]*recordOfflineCalendarWorkspaceSeedContractEvidence/,
    );
    assert.match(
      cache,
      /clearOfflineOperationsWorkspace[\s\S]*operationsStorage\.clearWorkspace/,
    );
    assert.doesNotMatch(
      cache,
      /clearOfflineOperationsWorkspace[\s\S]{0,500}setOfflineOperationsPreference/,
    );
    assert.doesNotMatch(
      evidence,
      /accessToken|authorizationHeader|calendarRaw|preferenceRaw/,
    );
  });

  it("fails closed on saved-principal replacement before any replacement session is installed", () => {
    const app = appSource();
    const evidence = readFileSync(
      "src/testing/offlineCalendarCleanupContractEvidence.ts",
      "utf8",
    );
    const expiredBranch = app.slice(
      app.indexOf("if (restoreResult.status === 'expired')"),
      app.indexOf("} else if (restoreResult.status === 'restored'"),
    );

    assert.match(
      expiredBranch,
      /purgeOfflineOperationsPrincipalAtTerminalBoundary\([\s\S]*restoreResult\.reason === 'principal-changed'[\s\S]*recordOfflineCalendarPrincipalChangeContractEvidence\([\s\S]*'principal-change'[\s\S]*discardPersistedNavigation[\s\S]*setSession\(null\)[\s\S]*setScreen\('login'\)/,
    );
    assert.match(
      expiredBranch,
      /restoreResult\.reason === 'principal-changed' \|\|[\s\S]*!enablePreviewSession\(\)/,
    );
    assert.doesNotMatch(
      expiredBranch,
      /tryActivateOfflineOperationsPrincipal|saveAuthSession|setSession\(restoreResult\.session\)/,
    );
    assert.match(
      app,
      /principal-change-relaunch-revoked[\s\S]*ensureSignedOutOfflineOperationsCalendarRemoved\(\)[\s\S]*principal-change-relaunch/,
    );
    assert.match(
      evidence,
      /offlineCalendarPayload: calendar\.payload[\s\S]*offlineCalendarPreference: calendar\.preference[\s\S]*offlineCalendarSlot: calendar\.slot[\s\S]*routeCache,[\s\S]*workspaceContext,[\s\S]*offline\.calendar\.principal-lifecycle/,
    );
    assert.match(
      evidence,
      /CONTRACT_ROUTE_ID[\s\S]*activeWorkspaceId: CONTRACT_CALENDAR_WORKSPACE_ID[\s\S]*CONTRACT_PREFERENCE_WORKSPACE_ID/,
    );
    assert.doesNotMatch(
      evidence,
      /accessToken|authorizationHeader|calendarRaw|preferenceRaw/,
    );
  });

  it("does not activate principal-scoped storage when online saved-session validation is unavailable", () => {
    const app = appSource();
    const unavailableBranch = app.slice(
      app.indexOf("if (restoreResult.status === 'validation-unavailable')"),
      app.indexOf("if (restoreResult.status === 'expired')"),
    );

    assert.match(
      unavailableBranch,
      /!storedSession\.onlineValidationRequired[\s\S]*requireOnlineAuthSessionValidation\(storedSession\)[\s\S]*quarantineResult === 'stale'[\s\S]*clearAuthSessionIfCurrent\(storedSession\)[\s\S]*clearResult === 'stale'[\s\S]*setSavedSessionValidationRetryAvailable\(true\)[\s\S]*setSession\(null\)[\s\S]*setAvailableWorkspaces\(\[\]\)[\s\S]*setWorkspaceAccessIssue\('verification-unavailable'\)[\s\S]*setNetworkAuthorizationReady\(false\)[\s\S]*setScreen\('login'\)/,
    );
    assert.match(
      unavailableBranch,
      /recordOfflineCalendarPrincipalChangeContractEvidence\([\s\S]*principal-change-validation-offline-relaunch[\s\S]*principal-change-validation-unavailable/,
    );
    assert.doesNotMatch(
      unavailableBranch,
      /tryActivateOfflineOperationsPrincipal|saveAuthSession|setSession\(restoreResult\.session\)|openActiveNavigationSession/,
    );
    assert.match(
      app,
      /restoreNetworkStatus === 'online'[\s\S]*restoreResult\.status === 'validation-unavailable'/,
    );
  });

  it("invalidates a saved-session restore before fresh authentication can install another principal", () => {
    const app = appSource();
    const restoreFlow = app.slice(
      app.indexOf('useEffect(() => {', app.indexOf('sessionRestoreNetworkStatus')),
      app.indexOf('const handleRetrySavedSessionValidation'),
    );

    assert.match(
      restoreFlow,
      /const restoreGeneration = \+\+sessionRestoreGenerationRef\.current[\s\S]*restoreIsCurrent[\s\S]*restoreSavedSession\([\s\S]*if \(!restoreIsCurrent\(\)\) \{[\s\S]*return;/,
    );
    assert.match(
      restoreFlow,
      /requireOnlineAuthSessionValidation\(storedSession\)[\s\S]*quarantineResult === 'stale'[\s\S]*return;/,
    );
    assert.match(
      restoreFlow,
      /saveAuthSessionIfCurrent\([\s\S]*storedSession,[\s\S]*restoreResult\.session[\s\S]*saveResult === 'stale'[\s\S]*return;/,
    );
    assert.match(
      restoreFlow,
      /purgeOfflineOperationsPrincipalAtTerminalBoundary\([\s\S]*clearAuthSessionIfCurrent\(storedSession\)/,
    );
    assert.match(
      app,
      /const handleAuthenticated = async[\s\S]*sessionRestoreGenerationRef\.current \+= 1/,
    );
    assert.match(
      app,
      /const openSignIn = [\s\S]*sessionRestoreGenerationRef\.current \+= 1/,
    );
  });
});
