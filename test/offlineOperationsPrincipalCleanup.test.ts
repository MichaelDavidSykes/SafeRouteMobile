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
import { requireCurrentSessionRestoreAttempt } from "../src/features/auth/sessionRestoreAttempt";

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

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: () => resolvePromise?.(),
  };
}

function coordinator({
  activatePrincipal = async () => undefined,
  clearAll = async () => undefined,
  clearAllTerminal,
  clearPrincipal = async () => undefined,
  clearTerminalPrincipal,
  memory,
}: {
  activatePrincipal?: (principalId: string) => Promise<void>;
  clearAll?: () => Promise<void>;
  clearAllTerminal?: () => Promise<void>;
  clearPrincipal?: (principalId: string) => Promise<void>;
  clearTerminalPrincipal?: (principalId: string) => Promise<void>;
  memory: ReturnType<typeof memoryStore>;
}) {
  return createOfflineOperationsPrincipalCleanupCoordinator({
    activatePrincipal,
    clearAll,
    clearAllTerminal,
    clearPrincipal,
    clearTerminalPrincipal,
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
    assert.deepEqual(
      parseOfflineOperationsPrincipalCleanupRecord(
        JSON.stringify({
          ...record,
          purpose: "terminal-global",
        }),
      )?.purpose,
      "terminal-global",
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
        principalId: "principal-b",
        purpose: "terminal",
      },
    );
    assert.match(memory.value || "", /"purpose":"terminal"/);
    await assert.rejects(
      () => relaunched.begin("principal-a", "fresh-auth"),
      /Another Offline Operations principal cleanup is pending/,
    );
    await relaunched.complete("principal-b");
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

  it("uses the composite protected-cache purge only for terminal cleanup", async () => {
    const freshMemory = memoryStore();
    const freshEvents: string[] = [];
    const freshCleanup = coordinator({
      clearPrincipal: async (principalId) => {
        freshEvents.push(`calendar:${principalId}`);
      },
      clearTerminalPrincipal: async (principalId) => {
        freshEvents.push(`protected:${principalId}`);
      },
      memory: freshMemory,
    });
    assert.equal(
      (
        await freshCleanup.prepareFreshAuthentication(
          "principal-a",
        )
      ).status,
      "clean",
    );
    assert.deepEqual(freshEvents, ["calendar:principal-a"]);

    const terminalMemory = memoryStore();
    const terminalEvents: string[] = [];
    const terminalCleanup = coordinator({
      clearPrincipal: async (principalId) => {
        terminalEvents.push(`calendar:${principalId}`);
      },
      clearTerminalPrincipal: async (principalId) => {
        terminalEvents.push(`protected:${principalId}`);
      },
      memory: terminalMemory,
    });
    assert.equal(
      (
        await terminalCleanup.purgeTerminal(
          "principal-a",
          async () => {
            terminalEvents.push("auth");
          },
        )
      ).status,
      "clean",
    );
    assert.deepEqual(terminalEvents, [
      "auth",
      "protected:principal-a",
    ]);
  });

  it("retains and replays the terminal journal when guidance storage cannot be revoked", async () => {
    const memory = memoryStore();
    let guidanceStorageFails = true;
    const events: string[] = [];
    const first = coordinator({
      clearTerminalPrincipal: async () => {
        events.push("guidance:first");
        if (guidanceStorageFails) {
          throw new Error("guidance storage unavailable");
        }
      },
      memory,
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
    assert.match(memory.value || "", /"purpose":"terminal"/);
    assert.deepEqual(events, ["guidance:first"]);

    guidanceStorageFails = false;
    const relaunched = coordinator({
      clearTerminalPrincipal: async () => {
        events.push("guidance:relaunch");
      },
      memory,
    });
    assert.equal(
      (
        await relaunched.recover(
          null,
          async () => undefined,
        )
      ).status,
      "clean",
    );
    assert.deepEqual(events, [
      "guidance:first",
      "guidance:relaunch",
    ]);
    assert.equal(memory.value, null);
  });

  it("keeps terminal cleanup pending when fresh sign-in invalidates startup recovery", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    );
    await storage.begin("principal-a", "terminal");
    let clearPrincipalCalls = 0;
    const cleanup = coordinator({
      clearPrincipal: async () => {
        clearPrincipalCalls += 1;
      },
      memory,
    });
    let currentGeneration = 1;
    const authBoundary = deferred();
    const recovery = cleanup.recover(null, async () => {
      await authBoundary.promise;
      requireCurrentSessionRestoreAttempt(
        currentGeneration,
        1,
        true,
      );
    });

    currentGeneration += 1;
    authBoundary.resolve();

    assert.deepEqual(await recovery, {
      persistenceSafe: false,
      principalId: "principal-a",
      status: "retry",
    });
    assert.equal(clearPrincipalCalls, 0);
    assert.match(memory.value || "", /"purpose":"terminal"/);
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
      clearAllTerminal: async () => {
        events.push("protected:all");
      },
      clearPrincipal: async (principalId) => {
        events.push(`calendar:${principalId}`);
      },
      clearTerminalPrincipal: async (principalId) => {
        events.push(`protected:${principalId}`);
      },
      memory,
    });
    assert.deepEqual(
      await next.purgeTerminal("principal-b", async () => {
        events.push("auth");
      }),
      {
        persistenceSafe: true,
        principalId: "principal-b",
        status: "clean",
      },
    );
    assert.deepEqual(events, ["auth", "protected:principal-b"]);
    assert.equal(memory.value, null);
  });

  it("durably replays the global fallback when two different terminal principals are pending", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    );
    await storage.begin("principal-a", "terminal");
    const events: string[] = [];
    let globalCleanupFails = true;
    const first = coordinator({
      clearAllTerminal: async () => {
        events.push("protected:all");
        if (globalCleanupFails) {
          throw new Error("route global purge interrupted");
        }
      },
      clearTerminalPrincipal: async (principalId) => {
        events.push(`protected:${principalId}`);
      },
      memory,
    });

    assert.deepEqual(
      await first.purgeTerminal("principal-b", async () => {
        events.push("auth");
      }),
      {
        persistenceSafe: false,
        principalId: "principal-b",
        status: "retry",
      },
    );
    assert.deepEqual(events, ["auth", "protected:all"]);
    assert.match(memory.value || "", /"purpose":"terminal-global"/);

    globalCleanupFails = false;
    const relaunched = coordinator({
      clearAllTerminal: async () => {
        events.push("protected:all:relaunch");
      },
      clearTerminalPrincipal: async (principalId) => {
        events.push(`protected:${principalId}:relaunch`);
      },
      memory,
    });
    assert.deepEqual(
      await relaunched.recover(null, async () => {
        events.push("auth:relaunch");
      }),
      {
        persistenceSafe: true,
        principalId: "principal-b",
        status: "clean",
      },
    );
    assert.deepEqual(events, [
      "auth",
      "protected:all",
      "auth:relaunch",
      "protected:all:relaunch",
    ]);
    assert.equal(memory.value, null);
  });

  it("keeps a failed global promotion authoritative for same-process Retry", async () => {
    const memory = memoryStore();
    const storage = createOfflineOperationsPrincipalCleanupStorage(
      memory.adapter,
    );
    await storage.begin("principal-a", "terminal");
    memory.setFailSet(true);
    let globalCleanupFails = true;
    const events: string[] = [];
    const cleanup = coordinator({
      clearAllTerminal: async () => {
        events.push("protected:all");
        if (globalCleanupFails) {
          throw new Error("global purge interrupted");
        }
      },
      clearTerminalPrincipal: async (principalId) => {
        events.push(`protected:${principalId}`);
      },
      memory,
    });

    assert.deepEqual(
      await cleanup.purgeTerminal("principal-b", async () => {
        events.push("auth");
      }),
      {
        persistenceSafe: false,
        principalId: "principal-b",
        status: "retry",
      },
    );
    assert.deepEqual(events, ["protected:all"]);
    assert.match(memory.value || "", /"principalId":"principal-a"/);
    assert.doesNotMatch(
      memory.value || "",
      /"purpose":"terminal-global"/,
    );

    globalCleanupFails = false;
    assert.deepEqual(
      await cleanup.recover(null, async () => {
        events.push("auth:retry");
      }),
      {
        persistenceSafe: true,
        principalId: "principal-b",
        status: "clean",
      },
    );
    assert.deepEqual(events, [
      "protected:all",
      "protected:all",
      "auth:retry",
    ]);
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

  it("uses the exact-principal terminal purge when journal intent is not durable", async () => {
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
      clearTerminalPrincipal: async (principalId) => {
        events.push(`protected:${principalId}`);
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
    assert.deepEqual(events, ["protected:principal-a", "auth"]);
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
    assert.deepEqual(events, ["calendar:all", "auth"]);
  });

  it("does not commit a nondurable terminal boundary until exact cleanup survives a relaunch", async () => {
    const journal = memoryStore();
    journal.setFailSet(true);
    let exactCleanupFails = true;
    const events: string[] = [];
    const first = coordinator({
      clearTerminalPrincipal: async () => {
        events.push("protected:first");
        if (exactCleanupFails) {
          throw new Error("protected cache unavailable");
        }
      },
      memory: journal,
    });

    assert.deepEqual(
      await first.purgeTerminal(
        "principal-a",
        async () => {
          events.push("auth:first");
        },
      ),
      {
        persistenceSafe: false,
        principalId: "principal-a",
        status: "retry",
      },
    );
    assert.equal(journal.value, null);
    assert.deepEqual(events, ["protected:first"]);

    assert.deepEqual(
      await first.recover(null, async () => {
        events.push("auth:retry");
      }),
      {
        persistenceSafe: false,
        principalId: "principal-a",
        status: "retry",
      },
    );
    assert.deepEqual(events, [
      "protected:first",
      "protected:first",
    ]);

    // Model a process death after the nondurable marker failure. Because the
    // auth boundary never committed, the surviving principal data was never
    // exposed to a signed-out or different-principal session.
    journal.setFailSet(false);
    exactCleanupFails = false;
    const relaunched = coordinator({
      clearTerminalPrincipal: async () => {
        events.push("protected:relaunch");
      },
      memory: journal,
    });
    assert.deepEqual(
      await relaunched.purgeTerminal("principal-a", async () => {
        events.push("auth:relaunch");
      }),
      {
        persistenceSafe: true,
        principalId: "principal-a",
        status: "clean",
      },
    );
    assert.deepEqual(events, [
      "protected:first",
      "protected:first",
      "auth:relaunch",
      "protected:relaunch",
    ]);
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
