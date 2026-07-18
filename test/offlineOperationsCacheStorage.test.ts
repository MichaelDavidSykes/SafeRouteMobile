import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS,
  OFFLINE_OPERATIONS_CACHE_MAX_BYTES,
  createOfflineOperationsCacheRecord,
} from "../src/features/operations/offlineOperationsCacheCore";
import {
  createOfflineOperationsStorage,
  tryActivateOfflineOperationsScope,
  type OfflineOperationsStorageAdapter,
} from "../src/features/operations/offlineOperationsStorageCore";
import { loadPreviewOperationsState } from "../src/features/operations/previewOperationsApi";

function memoryStore() {
  let value: string | null = null;
  let failGet = false;
  let failRemove = false;
  let failSet = false;
  const adapter: OfflineOperationsStorageAdapter = {
    get: async () => {
      if (failGet) {
        throw new Error("get failed");
      }
      return value;
    },
    remove: async () => {
      if (failRemove) {
        throw new Error("remove failed");
      }
      value = null;
    },
    set: async (next) => {
      if (failSet) {
        throw new Error("set failed");
      }
      value = next;
    },
  };
  return {
    adapter,
    get value() {
      return value;
    },
    setFailGet(next: boolean) {
      failGet = next;
    },
    setFailRemove(next: boolean) {
      failRemove = next;
    },
    setFailSet(next: boolean) {
      failSet = next;
    },
  };
}

function cacheValue(workspaceId: string) {
  return {
    operationsState: loadPreviewOperationsState(workspaceId),
    routes: SAVED_ROUTE_PLANS.map((route) => ({
      ...route,
      clientId: workspaceId,
    })),
  };
}

