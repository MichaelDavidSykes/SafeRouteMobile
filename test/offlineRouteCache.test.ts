import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  OFFLINE_ROUTE_CACHE_MAX_AGE_MS,
  createOfflineRouteCacheRecord,
  parseOfflineRouteCacheRecord,
  removeWorkspaceFromOfflineRouteCache,
  removeWorkspaceFromOfflineRouteCacheRecord,
} from "../src/features/routes/offlineRouteCacheCore";
import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";

describe("offline saved route cache", () => {
  it("round-trips snapped geometry, guidance, risks, and route context", () => {
    const route = SAVED_ROUTE_PLANS[0];
    assert.ok(route);
    const record = createOfflineRouteCacheRecord({
      clients: [{ id: "client-a", name: "Client A" }],
      routes: [route],
      selectedClientId: "client-a",
    }, "user-a", 1_000);
    const restored = parseOfflineRouteCacheRecord(record, "user-a", 2_000);

    assert.equal(restored?.routes[0].id, route.id);
    assert.deepEqual(restored?.routes[0].route.coordinates, route.route.coordinates);
    assert.deepEqual(restored?.routes[0].riskZones, route.riskZones);
    assert.deepEqual(restored?.routes[0].checkpoints, route.checkpoints);
    assert.equal(parseOfflineRouteCacheRecord(record, "user-b", 2_000), null);
  });

  it("fails closed for expired, future, malformed, or incomplete records", () => {
    const route = SAVED_ROUTE_PLANS[0];
    assert.ok(route);
    const record = createOfflineRouteCacheRecord({
      clients: [], routes: [route], selectedClientId: null,
    }, "user-a", 1_000);
    assert.equal(
      parseOfflineRouteCacheRecord(
        record,
        "user-a",
        1_000 + OFFLINE_ROUTE_CACHE_MAX_AGE_MS + 1,
      ),
      null,
    );
    assert.equal(parseOfflineRouteCacheRecord(record, "user-a", 999), null);
    assert.equal(parseOfflineRouteCacheRecord({}, "user-a"), null);
    assert.equal(parseOfflineRouteCacheRecord({ ...record, schema: 1 }, "user-a", 2_000), null);
    assert.deepEqual(
      parseOfflineRouteCacheRecord({
        ...record,
        value: { clients: [], routes: [{ id: "bad" }], selectedClientId: null },
      }, "user-a", 2_000)?.routes,
      [],
    );
  });

  it("removes a revoked workspace from mixed list and selection cache data", () => {
    const alphaRoute = { ...SAVED_ROUTE_PLANS[0], clientId: "client-a" };
    const bravoRoute = { ...SAVED_ROUTE_PLANS[1], clientId: "client-b" };

    assert.deepEqual(
      removeWorkspaceFromOfflineRouteCache({
        clients: [
          { id: "client-a", name: "Client A" },
          { id: "client-b", name: "Client B" },
        ],
        routes: [alphaRoute, bravoRoute],
        selectedClientId: "client-b",
      }, "client-b"),
      {
        clients: [{ id: "client-a", name: "Client A" }],
        routes: [alphaRoute],
        selectedClientId: null,
      },
    );
  });

  it("preserves the original cache age when removing a workspace", () => {
    const record = createOfflineRouteCacheRecord({
      clients: [
        { id: "client-a", name: "Client A" },
        { id: "client-b", name: "Client B" },
      ],
      routes: [
        { ...SAVED_ROUTE_PLANS[0], clientId: "client-a" },
        { ...SAVED_ROUTE_PLANS[1], clientId: "client-b" },
      ],
      selectedClientId: "client-b",
    }, "user-a", 1_000);

    const pruned = removeWorkspaceFromOfflineRouteCacheRecord(record, "client-b");
    assert.equal(pruned.storedAtMs, 1_000);
    assert.deepEqual(pruned.value.clients, [{ id: "client-a", name: "Client A" }]);
  });

  it("serializes cache writes and removes scoped, mixed-list, and detail keys", () => {
    const source = readFileSync("src/features/routes/offlineRouteCache.ts", "utf8");

    assert.match(source, /enqueueRouteCacheMutation\(identity/);
    assert.match(source, /removeItem\(scopedListKey\)/);
    assert.match(source, /getAllKeys\(\)/);
    assert.match(source, /multiGet\(detailKeys\)/);
    assert.match(source, /multiRemove\(Array\.from\(keysToRemove\)\)/);
    assert.match(source, /removeWorkspaceFromOfflineRouteCacheRecord\(allListRecord/);
  });
});
