import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_MAX_BYTES,
  createOfflineOperationsPrincipalCleanupCoordinator,
  createOfflineOperationsPrincipalCleanupRecord,
  createOfflineOperationsPrincipalCleanupStorage,
  parseOfflineOperationsPrincipalCleanupRecord,
  type OfflineOperationsPrincipalCleanupAdapter,
} from "../src/features/operations/offlineOperationsPrincipalCleanupCore";
import { createOfflineOperationsStorage } from "../src/features/operations/offlineOperationsStorageCore";

function memoryStore(initialValue: string | null = null) {
  let value = initialValue;
  let failGet = false;
  let failRemove = false;
  let failSet = false;
  const adapter: OfflineOperationsPrincipalCleanupAdapter = {
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

function coordinator({
  activatePrincipal = async () => undefined,
  clearAll = async () => undefined,
  clearPrincipal = async () => undefined,
  memory,
}: {
  activatePrincipal?: (principalId: string) => Promise<void>;
  clearAll?: () => Promise<void>;
  clearPrincipal?: (principalId: string) => Promise<void>;
  memory: ReturnType<typeof memoryStore>;
}) {
  return createOfflineOperationsPrincipalCleanupCoordinator({
    activatePrincipal,
    clearAll,
    clearPrincipal,
    storage: createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    ),
  });
}

describe("offline Operations principal cleanup", () => {
  it("strictly validates one bounded pending principal identity and purpose", () => {
    const record =
      createOfflineOperationsPrincipalCleanupRecord(
        "principal-a",
        "terminal",
      );
    assert.ok(record);
    assert.deepEqual(
      parseOfflineOperationsPrincipalCleanupRecord(
        JSON.stringify(record),
      ),
      record,
    );
    assert.equal(
      parseOfflineOperationsPrincipalCleanupRecord(
        JSON.stringify({ ...record, extra: true }),
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsPrincipalCleanupRecord(
        JSON.stringify({ ...record, purpose: "unknown" }),
      ),
      null,
    );
    assert.equal(
      createOfflineOperationsPrincipalCleanupRecord(
        "principal\u0000other",
        "fresh-auth",
      ),
      null,
    );
    assert.equal(
      parseOfflineOperationsPrincipalCleanupRecord("{not-json"),
      null,
    );
    assert.equal(
      parseOfflineOperationsPrincipalCleanupRecord(
        "x".repeat(
          OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_MAX_BYTES + 1,
        ),
      ),
      null,
    );
  });

  it("persists cleanup intent across instances and promotes it for a terminal boundary", async () => {
    const memory = memoryStore();
    const first = createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    );
    assert.deepEqual(
      await first.begin("principal-a", "fresh-auth"),
      {
        durable: true,
        principalId: "principal-a",
        purpose: "fresh-auth",
      },
    );

    const relaunched = createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    );
    assert.deepEqual(await relaunched.getState(), {
      pending: {
        durable: true,
        principalId: "principal-a",
        purpose: "fresh-auth",
      },
      status: "pending",
    });
    assert.deepEqual(
      await relaunched.begin("principal-b", "terminal"),
      {
        durable: true,
        principalId: "principal-a",
        purpose: "terminal",
      },
    );
    assert.match(memory.value || "", /"purpose":"terminal"/);
    await assert.rejects(
      () => relaunched.begin("principal-b", "fresh-auth"),
      /Another Offline Operations principal cleanup is pending/,
    );
    await relaunched.complete("principal-a");
    assert.equal(memory.value, null);
  });

  it("replays terminal auth clearing before Calendar removal after process death", async () => {
    const memory = memoryStore();
    let authFails = true;
    const first = coordinator({ memory });

    assert.deepEqual(
      await first.purgeTerminal("principal-a", async () => {
        if (authFails) {
          throw new Error("auth clear failed");
        }
      }),
      {
        persistenceSafe: false,
        principalId: "principal-a",
        status: "retry",
      },
    );
    assert.match(memory.value || "", /"purpose":"terminal"/);

    authFails = false;
    const events: string[] = [];
    const relaunched = coordinator({
      clearPrincipal: async (principalId) => {
        events.push(`calendar:${principalId}`);
      },
      memory,
    });
    assert.deepEqual(
      await relaunched.recover(null, async () => {
        events.push("auth");
      }),
      {
        persistenceSafe: true,
        principalId: "principal-a",
        status: "clean",
      },
    );
    assert.deepEqual(events, ["auth", "calendar:principal-a"]);
    assert.equal(memory.value, null);
  });

  it("promotes an older cleanup when another principal signs out instead of dropping the terminal boundary", async () => {
    const memory = memoryStore();
    let calendarFails = true;
    const first = coordinator({
      clearPrincipal: async () => {
        if (calendarFails) {
          throw new Error("calendar clear failed");
        }
      },
      memory,
    });
    assert.deepEqual(
      await first.prepareFreshAuthentication("principal-a"),
      {
        persistenceSafe: true,
        principalId: "principal-a",
        status: "retry",
      },
    );

    calendarFails = false;
    const events: string[] = [];
    const next = coordinator({
      clearPrincipal: async (principalId) => {
        events.push(`calendar:${principalId}`);
      },
      memory,
    });
    assert.deepEqual(
      await next.purgeTerminal("principal-b", async () => {
        events.push("auth");
      }),
      {
        persistenceSafe: true,
        principalId: "principal-a",
        status: "clean",
      },
    );
    assert.deepEqual(events, ["auth", "calendar:principal-a"]);
    assert.equal(memory.value, null);
  });

  it("does not persist a new principal behind an unresolved older cleanup", async () => {
    const memory = memoryStore();
    const first = coordinator({
      clearPrincipal: async () => {
        throw new Error("calendar clear failed");
      },
      memory,
    });
    assert.equal(
      (await first.prepareFreshAuthentication("principal-a"))
        .persistenceSafe,
      true,
    );

    const relaunched = coordinator({
      clearPrincipal: async () => {
        throw new Error("still unavailable");
      },
      memory,
    });
    assert.deepEqual(
      await relaunched.prepareFreshAuthentication("principal-b"),
      {
        persistenceSafe: false,
        principalId: "principal-a",
        status: "retry",
      },
    );
  });

  it("uses a verified global Calendar removal when terminal intent is not durable", async () => {
    const memory = memoryStore();
    memory.setFailSet(true);
    const events: string[] = [];
    const cleanup = coordinator({
      clearAll: async () => {
        events.push("calendar:all");
      },
      clearPrincipal: async () => {
        events.push("calendar:principal");
      },
      memory,
    });

    assert.deepEqual(
      await cleanup.purgeTerminal("principal-a", async () => {
        events.push("auth");
      }),
      {
        persistenceSafe: true,
        principalId: "principal-a",
        status: "clean",
      },
    );
    assert.deepEqual(events, ["auth", "calendar:all"]);
    assert.equal(memory.value, null);
  });

  it("still commits sign-out and removes the global Calendar cache when the legacy principal is unavailable", async () => {
    const memory = memoryStore();
    const events: string[] = [];
    const cleanup = coordinator({
      clearAll: async () => {
        events.push("calendar:all");
      },
      memory,
    });

    assert.deepEqual(
      await cleanup.purgeTerminal("", async () => {
        events.push("auth");
      }),
      {
        persistenceSafe: true,
        principalId: null,
        status: "clean",
      },
    );
    assert.deepEqual(events, ["auth", "calendar:all"]);
  });

  it("uses the durable signed-out state to retry a lost nondurable cleanup on the next boot", async () => {
    const journal = memoryStore();
    journal.setFailSet(true);
    const calendar = memoryStore("sensitive-calendar-bytes");
    calendar.setFailRemove(true);
    const calendarStorage = createOfflineOperationsStorage(
      calendar.adapter,
    );
    const first = coordinator({
      clearAll: calendarStorage.clearAll,
      memory: journal,
    });

    assert.deepEqual(
      await first.purgeTerminal(
        "principal-a",
        async () => undefined,
      ),
      {
        persistenceSafe: false,
        principalId: "principal-a",
        status: "retry",
      },
    );
    assert.equal(calendar.value, "sensitive-calendar-bytes");
    assert.equal(journal.value, null);

    // A new process cannot recover a process-only journal. App therefore uses
    // the durable signed-out auth result as a second cleanup invariant.
    const relaunched = coordinator({ memory: journal });
    assert.equal((await relaunched.recover()).status, "clean");
    calendar.setFailRemove(false);
    await calendarStorage.clearAll();
    assert.equal(calendar.value, null);
  });

  it("repairs malformed and oversized journals only with a terminal callback", async () => {
    for (const raw of [
      "{not-json",
      "x".repeat(
        OFFLINE_OPERATIONS_PRINCIPAL_CLEANUP_MAX_BYTES + 1,
      ),
    ]) {
      const memory = memoryStore(raw);
      const events: string[] = [];
      const cleanup = coordinator({
        clearAll: async () => {
          events.push("calendar:all");
        },
        memory,
      });

      assert.deepEqual(await cleanup.recover(), {
        persistenceSafe: false,
        principalId: null,
        status: "retry",
      });
      assert.equal(memory.value, raw);
      assert.deepEqual(
        await cleanup.recover(null, async () => {
          events.push("auth");
        }),
        {
          persistenceSafe: true,
          principalId: null,
          status: "clean",
        },
      );
      assert.deepEqual(events, ["auth", "calendar:all"]);
      assert.equal(memory.value, null);
    }
  });

  it("keeps fresh-auth recovery separate from terminal auth clearing", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    );
    await storage.begin("principal-a", "fresh-auth");
    const events: string[] = [];
    const cleanup = createOfflineOperationsPrincipalCleanupCoordinator({
      activatePrincipal: async () => undefined,
      clearAll: async () => undefined,
      clearPrincipal: async () => {
        events.push("calendar");
      },
      storage: createOfflineOperationsPrincipalCleanupStorage(
        memory.adapter,
      ),
    });

    assert.equal(
      (
        await cleanup.recover(null, async () => {
          events.push("auth");
        })
      ).status,
      "clean",
    );
    assert.deepEqual(events, ["calendar"]);
  });

  it("never reports completion when journal removal cannot be verified", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    );
    await storage.begin("principal-a", "terminal");
    memory.setFailRemove(true);
    await assert.rejects(
      () => storage.complete("principal-a"),
      /remove failed/,
    );
    assert.equal(
      (await storage.getState()).status,
      "pending",
    );

    memory.setFailRemove(false);
    memory.setFailGet(true);
    await assert.rejects(
      () => storage.complete("principal-a"),
      /get failed/,
    );
  });
});
