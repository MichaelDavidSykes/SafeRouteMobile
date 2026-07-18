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
    assert.match(
      text,
      /result\.error instanceof ApiSessionExpiredError[\s\S]*Trip and convoy manifests could not sync/
    );
    assert.match(text, /error instanceof ApiSessionExpiredError/);
    assert.match(text, /createOperationsSyncWarningState\(/);
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

  it("keeps workspace-list age separate from retained Operations freshness", () => {
    const source = readFileSync(
      "src/features/operations/OperationsScreen.tsx",
      "utf8",
    );

    assert.match(
      source,
      /Previously loaded operations remain available for review only; their freshness is not verified/,
    );
    assert.match(
      source,
      /catalogStoredAtMs=\{[\s\S]*workspaceAuthorizationFresh[\s\S]*workspaceCatalogStoredAtMs/,
    );
    assert.doesNotMatch(source, /Current operations remain available/);
    assert.doesNotMatch(source, /operations cached/);
  });
});
