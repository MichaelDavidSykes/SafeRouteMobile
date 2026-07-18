import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const screenSource = () => readFileSync("src/features/operations/OperationsScreen.tsx", "utf8");
const loaderSource = () =>
  readFileSync("src/features/operations/operationsWorkspaceLoadCore.ts", "utf8");

describe("operations screen behavior", () => {
  it("loads routes and manifests only for App's controlled active workspace", () => {
    const text = `${screenSource()}\n${loaderSource()}`;

    assert.match(text, /activeWorkspace: SafeRouteWorkspace \| null/);
    assert.match(text, /availableWorkspaces: SafeRouteWorkspace\[\]/);
    assert.match(text, /selectedWorkspaceId = activeWorkspace\?\.id \|\| null/);
    assert.match(text, /fetchSavedRoutes\(accessToken, requestWorkspaceId\)/);
    assert.match(text, /fetchOperationsState\(accessToken, requestWorkspaceId\)/);
    assert.match(text, /route\.clientId === workspaceId/);
    assert.match(text, /activeWorkspaceIdRef\.current === requestWorkspaceId/);
    assert.match(text, /loadedWorkspaceId === selectedWorkspaceId/);
    assert.match(text, /createPlannedRouteRows\(visibleRoutes, visibleOperationsState\)/);
    assert.match(text, /createCalendarRows\(visibleRoutes, visibleOperationsState\)/);
    assert.match(text, /createConvoyRows\(visibleRoutes, visibleOperationsState\)/);
    assert.doesNotMatch(text, /clients\[0\]|resolveOperationsClientId|setClients\(/);
  });

  it("invalidates prior-workspace cards before notifying App of a switch", () => {
    const text = screenSource();
    const switchBlock = /onPress=\{\(\) => \{[\s\S]*?nextWorkspace\.id === selectedWorkspaceId[\s\S]*?onWorkspaceChange\(nextWorkspace\);[\s\S]*?\}\}/.exec(text)?.[0] || "";

    assert.match(switchBlock, /loadRevisionRef\.current \+= 1/);
    assert.match(switchBlock, /activeWorkspaceIdRef\.current = nextWorkspace\.id/);
    assert.match(switchBlock, /setLoadedWorkspaceId\(null\)/);
    assert.match(switchBlock, /setRoutes\(\[\]\)/);
    assert.match(switchBlock, /setOperationsState\(null\)/);
    assert.match(switchBlock, /setOperationsWarning\(null\)/);
    assert.match(switchBlock, /setErrorState\(null\)/);
    assert.ok(switchBlock.indexOf("setRoutes([])") < switchBlock.indexOf("onWorkspaceChange(nextWorkspace)"));
  });

  it("fails closed without a workspace and exposes honest accessible catalog states", () => {
    const text = screenSource();

    assert.match(text, /if \(!requestWorkspaceId\) \{[\s\S]*setRoutes\(\[\]\)[\s\S]*return/);
    assert.match(text, /createOperationsWorkspaceState\(/);
    assert.match(text, /testID=\{uiTestIds\.operationsWorkspaceState\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsWorkspaceRetry\}/);
    assert.match(text, /accessibilityRole=\{workspaceState\.loading \? "progressbar" : "summary"\}/);
    assert.match(text, /hitSlop=\{OPERATIONS_ERROR_ACTION_HIT_SLOP\}/);
    assert.match(text, /<Text style=\{styles\.clientSelectorLabel\}>Workspace<\/Text>/);
    assert.doesNotMatch(text, />Tenant</);
  });

  it("locks workspace switching during guidance and keeps the full App catalog", () => {
    const text = screenSource();

    assert.match(text, /createOperationsWorkspaceOptions\(availableWorkspaces, selectedWorkspaceId\)/);
    assert.match(text, /disabled=\{workspaceSwitchDisabled\}/);
    assert.match(text, /End active guidance before changing workspace/);
    assert.match(text, /testID=\{uiTestIds\.operationsWorkspaceSelector\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsWorkspaceOption\(workspace\.id\)\}/);
    assert.doesNotMatch(text, /setClients\(result\.clients\)/);
  });

  it("expires centrally only when the authenticated route request rejects the session", () => {
    const text = screenSource();
    const expiryCalls = text.match(/instanceof ApiSessionExpiredError\)[\s\S]{0,100}onSessionExpired/g) || [];

    assert.equal(expiryCalls.length, 1);
    assert.match(text, /error instanceof ApiSessionExpiredError/);
    assert.match(text, /createOperationsSyncWarningState\(/);
    assert.match(loaderSource(), /error instanceof ApiSessionExpiredError[\s\S]*throw error/);
  });

  it("fails closed and reports only an owned workspace 403 or 404 to App", () => {
    const text = `${screenSource()}\n${loaderSource()}`;

    assert.match(text, /isWorkspaceUnavailableError\(error\)/);
    assert.match(text, /status: "workspace-unavailable"/);
    assert.match(text, /result\.status === "workspace-unavailable"/);
    assert.match(text, /loadRevisionRef\.current \+= 1/);
    assert.match(text, /activeWorkspaceIdRef\.current = null/);
    assert.match(text, /setRoutes\(\[\]\)[\s\S]*setOperationsState\(null\)[\s\S]*onWorkspaceUnavailable\(requestWorkspaceId\)/);
    assert.ok(
      text.indexOf('result.status === "workspace-unavailable"') <
        text.indexOf("createOperationsSyncWarningState("),
    );
  });

  it("keeps Operations view-only while exposing stable cards and tabs", () => {
    const text = screenSource();

    assert.match(text, /accessibilityRole="tab"/);
    assert.match(text, /testID=\{uiTestIds\.operationsScreen\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsRouteCard\(row\.id\)\}/);
    assert.match(text, /testID=\{uiTestIds\.operationsConvoyCard\(row\.id\)\}/);
    assert.match(text, /SafeRoute · View only/);
    assert.doesNotMatch(text, /onEdit|Edit route|Save changes|Delete route|Create convoy|saveSelected|upsert|deleteTrip/);
  });

  it("keeps workspace-list age separate from the secure saved calendar", () => {
    const source = readFileSync(
      "src/features/operations/OperationsScreen.tsx",
      "utf8",
    );

    assert.match(
      source,
      /loadOfflineOperationsSnapshot\([\s\S]*cacheIdentity[\s\S]*requestWorkspaceId/,
    );
    assert.match(
      source,
      /catalogStoredAtMs=\{[\s\S]*workspaceAuthorizationFresh[\s\S]*workspaceCatalogStoredAtMs/,
    );
    assert.doesNotMatch(source, /Current operations remain available/);
    assert.match(source, /createOperationsOfflineReviewPresentation/);
    assert.match(source, /createOfflineCalendarRows\(offlineCalendarEntries\)/);
    assert.match(source, /convoy manifests are not stored offline/i);
    assert.match(
      source,
      /result\.status === "loaded"[\s\S]*tryActivateOfflineOperationsWorkspace\([\s\S]*if \(!requestOwnsWorkspace\(\)\) \{[\s\S]*return;[\s\S]*saveOfflineOperationsSnapshot\(/,
    );
    assert.match(
      source,
      /Checking connection and securely saved Operations data\./,
    );
    assert.doesNotMatch(source, /No cached operations are available/);
    assert.doesNotMatch(source, /snapshot\.operationsState|snapshot\.routes/);
  });

  it("removes only the owned saved calendar with honest race-safe states", () => {
    const source = screenSource();
    const removalBlock =
      /const removeSavedCalendar = async \(\) => \{[\s\S]*?\n  \};/.exec(
        source,
      )?.[0] || "";

    assert.match(source, /Alert\.alert\(confirmation\.title, confirmation\.copy/);
    assert.match(source, /style: "cancel"[\s\S]*text: "Cancel"/);
    assert.match(source, /style: "destructive"[\s\S]*text: "Remove"/);
    assert.match(
      removalBlock,
      /const removalWorkspaceId = selectedWorkspaceId/,
    );
    assert.match(
      removalBlock,
      /const removalCacheIdentity = cacheIdentity/,
    );
    assert.match(removalBlock, /loadRevisionRef\.current = loadRevision/);
    assert.match(
      removalBlock,
      /removeOfflineOperationsWorkspaceCalendar\([\s\S]*removalCacheIdentity,[\s\S]*removalWorkspaceId/,
    );
    assert.ok(
      removalBlock.indexOf("loadRevisionRef.current = loadRevision") <
        removalBlock.indexOf("await removeOfflineOperationsWorkspaceCalendar"),
    );
    assert.ok(
      removalBlock.indexOf("setOfflineCalendarEntries([])") <
        removalBlock.indexOf("await removeOfflineOperationsWorkspaceCalendar"),
    );
    assert.match(
      removalBlock,
      /offlineCalendarRemovalRevisionRef\.current !== removalRevision[\s\S]*activeWorkspaceIdRef\.current !== removalWorkspaceId/,
    );
    assert.match(
      removalBlock,
      /offlineCalendarRemovalPendingRef\.current = \{[\s\S]*revision: removalRevision,[\s\S]*scopeKey: offlineCalendarRemovalScopeKey/,
    );
    assert.match(
      removalBlock,
      /offlineCalendarRemovalPendingRef\.current = null;[\s\S]*setOfflineCalendarRemovalState\(removalFailed \? "retry" : "removed"\)/,
    );
    assert.match(
      removalBlock,
      /setOfflineCalendarRemovalState\(removalFailed \? "retry" : "removed"\)/,
    );
    assert.doesNotMatch(removalBlock, /fetch|onWorkspaceChange|SecureStore/);
  });

  it("exposes separate accessible remove, progress, success, and retry controls", () => {
    const source = screenSource();
    const removalBlock =
      /const removeSavedCalendar = async \(\) => \{[\s\S]*?\n  \};/.exec(
        source,
      )?.[0] || "";

    assert.match(
      source,
      /testID=\{uiTestIds\.operationsRemoveSavedCalendar\}/,
    );
    assert.match(
      source,
      /accessibilityState=\{\{[\s\S]*busy: offlineCalendarRemovalPresentation\.busy,[\s\S]*disabled: offlineCalendarRemovalPresentation\.busy/,
    );
    assert.match(
      source,
      /testID=\{uiTestIds\.operationsCalendarRemovalStatus\}/,
    );
    assert.match(
      source,
      /accessibilityRole=\{[\s\S]*offlineCalendarRemovalState === "removing"[\s\S]*"progressbar"[\s\S]*"alert"/,
    );
    assert.match(
      source,
      /testID=\{uiTestIds\.operationsCalendarRemovalRetry\}/,
    );
    assert.match(
      source,
      /offlineCalendarRemovalState === "retry"[\s\S]*void removeSavedCalendar\(\)/,
    );
    assert.match(
      source,
      /offlineCalendarRemovalRevisionRef\.current \+= 1;[\s\S]*setOfflineCalendarRemovalState\("idle"\);[\s\S]*onWorkspaceChange\(nextWorkspace\)/,
    );
    assert.match(
      source,
      /offlineCalendarRemovalScopeKey = JSON\.stringify\([\s\S]*cacheIdentity,[\s\S]*selectedWorkspaceId/,
    );
    assert.match(
      source,
      /offlineCalendarRemovalStateScopeRef\.current ===[\s\S]*offlineCalendarRemovalScopeKey[\s\S]*storedOfflineCalendarRemovalState[\s\S]*"idle"/,
    );
    assert.match(
      source,
      /offlineCalendarRemovalPendingRef\.current\?\.scopeKey ===[\s\S]*requestRemovalScopeKey[\s\S]*return;/,
    );
    assert.match(
      source,
      /offlineCalendarRemovalPendingRef\.current\?\.scopeKey ===[\s\S]*protectedRequestsAvailable[\s\S]*offlineCalendarRemovalReloadPendingRef\.current = true;[\s\S]*return;/,
    );
    assert.match(
      source,
      /reloadAfterRemoval[\s\S]*offlineCalendarRemovalReloadPendingRef\.current = false;[\s\S]*loadOperationsRef\.current\(\)/,
    );
    assert.match(
      removalBlock,
      /offlineCalendarRemovalReloadPendingRef\.current =[\s\S]*protectedRequestsAvailableRef\.current/,
    );
    assert.match(
      source,
      /OFFLINE_CALENDAR_REMOVAL_RETRY_SCOPES = new Set<string>\(\)[\s\S]*offlineCalendarRemovalRetryScopesRef = useRef\([\s\S]*OFFLINE_CALENDAR_REMOVAL_RETRY_SCOPES/,
    );
    assert.match(
      source,
      /removalFailed[\s\S]*offlineCalendarRemovalRetryScopesRef\.current\.add\([\s\S]*offlineCalendarRemovalScopeKey[\s\S]*offlineCalendarRemovalRetryScopesRef\.current\.delete\(/,
    );
    assert.match(
      source,
      /offlineCalendarRemovalRetryScopesRef\.current\.has\([\s\S]*offlineCalendarRemovalScopeKey[\s\S]*\? "retry"[\s\S]*: "idle"/,
    );
    assert.match(
      source,
      /if \(cacheWorkspaceActivated\) \{[\s\S]*offlineCalendarRemovalRetryScopesRef\.current\.delete\([\s\S]*setOfflineCalendarRemovalState\("idle"\)/,
    );
    assert.match(
      source,
      /!errorState &&[\s\S]*protectedRequestsAvailable &&[\s\S]*workspaceOwnsResults &&[\s\S]*visibleOperationsState !== null \|\| visibleRoutes\.length > 0[\s\S]*!showingOfflineCopy[\s\S]*styles\.summaryStrip/,
    );
  });
});
