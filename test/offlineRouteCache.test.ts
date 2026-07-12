import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OFFLINE_ROUTE_CACHE_MAX_AGE_MS,
  createOfflineRouteCacheRecord,
  parseOfflineRouteCacheRecord,
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
    }, 1_000);
    const restored = parseOfflineRouteCacheRecord(record, 2_000);

    assert.equal(restored?.routes[0].id, route.id);
    assert.deepEqual(restored?.routes[0].route.coordinates, route.route.coordinates);
    assert.deepEqual(restored?.routes[0].riskZones, route.riskZones);
    assert.deepEqual(restored?.routes[0].checkpoints, route.checkpoints);
  });

  it("fails closed for expired, future, malformed, or incomplete records", () => {
    const route = SAVED_ROUTE_PLANS[0];
    assert.ok(route);
    const record = createOfflineRouteCacheRecord({
      clients: [], routes: [route], selectedClientId: null,
    }, 1_000);
    assert.equal(
      parseOfflineRouteCacheRecord(record, 1_000 + OFFLINE_ROUTE_CACHE_MAX_AGE_MS + 1),
      null,
    );
    assert.equal(parseOfflineRouteCacheRecord(record, 999), null);
    assert.equal(parseOfflineRouteCacheRecord({}), null);
    assert.deepEqual(
      parseOfflineRouteCacheRecord({
        ...record,
        value: { clients: [], routes: [{ id: "bad" }], selectedClientId: null },
      }, 2_000)?.routes,
      [],
    );
  });
});
