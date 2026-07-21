import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createOfflineOperationsPreferenceStorage,
  recoverOfflineOperationsPreferenceCleanup,
  type OfflineOperationsPreferenceStorageAdapter,
} from "../src/features/operations/offlineOperationsPreferenceStorageCore";

function memoryStore(initialValue: string | null = null) {
  let value = initialValue;
  let failGet = false;
  let failRemove = false;
  let failSet = false;
  const adapter: OfflineOperationsPreferenceStorageAdapter = {
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

function deferred<T>() {
  let resolve = (_value: T) => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("offline Operations saving preference storage", () => {
  it("persists exact-scope opt-outs across instances without affecting peers", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPreferenceStorage(memory.adapter);

    await storage.disable("principal-a", "workspace-a");
    assert.equal(
      await storage.getPreference("principal-a", "workspace-a"),
      "cleanup-pending",
    );
    assert.equal(
      await storage.getPreference("principal-a", "workspace-b"),
      "enabled",
    );
    assert.equal(
      await storage.getPreference("principal-b", "workspace-a"),
      "enabled",
    );

    const crashed = createOfflineOperationsPreferenceStorage(memory.adapter);
    assert.equal(
      await crashed.getPreference("principal-a", "workspace-a"),
      "cleanup-pending",
    );
    await crashed.completeCleanup("principal-a", "workspace-a");
    const relaunched = createOfflineOperationsPreferenceStorage(memory.adapter);
    assert.equal(
      await relaunched.getPreference("principal-a", "workspace-a"),
      "disabled",
    );
    await relaunched.enable("principal-a", "workspace-a");
    assert.match(memory.value || "", /"disabledScopes":\[\]/);
    assert.equal(
      await relaunched.getPreference("principal-a", "workspace-a"),
      "enabled",
    );
  });

  it("sets a process fence before awaiting and makes disable beat a held save", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPreferenceStorage(memory.adapter);
    const operationStarted = deferred<void>();
    const releaseOperation = deferred<string>();
    let saved = false;

    const guarded = storage.runIfAllowed(
      "principal",
      "workspace",
      async () => {
        operationStarted.resolve();
        const value = await releaseOperation.promise;
        saved = true;
        return value;
      },
    );
    await operationStarted.promise;
    const disabling = storage.disable("principal", "workspace");
    assert.equal(
      await storage.getPreference("principal", "workspace"),
      "unverified",
    );
    releaseOperation.resolve("late");

    assert.deepEqual(await guarded, { status: "unavailable", value: null });
    assert.equal(saved, true);
    await disabling;
    assert.equal(
      (
        await storage.runIfAllowed(
          "principal",
          "workspace",
          async () => "must-not-run",
        )
      ).status,
      "cleanup-pending",
    );
    await storage.completeCleanup("principal", "workspace");
    assert.equal(
      await storage.getPreference("principal", "workspace"),
      "disabled",
    );
  });

  it("fails closed for corrupt or unreadable policy data", async () => {
    const corrupt = memoryStore("{not-json");
    const corruptStorage = createOfflineOperationsPreferenceStorage(
      corrupt.adapter,
    );
    assert.equal(
      await corruptStorage.getPreference("principal", "workspace"),
      "unavailable",
    );
    assert.deepEqual(
      await corruptStorage.runIfAllowed(
        "principal",
        "workspace",
        async () => "must-not-run",
      ),
      { status: "unavailable", value: null },
    );

    const unreadable = memoryStore();
    unreadable.setFailGet(true);
    assert.equal(
      await createOfflineOperationsPreferenceStorage(
        unreadable.adapter,
      ).getPreference("principal", "workspace"),
      "unavailable",
    );
    assert.equal(
      await corruptStorage.getPreference(
        "principal\u0000workspace",
        "workspace",
      ),
      "unavailable",
    );
    assert.equal(
      (
        await corruptStorage.runIfAllowed(
          "principal",
          "workspace\nother",
          async () => "must-not-run",
        )
      ).status,
      "unavailable",
    );
  });

  it("never reports a failed disable or enable as durable", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPreferenceStorage(memory.adapter);
    memory.setFailSet(true);
    await assert.rejects(() =>
      storage.disable("principal", "workspace"),
    );
    assert.equal(
      await storage.getPreference("principal", "workspace"),
      "unverified",
    );

    memory.setFailSet(false);
    await storage.disable("principal", "workspace");
    await storage.completeCleanup("principal", "workspace");
    memory.setFailSet(true);
    await assert.rejects(() =>
      storage.enable("principal", "workspace"),
    );
    memory.setFailSet(false);
    assert.equal(
      await storage.getPreference("principal", "workspace"),
      "disabled",
    );
  });

  it("treats a fulfilled explicit Allow write as committed when only readback becomes unavailable", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPreferenceStorage(memory.adapter);
    await storage.disable("principal", "workspace");
    await storage.completeCleanup("principal", "workspace");

    const originalGet = memory.adapter.get;
    const originalSet = memory.adapter.set;
    let failReadback = false;
    memory.adapter.get = async () => {
      if (failReadback) {
        throw new Error("readback unavailable");
      }
      return originalGet();
    };
    memory.adapter.set = async (value) => {
      await originalSet(value);
      failReadback = true;
    };

    await storage.enable("principal", "workspace");
    failReadback = false;
    const relaunched = createOfflineOperationsPreferenceStorage(
      memory.adapter,
    );
    assert.equal(
      await relaunched.getPreference("principal", "workspace"),
      "enabled",
    );
    assert.match(memory.value || "", /"disabledScopes":\[\]/);
  });

  it("automatically completes interrupted cleanup after a fresh instance", async () => {
    const memory = memoryStore();
    const beforeCrash = createOfflineOperationsPreferenceStorage(
      memory.adapter,
    );
    await beforeCrash.disable("principal", "workspace");

    let savedCalendarPresent = true;
    const relaunched = createOfflineOperationsPreferenceStorage(
      memory.adapter,
    );
    assert.equal(
      await recoverOfflineOperationsPreferenceCleanup(
        relaunched,
        "principal",
        "workspace",
        async () => {
          savedCalendarPresent = false;
        },
      ),
      "disabled",
    );
    assert.equal(savedCalendarPresent, false);
    assert.equal(
      await createOfflineOperationsPreferenceStorage(
        memory.adapter,
      ).getPreference("principal", "workspace"),
      "disabled",
    );

    await relaunched.disable("principal", "workspace");
    assert.equal(
      await recoverOfflineOperationsPreferenceCleanup(
        createOfflineOperationsPreferenceStorage(memory.adapter),
        "principal",
        "workspace",
        async () => {
          throw new Error("SecureStore unavailable");
        },
      ),
      "cleanup-pending",
    );
  });

  it("single-flights cleanup recovery and reports a concurrent explicit Allow", async () => {
    const memory = memoryStore();
    const beforeCrash = createOfflineOperationsPreferenceStorage(
      memory.adapter,
    );
    await beforeCrash.disable("principal", "workspace");
    const relaunched = createOfflineOperationsPreferenceStorage(
      memory.adapter,
    );
    const clearStarted = deferred<void>();
    const releaseClear = deferred<void>();
    let clearCalls = 0;
    const clearSavedCalendar = async () => {
      clearCalls += 1;
      clearStarted.resolve();
      await releaseClear.promise;
    };

    const firstRecovery = recoverOfflineOperationsPreferenceCleanup(
      relaunched,
      "principal",
      "workspace",
      clearSavedCalendar,
    );
    const secondRecovery = recoverOfflineOperationsPreferenceCleanup(
      relaunched,
      "principal",
      "workspace",
      clearSavedCalendar,
    );
    await clearStarted.promise;
    await relaunched.enable("principal", "workspace");
    releaseClear.resolve();

    assert.deepEqual(
      await Promise.all([firstRecovery, secondRecovery]),
      ["enabled", "enabled"],
    );
    assert.equal(clearCalls, 1);
    assert.equal(
      await createOfflineOperationsPreferenceStorage(
        memory.adapter,
      ).getPreference("principal", "workspace"),
      "enabled",
    );
  });

  it("rejects a readable mismatched Allow when rollback also fails", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPreferenceStorage(memory.adapter);
    await storage.disable("principal", "workspace");
    await storage.completeCleanup("principal", "workspace");
    const disabledValue = memory.value;
    let setCalls = 0;
    memory.adapter.set = async () => {
      setCalls += 1;
      if (setCalls > 1) {
        throw new Error("rollback failed");
      }
      // Simulate a fulfilled write that readback proves did not commit.
    };

    await assert.rejects(
      () => storage.enable("principal", "workspace"),
      /rollback failed/,
    );
    assert.equal(memory.value, disabledValue);
    assert.equal(
      await storage.getPreference("principal", "workspace"),
      "disabled",
    );
  });
});
