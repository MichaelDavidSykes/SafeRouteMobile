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
      /await loadOfflineRoutes[\s\S]*?revision !== loadRevisionRef\.current[\s\S]*?if \(cached\)/,
    );
    assert.match(
      loadSource,
      /await fetchSavedRoutes[\s\S]*?revision !== loadRevisionRef\.current[\s\S]*?setClients\(result\.clients\)/,
    );
    assert.match(
      loadSource,
      /catch \(error\)[\s\S]*?revision !== loadRevisionRef\.current[\s\S]*?error instanceof ApiSessionExpiredError/,
    );
    assert.match(
      loadSource,
      /cached \|\| \(await loadOfflineRoutes[\s\S]*?revision !== loadRevisionRef\.current[\s\S]*?if \(offlineCopy\)/,
    );
    assert.match(
      loadSource,
      /finally[\s\S]*?revision === loadRevisionRef\.current[\s\S]*?setLoading\(false\)[\s\S]*?setRefreshing\(false\)/,
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
      /await loadOfflineRouteDetail[\s\S]*?revision !== detailRevisionRef\.current[\s\S]*?onSelectRoute\(cached\)/,
    );
    assert.match(
      detailSource,
      /await fetchRouteDetail[\s\S]*?revision !== detailRevisionRef\.current[\s\S]*?onSelectRoute\(routeDetail\)/,
    );
    assert.match(
      detailSource,
      /catch \(error\)[\s\S]*?revision !== detailRevisionRef\.current[\s\S]*?error instanceof ApiSessionExpiredError/,
    );
    assert.match(
      detailSource,
      /finally[\s\S]*?revision === detailRevisionRef\.current[\s\S]*?setDetailLoadingId\(null\)/,
    );
  });
});
