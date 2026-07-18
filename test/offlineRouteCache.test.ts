import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  OFFLINE_ROUTE_CACHE_MAX_AGE_MS,
  createOfflineRouteCacheRecord,
  parseOfflineRouteCacheRecord,
  parseOfflineRouteCacheSnapshot,
  purgeAllOfflineRouteStorage,
  purgeOfflineRoutePrincipalStorage,
  purgeOfflineRouteWorkspaceStorage,
  removeWorkspaceFromOfflineRouteCache,
  removeWorkspaceFromOfflineRouteCacheRecord,
  type OfflineRouteCacheStorage,
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

  it("returns the validated write time without changing the value-only API", () => {
    const route = SAVED_ROUTE_PLANS[0];
    assert.ok(route);
    const record = createOfflineRouteCacheRecord({
      clients: [{ id: "client-a", name: "Client A" }],
      routes: [route],
      selectedClientId: "client-a",
    }, "user-a", 1_000);

    const snapshot = parseOfflineRouteCacheSnapshot(record, "user-a", 2_000);
    assert.equal(snapshot?.storedAtMs, 1_000);
    assert.deepEqual(
      snapshot?.value,
      parseOfflineRouteCacheRecord(record, "user-a", 2_000),
    );
    assert.equal(
      parseOfflineRouteCacheSnapshot(record, "user-b", 2_000),
      null,
    );
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
    assert.equal(
      parseOfflineRouteCacheSnapshot(
        record,
        "user-a",
        1_000 + OFFLINE_ROUTE_CACHE_MAX_AGE_MS + 1,
      ),
      null,
    );
    assert.equal(parseOfflineRouteCacheSnapshot(record, "user-a", 999), null);
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

  it("removes every exact-principal list and detail while preserving colliding and unrelated principals", async () => {
    const principalId = "user-a";
    const collidingPrincipalId = "user-a.other";
    const listPrefix = `routes.${principalId}.`;
    const detailPrefix = `details.${principalId}.`;
    const principalListKey = `${listPrefix}all`;
    const principalDetailKey = `${detailPrefix}route-a`;
    const collidingListKey = `${listPrefix}other.all`;
    const unrelatedKey = "unrelated.preference";
    const principalRecord = JSON.stringify(
      createOfflineRouteCacheRecord(
        { clients: [], routes: [], selectedClientId: null },
        principalId,
        1_000,
      ),
    );
    const collidingRecord = JSON.stringify(
      createOfflineRouteCacheRecord(
        { clients: [], routes: [], selectedClientId: null },
        collidingPrincipalId,
        1_000,
      ),
    );
    const storage = createMemoryRouteCacheStorage({
      [collidingListKey]: collidingRecord,
      [principalDetailKey]: principalRecord,
      [principalListKey]: principalRecord,
      [unrelatedKey]: "keep-me",
    });

    await purgeOfflineRoutePrincipalStorage({
      detailKeyPrefix: detailPrefix,
      listKeyPrefix: listPrefix,
      principalId,
      storage,
    });

    assert.equal(await storage.getItem(principalListKey), null);
    assert.equal(await storage.getItem(principalDetailKey), null);
    assert.equal(
      await storage.getItem(collidingListKey),
      collidingRecord,
    );
    assert.equal(await storage.getItem(unrelatedKey), "keep-me");
  });

  it("keeps terminal cleanup retryable when principal deletion is not durable", async () => {
    const principalId = "user-a";
    const listPrefix = `routes.${principalId}.`;
    const principalListKey = `${listPrefix}all`;
    const storage = createMemoryRouteCacheStorage(
      {
        [principalListKey]: JSON.stringify(
          createOfflineRouteCacheRecord(
            { clients: [], routes: [], selectedClientId: null },
            principalId,
            1_000,
          ),
        ),
      },
      { ignoreRemovals: true },
    );

    await assert.rejects(
      purgeOfflineRoutePrincipalStorage({
        detailKeyPrefix: `details.${principalId}.`,
        listKeyPrefix: listPrefix,
        principalId,
        storage,
      }),
      /remained after principal revocation/,
    );
  });

  it("fails closed on ambiguous malformed principal cache candidates", async () => {
    const principalId = "user-a";
    const storage = createMemoryRouteCacheStorage({
      [`routes.${principalId}.all`]: "{not-json",
    });

    await assert.rejects(
      purgeOfflineRoutePrincipalStorage({
        detailKeyPrefix: `details.${principalId}.`,
        listKeyPrefix: `routes.${principalId}.`,
        principalId,
        storage,
      }),
      /principal could not be verified/,
    );
  });

  it("globally removes only route cache namespaces", async () => {
    const storage = createMemoryRouteCacheStorage({
      "routes.user-a.all": "route-list",
      "details.user-a.route-a": "route-detail",
      "workspace.user-a": "workspace",
    });

    await purgeAllOfflineRouteStorage(storage, [
      "routes.",
      "details.",
    ]);

    assert.equal(await storage.getItem("routes.user-a.all"), null);
    assert.equal(
      await storage.getItem("details.user-a.route-a"),
      null,
    );
    assert.equal(
      await storage.getItem("workspace.user-a"),
      "workspace",
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

  it("durably removes denied route data while preserving survivor list and detail records", async () => {
    const principalId = "user-a";
    const deniedWorkspaceId = "client-a";
    const survivorWorkspaceId = "client-b";
    const deniedRoute = { ...SAVED_ROUTE_PLANS[0], clientId: deniedWorkspaceId };
    const survivorRoute = { ...SAVED_ROUTE_PLANS[1], clientId: survivorWorkspaceId };
    const listPrefix = "routes.user-a.";
    const detailPrefix = "details.user-a.";
    const allListKey = `${listPrefix}all`;
    const deniedListKey = `${listPrefix}${deniedWorkspaceId}`;
    const survivorListKey = `${listPrefix}${survivorWorkspaceId}`;
    const deniedDetailKey = `${detailPrefix}${deniedRoute.id}`;
    const survivorDetailKey = `${detailPrefix}${survivorRoute.id}`;
    const survivorListRaw = JSON.stringify(createOfflineRouteCacheRecord({
      clients: [{ id: survivorWorkspaceId, name: "Client B" }],
      routes: [survivorRoute],
      selectedClientId: survivorWorkspaceId,
    }, principalId, 1_000));
    const survivorDetailRaw = JSON.stringify(createOfflineRouteCacheRecord({
      clients: [],
      routes: [survivorRoute],
      selectedClientId: survivorWorkspaceId,
    }, principalId, 1_000));
    const storage = createMemoryRouteCacheStorage({
      [allListKey]: JSON.stringify(createOfflineRouteCacheRecord({
        clients: [
          { id: deniedWorkspaceId, name: "Client A" },
          { id: survivorWorkspaceId, name: "Client B" },
        ],
        routes: [deniedRoute, survivorRoute],
        selectedClientId: deniedWorkspaceId,
      }, principalId, 1_000)),
      [deniedListKey]: JSON.stringify(createOfflineRouteCacheRecord({
        clients: [{ id: deniedWorkspaceId, name: "Client A" }],
        routes: [deniedRoute],
        selectedClientId: deniedWorkspaceId,
      }, principalId, 1_000)),
      [survivorListKey]: survivorListRaw,
      [deniedDetailKey]: JSON.stringify(createOfflineRouteCacheRecord({
        clients: [],
        routes: [deniedRoute],
        selectedClientId: deniedWorkspaceId,
      }, principalId, 1_000)),
      [survivorDetailKey]: survivorDetailRaw,
    });

    await purgeOfflineRouteWorkspaceStorage({
      allListKey,
      detailKeyPrefix: detailPrefix,
      listKeyPrefix: listPrefix,
      principalId,
      scopedListKey: deniedListKey,
      storage,
      workspaceId: deniedWorkspaceId,
    });

    assert.equal(await storage.getItem(deniedListKey), null);
    assert.equal(await storage.getItem(deniedDetailKey), null);
    assert.equal(await storage.getItem(survivorListKey), survivorListRaw);
    assert.equal(await storage.getItem(survivorDetailKey), survivorDetailRaw);
    const mixedRaw = await storage.getItem(allListKey);
    const mixed = mixedRaw
      ? parseOfflineRouteCacheRecord(JSON.parse(mixedRaw), principalId, 1_000)
      : null;
    assert.deepEqual(mixed?.clients, [{ id: survivorWorkspaceId, name: "Client B" }]);
    assert.deepEqual(mixed?.routes.map((route) => route.id), [survivorRoute.id]);
    assert.equal(mixed?.selectedClientId, null);
  });

  it("fails closed when storage acknowledges deletion without removing denied data", async () => {
    const principalId = "user-a";
    const deniedWorkspaceId = "client-a";
    const deniedRoute = { ...SAVED_ROUTE_PLANS[0], clientId: deniedWorkspaceId };
    const listPrefix = "routes.user-a.";
    const detailPrefix = "details.user-a.";
    const deniedListKey = `${listPrefix}${deniedWorkspaceId}`;
    const storage = createMemoryRouteCacheStorage({
      [deniedListKey]: JSON.stringify(createOfflineRouteCacheRecord({
        clients: [{ id: deniedWorkspaceId, name: "Client A" }],
        routes: [deniedRoute],
        selectedClientId: deniedWorkspaceId,
      }, principalId, 1_000)),
    }, { ignoreRemovals: true });

    await assert.rejects(
      purgeOfflineRouteWorkspaceStorage({
        allListKey: `${listPrefix}all`,
        detailKeyPrefix: detailPrefix,
        listKeyPrefix: listPrefix,
        principalId,
        scopedListKey: deniedListKey,
        storage,
        workspaceId: deniedWorkspaceId,
      }),
      /scoped route cache remained/,
    );
  });

  it("fails closed when a malformed mixed cache survives an acknowledged deletion", async () => {
    const principalId = "user-a";
    const listPrefix = "routes.user-a.";
    const allListKey = `${listPrefix}all`;
    const storage = createMemoryRouteCacheStorage({
      [allListKey]: '{"principalId":"another-user"',
    }, { ignoreRemovals: true });

    await assert.rejects(
      purgeOfflineRouteWorkspaceStorage({
        allListKey,
        detailKeyPrefix: "details.user-a.",
        listKeyPrefix: listPrefix,
        principalId,
        scopedListKey: `${listPrefix}client-a`,
        storage,
        workspaceId: "client-a",
      }),
      /mixed route cache remained/i,
    );
  });

  it("prunes denied data from contaminated scoped caches and removes malformed details", async () => {
    const principalId = "user-a";
    const deniedWorkspaceId = "client-a";
    const survivorWorkspaceId = "client-b";
    const deniedRoute = { ...SAVED_ROUTE_PLANS[0], clientId: deniedWorkspaceId };
    const survivorRoute = { ...SAVED_ROUTE_PLANS[1], clientId: survivorWorkspaceId };
    const listPrefix = "routes.user-a.";
    const detailPrefix = "details.user-a.";
    const survivorListKey = `${listPrefix}${survivorWorkspaceId}`;
    const malformedDetailKey = `${detailPrefix}malformed`;
    const storage = createMemoryRouteCacheStorage({
      [survivorListKey]: JSON.stringify(createOfflineRouteCacheRecord({
        clients: [
          { id: deniedWorkspaceId, name: "Client A" },
          { id: survivorWorkspaceId, name: "Client B" },
        ],
        routes: [deniedRoute, survivorRoute],
        selectedClientId: deniedWorkspaceId,
      }, principalId, 1_000)),
      [malformedDetailKey]: '{"client_id":"client-a"',
    });

    await purgeOfflineRouteWorkspaceStorage({
      allListKey: `${listPrefix}all`,
      detailKeyPrefix: detailPrefix,
      listKeyPrefix: listPrefix,
      principalId,
      scopedListKey: `${listPrefix}${deniedWorkspaceId}`,
      storage,
      workspaceId: deniedWorkspaceId,
    });

    assert.equal(await storage.getItem(malformedDetailKey), null);
    const survivorRaw = await storage.getItem(survivorListKey);
    const survivor = survivorRaw
      ? parseOfflineRouteCacheRecord(JSON.parse(survivorRaw), principalId, 1_000)
      : null;
    assert.deepEqual(survivor?.clients, [
      { id: survivorWorkspaceId, name: "Client B" },
    ]);
    assert.deepEqual(survivor?.routes.map((route) => route.id), [survivorRoute.id]);
    assert.equal(survivor?.selectedClientId, null);
  });

  it("serializes cache writes and waits for read-after-write visibility", () => {
    const source = readFileSync("src/features/routes/offlineRouteCache.ts", "utf8");

    assert.match(source, /enqueueRouteCacheMutation\(identity/);
    assert.match(source, /purgeOfflineRouteWorkspaceStorage\(\{/);
    assert.match(source, /await waitForPendingRouteCacheMutation\(identity\)/);
    assert.match(
      source,
      /saveOfflineRoutes[\s\S]*isOfflineWorkspacePrincipalRevoked/,
    );
    assert.match(
      source,
      /clearOfflineRoutePrincipal[\s\S]*purgeOfflineRoutePrincipalStorage/,
    );
    assert.match(
      source,
      /enqueueGlobalRouteCacheMutation[\s\S]*pendingRouteCacheMutations\.values/,
    );
  });
});

function createMemoryRouteCacheStorage(
  initial: Record<string, string>,
  { ignoreRemovals = false }: { ignoreRemovals?: boolean } = {},
): OfflineRouteCacheStorage {
  const values = new Map(Object.entries(initial));
  return {
    async getAllKeys() {
      return Array.from(values.keys());
    },
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async multiGet(keys) {
      return keys.map((key) => [key, values.get(key) ?? null] as const);
    },
    async multiRemove(keys) {
      if (!ignoreRemovals) {
        keys.forEach((key) => values.delete(key));
      }
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}
