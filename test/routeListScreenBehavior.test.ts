import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const screenSource = () =>
  readFileSync("src/features/routes/RouteListScreen.tsx", "utf8");

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
      /await loadOfflineRoutes[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?if \(cached\)/,
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
      /cached \|\| \(await loadOfflineRoutes[\s\S]*?!requestOwnsWorkspace\(\)[\s\S]*?if \(offlineCopy\)/,
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
      /error instanceof ApiSessionExpiredError[\s\S]*?isWorkspaceUnavailableError\(error\)[\s\S]*?recoverUnavailableWorkspace\(requestWorkspaceId\)[\s\S]*?cached \|\| \(await loadOfflineRoutes/,
    );
    assert.match(
      screenSource(),
      /const recoverUnavailableWorkspace = useCallback[\s\S]*?loadRevisionRef\.current \+= 1[\s\S]*?detailRevisionRef\.current \+= 1[\s\S]*?activeWorkspaceIdRef\.current = null[\s\S]*?setRoutes\(\[\]\)[\s\S]*?setShowingOfflineCopy\(false\)[\s\S]*?setDetailLoadingId\(null\)[\s\S]*?setLoading\(false\)[\s\S]*?setRefreshing\(false\)[\s\S]*?onWorkspaceUnavailable\(workspaceId\)/,
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

  it("invalidates a pending route detail before switching workspaces", () => {
    const source = screenSource();

    assert.match(
      source,
      /const workspace = availableWorkspaces\.find[\s\S]*?loadRevisionRef\.current \+= 1;[\s\S]*?detailRevisionRef\.current \+= 1;[\s\S]*?setDetailLoadingId\(null\);[\s\S]*?onWorkspaceChange\(workspace\)/,
    );
  });
});
