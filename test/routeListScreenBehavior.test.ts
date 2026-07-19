import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const screenSource = () =>
  readFileSync("src/features/routes/RouteListScreen.tsx", "utf8");
const filtersSource = () =>
  readFileSync("src/features/routes/RouteListFilters.tsx", "utf8");

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  assert.notEqual(startIndex, -1, `Missing source boundary: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source boundary: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe("route list screen behavior", () => {
  it("ignores stale saved-route loads and session errors", () => {
    const loadSource = sourceBetween(
      screenSource(),
      "const loadRoutes = useCallback(",
      "const handleChangeQuery",
    );

    assert.match(loadSource, /const revision = loadRevisionRef\.current \+ 1/);
    assert.match(loadSource, /loadRevisionRef\.current = revision/);
    assert.match(
      loadSource,
      /await loadOfflineRoutesSnapshot[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?if \(cachedSnapshot\)/,
    );
    assert.match(
      loadSource,
      /await fetchSavedRoutes[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?routesForWorkspace\(result\.routes, requestWorkspaceId\)[\s\S]*?setRoutes\(scopedResult\.routes\)/,
    );
    assert.match(
      loadSource,
      /catch \(error\)[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?error instanceof ApiSessionExpiredError/,
    );
    assert.match(
      loadSource,
      /cachedSnapshot \|\|[\s\S]*?await loadOfflineRoutesSnapshot[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?if \(offlineSnapshot\)/,
    );
    assert.match(
      loadSource,
      /finally[\s\S]*?requestOwnsWorkspace\(\)[\s\S]*?setLoading\(false\)[\s\S]*?setRefreshing\(false\)/,
    );
  });

  it("treats an owned saved-list 403 or 404 as workspace loss before cached fallback", () => {
    const loadSource = sourceBetween(
      screenSource(),
      "const loadRoutes = useCallback(",
      "const handleChangeQuery",
    );

    assert.match(
      loadSource,
      /const requestWorkspaceId = selectedClientId[\s\S]*?revision === loadRevisionRef\.current[\s\S]*?activeWorkspaceIdRef\.current === requestWorkspaceId/,
    );
    assert.match(
      loadSource,
      /error instanceof ApiSessionExpiredError[\s\S]*?isWorkspaceUnavailableError\(error\)[\s\S]*?recoverUnavailableWorkspace\(requestWorkspaceId\)[\s\S]*?cachedSnapshot \|\|[\s\S]*?await loadOfflineRoutesSnapshot/,
    );
    assert.match(
      screenSource(),
      /const recoverUnavailableWorkspace = useCallback[\s\S]*?loadRevisionRef\.current \+= 1[\s\S]*?detailRevisionRef\.current \+= 1[\s\S]*?activeWorkspaceIdRef\.current = null[\s\S]*?setRoutes\(\[\]\)[\s\S]*?setShowingOfflineCopy\(false\)[\s\S]*?setDetailLoadingId\(null\)[\s\S]*?setLoading\(false\)[\s\S]*?setRefreshing\(false\)[\s\S]*?onWorkspaceUnavailable\(workspaceId\)/,
    );
  });

  it("publishes and clears cache age with the same owned route-list state", () => {
    const source = screenSource();
    const loadSource = sourceBetween(
      source,
      "const loadRoutes = useCallback(",
      "const handleChangeQuery",
    );

    assert.match(
      loadSource,
      /if \(cachedSnapshot\)[\s\S]*?recordOwnedRouteCacheReadback[\s\S]*?setRoutes\(cachedRoutes\)[\s\S]*?setShowingOfflineCopy\(true\)[\s\S]*?setOfflineCopyStoredAtMs\(cachedSnapshot\.storedAtMs\)/,
    );
    assert.match(
      loadSource,
      /setRoutes\(scopedResult\.routes\)[\s\S]*?setShowingOfflineCopy\(false\)[\s\S]*?setOfflineCopyStoredAtMs\(null\)/,
    );
    assert.match(
      loadSource,
      /if \(offlineSnapshot\)[\s\S]*?recordOwnedRouteCacheReadback[\s\S]*?setRoutes\(offlineRoutes\)[\s\S]*?setShowingOfflineCopy\(true\)[\s\S]*?setOfflineCopyStoredAtMs\(offlineSnapshot\.storedAtMs\)/,
    );
    assert.match(
      source,
      /previousSelectedClientIdRef[\s\S]*?setRoutes\(\[\]\)[\s\S]*?setShowingOfflineCopy\(false\)[\s\S]*?setOfflineCopyStoredAtMs\(null\)[\s\S]*?setQuery\(""\)/,
    );
    assert.match(
      source,
      /onSelectClient[\s\S]*?workspace\.id === selectedClientId[\s\S]*?onWorkspaceChange\(workspace\)/,
    );
    assert.match(
      source,
      /cachedReviewAccessibilityLabel=\{[\s\S]*?offlineReviewPresentation\?\.cardAccessibilityLabel/,
    );
    assert.match(
      source,
      /getRouteListOfflineReviewRefreshDelayMs\([\s\S]*?setTimeout\(\(\) => \{[\s\S]*?setOfflineCopyNowMs\(Date\.now\(\)\)/,
    );
    assert.match(
      source,
      /if \(refreshDelayMs === null\) \{[\s\S]*?setRoutes\(\[\]\)[\s\S]*?setShowingOfflineCopy\(false\)[\s\S]*?setOfflineCopyStoredAtMs\(null\)[\s\S]*?createRouteListExpiredCacheMessage\(offlineReviewStatus\)/,
    );
  });

  it("keeps source routes visible with distinct durable-selection states", () => {
    const screen = screenSource();
    const filters = filtersSource();

    assert.match(
      screen,
      /workspaceSelectionFailed=\{workspaceSelectionFailed\}[\s\S]*workspaceSelectionPending=\{workspaceSelectionPending\}/,
    );
    assert.match(
      filters,
      /switchingDisabled =[\s\S]*workspaceCatalogLoading \|\|[\s\S]*workspaceSwitchDisabled \|\|[\s\S]*workspaceSelectionPending/,
    );
    assert.match(filters, /workspaceSelectionPending[\s\S]*"Saving…"/);
    assert.match(filters, /workspaceSelectionFailed[\s\S]*"Try again"/);
    assert.match(filters, /Wait while the workspace choice is saved/);
    assert.match(filters, /Wait while SafeRoute verifies workspace access/);
    assert.match(filters, /Checking…/);
    assert.match(
      filters,
      /busy:[\s\S]*workspaceCatalogLoading \|\|[\s\S]*workspaceSelectionPending \|\|[\s\S]*workspaceSwitchDisabled && !workspaceSwitchFailure/,
    );
  });

  it("recovers an owned route-detail 403 while keeping detail 404 route-specific", () => {
    const detailSource = sourceBetween(
      screenSource(),
      "const handleSelectRoute = async",
      "const handleRetry",
    );

    assert.doesNotMatch(detailSource, /isWorkspaceUnavailableError|onWorkspaceUnavailable/);
    assert.match(
      detailSource,
      /error instanceof ApiSessionExpiredError[\s\S]*?isWorkspaceForbiddenError\(error\)[\s\S]*?recoverUnavailableWorkspace\(selectedClientId\)[\s\S]*?loadOfflineRouteDetail/,
    );
    assert.match(
      detailSource,
      /catch \(error\)[\s\S]*?loadOfflineRouteDetail[\s\S]*?createRouteDetailErrorState\(error, route\.name\)/,
    );
  });

  it("records detail durability only for a dedicated cached detail record", () => {
    const detailSource = sourceBetween(
      screenSource(),
      "const handleSelectRoute = async",
      "const handleRetry",
    );

    assert.equal(
      (detailSource.match(/const cachedDetail = await loadOfflineRouteDetail/g) || [])
        .length,
      2,
    );
    assert.equal(
      (detailSource.match(/if \(cachedDetail\) \{[\s\S]*?"saved-detail-readback"/g) || [])
        .length,
      2,
    );
    assert.doesNotMatch(
      detailSource,
      /recordOfflineRouteCacheReadback\(\s*\[cached\],[\s\S]*?"saved-detail-readback"/,
    );
    assert.equal(
      (detailSource.match(/recordOwnedRouteCacheReadback\(/g) || []).length,
      2,
    );
  });

  it("publishes cached lists only while the evidence request still owns the workspace", () => {
    const loadSource = sourceBetween(
      screenSource(),
      "const loadRoutes = useCallback(",
      "const handleChangeQuery",
    );

    assert.equal(
      (loadSource.match(/recordOwnedRouteCacheReadback\(/g) || []).length,
      2,
    );
    assert.match(
      loadSource,
      /if \(!\(await recordOwnedRouteCacheReadback\([\s\S]*?requestOwnsWorkspace[\s\S]*?\)\)\) \{[\s\S]*?return;[\s\S]*?setRoutes\(cachedRoutes\)/,
    );
  });

  it("keeps list refresh cleanup scoped to pending list work", () => {
    const source = screenSource();

    assert.match(source, /const loadRevisionRef = useRef\(0\)/);
    assert.match(source, /const detailRevisionRef = useRef\(0\)/);
    assert.match(
      source,
      /void loadRoutes\(\);\s*return \(\) => \{\s*loadRevisionRef\.current \+= 1;\s*\};\s*\}, \[loadRoutes\]\)/,
    );
    assert.doesNotMatch(
      source,
      /void loadRoutes\(\);\s*return \(\) => \{[\s\S]*?detailRevisionRef\.current \+= 1;[\s\S]*?\}, \[loadRoutes\]\)/,
    );
  });

  it("invalidates pending route details only when the screen unmounts", () => {
    const source = screenSource();

    assert.match(
      source,
      /useEffect\(\s*\(\) => \(\) => \{\s*detailRevisionRef\.current \+= 1;\s*\},\s*\[\],\s*\);/,
    );
  });

  it("prevents a slower route detail from replacing the latest selection", () => {
    const detailSource = sourceBetween(
      screenSource(),
      "const handleSelectRoute = async",
      "const handleRetry",
    );

    assert.match(detailSource, /const revision = detailRevisionRef\.current \+ 1/);
    assert.match(detailSource, /detailRevisionRef\.current = revision/);
    assert.match(
      detailSource,
      /await loadOfflineRouteDetail[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?onSelectRoute\(\{ \.\.\.cached, clientId: selectedClientId \}\)/,
    );
    assert.match(
      detailSource,
      /await fetchRouteDetail[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?routeDetail\.clientId !== selectedClientId[\s\S]*?onSelectRoute\(routeDetail\)/,
    );
    assert.match(
      detailSource,
      /catch \(error\)[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?error instanceof ApiSessionExpiredError/,
    );
    assert.match(
      detailSource,
      /finally[\s\S]*?requestOwnsWorkspace\(\)[\s\S]*?setDetailLoadingId\(null\)/,
    );
  });

  it("invalidates a pending route detail only after App publishes the workspace", () => {
    const source = screenSource();

    assert.match(
      source,
      /previousSelectedClientIdRef[\s\S]*?detailRevisionRef\.current \+= 1;[\s\S]*?setDetailLoadingId\(null\)/,
    );
    assert.doesNotMatch(
      /onSelectClient=\{\(clientId\) => \{[\s\S]*?onWorkspaceChange\(workspace\);[\s\S]*?\}\}/.exec(source)?.[0] || "",
      /detailRevisionRef|setRoutes|setQuery/,
    );
  });
});