function deferred() {
  let resolve = () => undefined;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("offline Operations secure storage", () => {
  it("uses device-only SecureStore without a plaintext fallback", () => {
    const text = readFileSync(
      "src/features/operations/offlineOperationsCache.ts",
      "utf8",
    );

    assert.match(text, /from "expo-secure-store"/);
    assert.match(text, /WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
    assert.doesNotMatch(text, /AsyncStorage/);
    assert.match(
      text,
      /SecureStore\.setItemAsync\([\s\S]*DEVICE_ONLY_SECURE_STORE_OPTIONS/,
    );
    assert.match(
      text,
      /removeOfflineOperationsWorkspaceCalendar\s*=\s*operationsStorage\.clearWorkspace/,
    );
  });

  it("preserves a survivor cache when another workspace is purged", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();

    assert.ok(await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs));
    assert.ok(await storage.save("principal", "workspace-b", cacheValue("workspace-b"), nowMs));
    const survivorBefore = memory.value;
    await storage.clearWorkspace("principal", "workspace-a");
    assert.equal(memory.value, survivorBefore);
    assert.ok(await storage.load("principal", "workspace-b", nowMs));

    await Promise.all([
      storage.clearWorkspace("principal", "workspace-a"),
      storage.clearWorkspace("principal", "workspace-b"),
    ]);
    assert.equal(await storage.load("principal", "workspace-b", nowMs), null);
    assert.match(memory.value || "", /"revoked":true/);
  });

  it("makes principal revocation dominate a queued stale save until reactivated", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();
    assert.ok(await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs));

    await storage.clearPrincipal("principal");
    assert.equal(
      await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs + 1),
      null,
    );
    assert.match(memory.value || "", /"workspaceId":null/);

    await storage.activatePrincipal("principal");
    assert.ok(await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs + 2));
  });

  it("fences principal saves when revocation starts from empty or another principal", async () => {
    const emptyMemory = memoryStore();
    const emptyStorage = createOfflineOperationsStorage(emptyMemory.adapter);
    const nowMs = Date.now();

    await emptyStorage.clearPrincipal("principal");
    assert.match(emptyMemory.value || "", /"workspaceId":null/);
    assert.equal(
      await emptyStorage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs),
      null,
    );

    const occupiedMemory = memoryStore();
    const occupiedStorage = createOfflineOperationsStorage(occupiedMemory.adapter);
    assert.ok(
      await occupiedStorage.save(
        "other-principal",
        "workspace-b",
        cacheValue("workspace-b"),
        nowMs,
      ),
    );
    await occupiedStorage.clearPrincipal("principal");
    assert.match(occupiedMemory.value || "", /"principalId":"principal"/);
    assert.equal(
      await occupiedStorage.save(
        "principal",
        "workspace-a",
        cacheValue("workspace-a"),
        nowMs + 1,
      ),
      null,
    );
  });

  it("preserves another workspace while fencing a denied workspace until fresh access", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();
    assert.ok(await storage.save("principal", "workspace-b", cacheValue("workspace-b"), nowMs));
    const survivorBefore = memory.value;

    await storage.clearWorkspace("principal", "workspace-a");
    assert.equal(memory.value, survivorBefore);
    assert.equal(
      await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs + 1),
      null,
    );
    assert.equal(memory.value, survivorBefore);

    await storage.activateWorkspace("principal", "workspace-a");
    assert.ok(
      await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs + 2),
    );
  });

  it("keeps a newer workspace revocation authoritative over in-flight activation", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();
    assert.ok(await storage.save("principal", "workspace-b", cacheValue("workspace-b"), nowMs));
    const survivorBefore = memory.value;
    const getStarted = deferred();
    const releaseGet = deferred();
    const originalGet = memory.adapter.get;
    let holdNextGet = true;
    memory.adapter.get = async () => {
      if (holdNextGet) {
        holdNextGet = false;
        getStarted.resolve();
        await releaseGet.promise;
      }
      return originalGet();
    };

    const activation = storage.activateWorkspace("principal", "workspace-a");
    await getStarted.promise;
    const revocation = storage.clearWorkspace("principal", "workspace-a");
    releaseGet.resolve();
    await Promise.all([activation, revocation]);

    assert.equal(
      await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs + 1),
      null,
    );
    assert.equal(memory.value, survivorBefore);
    assert.ok(await storage.load("principal", "workspace-b", nowMs + 1));
  });

  it("makes revocation dominate an in-flight storage read", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();
    assert.ok(await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs));
    const getStarted = deferred();
    const releaseGet = deferred();
    const originalGet = memory.adapter.get;
    let holdNextGet = true;
    memory.adapter.get = async () => {
      const captured = await originalGet();
      if (holdNextGet) {
        holdNextGet = false;
        getStarted.resolve();
        await releaseGet.promise;
      }
      return captured;
    };

    const loading = storage.load("principal", "workspace-a", nowMs);
    await getStarted.promise;
    await storage.clearWorkspace("principal", "workspace-a");
    releaseGet.resolve();

    assert.equal(await loading, null);
  });

  it("does not let an expired in-flight read revoke a newer saved calendar", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();
    assert.ok(await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs));
    const getStarted = deferred();
    const releaseGet = deferred();
    const originalGet = memory.adapter.get;
    let holdNextGet = true;
    memory.adapter.get = async () => {
      const captured = await originalGet();
      if (holdNextGet) {
        holdNextGet = false;
        getStarted.resolve();
        await releaseGet.promise;
      }
      return captured;
    };

    const expiredLoad = storage.load(
      "principal",
      "workspace-a",
      nowMs + OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS,
    );
    await getStarted.promise;
    const freshNowMs =
      nowMs + OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS + 1;
    assert.ok(
      await storage.save(
        "principal",
        "workspace-a",
        cacheValue("workspace-a"),
        freshNowMs,
      ),
    );
    releaseGet.resolve();

    assert.equal(await expiredLoad, null);
    assert.ok(
      await storage.load("principal", "workspace-a", freshNowMs),
    );
  });

  it("attempts a durable principal tombstone even when secure-storage reads fail", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    memory.setFailGet(true);

    await assert.rejects(() => storage.clearPrincipal("principal"), /get failed/);
    assert.match(memory.value || "", /"workspaceId":null/);
  });

  it("contains optional cache activation failures", async () => {
    assert.equal(
      await tryActivateOfflineOperationsScope(async () => {
        throw new Error("SecureStore unavailable");
      }),
      false,
    );
    assert.equal(
      await tryActivateOfflineOperationsScope(async () => undefined),
      true,
    );
  });

  it("durably revokes an exact cached calendar on the 24 hour boundary", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();
    assert.ok(await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs));

    assert.equal(
      await storage.load(
        "principal",
        "workspace-a",
        nowMs + OFFLINE_OPERATIONS_CACHE_MAX_AGE_MS,
      ),
      null,
    );
    assert.match(memory.value || "", /"revoked":true/);
    assert.match(memory.value || "", /"workspaceId":"workspace-a"/);
  });

  it("rejects and revokes raw secure-storage values over the byte cap", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();
    const record = createOfflineOperationsCacheRecord(
      "principal",
      "workspace-a",
      cacheValue("workspace-a"),
      nowMs,
    );
    assert.ok(record);
    await memory.adapter.set(
      `${" ".repeat(OFFLINE_OPERATIONS_CACHE_MAX_BYTES)}${JSON.stringify(record)}`,
    );

    assert.equal(
      await storage.load("principal", "workspace-a", nowMs),
      null,
    );
    assert.match(memory.value || "", /"revoked":true/);
  });

  it("fails closed across write, tombstone, readback, and delete failures", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsStorage(memory.adapter);
    const nowMs = Date.now();

    memory.setFailSet(true);
    assert.equal(
      await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs),
      null,
    );
    memory.setFailSet(false);
    assert.ok(await storage.save("principal", "workspace-a", cacheValue("workspace-a"), nowMs));

    memory.setFailSet(true);
    memory.setFailRemove(true);
    await assert.rejects(
      () => storage.clearWorkspace("principal", "workspace-a"),
      /remove failed/,
    );
    assert.equal(
      await storage.load("principal", "workspace-a", nowMs),
      null,
    );

    memory.setFailSet(false);
    memory.setFailRemove(false);
    await storage.clearWorkspace("principal", "workspace-a");
    assert.match(memory.value || "", /"revoked":true/);
    assert.match(memory.value || "", /"workspaceId":"workspace-a"/);

    const relaunchedStorage = createOfflineOperationsStorage(memory.adapter);
    assert.equal(
      await relaunchedStorage.load("principal", "workspace-a", nowMs + 1),
      null,
    );
    await storage.activateWorkspace("principal", "workspace-a");
    assert.ok(
      await storage.save(
        "principal",
        "workspace-a",
        cacheValue("workspace-a"),
        nowMs + 2,
      ),
    );
  });
});
