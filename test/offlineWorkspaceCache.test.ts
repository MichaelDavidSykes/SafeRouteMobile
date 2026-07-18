import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS,
  createTerminalWorkspacePrincipalRevocationRecord,
  createWorkspaceRecoveryRevocationRecord,
  createSerializedWorkspaceMutationCoordinator,
  createSerializedWorkspaceRecoveryExecutor,
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  isTerminalWorkspacePrincipalRevocationRecord,
  parseOfflineWorkspaceCacheRecord,
  parseWorkspaceRecoveryRevocationRecord,
  persistLatestOfflineWorkspaceSelection,
  persistTerminalWorkspacePrincipalRevocation,
  persistWorkspaceRecoveryWithFallback,
} from "../src/features/workspaces/offlineWorkspaceCacheCore";

const CONTEXT = {
  activeWorkspaceId: "workspace-b",
  workspaces: [
    { id: "workspace-a", name: "Alpha Operations" },
    { id: "workspace-b", name: "Bravo Operations" },
  ],
};
const offlineWorkspaceCacheSource = () =>
  readFileSync("src/features/workspaces/offlineWorkspaceCache.ts", "utf8");

describe("offline active workspace cache", () => {
  it("keeps storage failures inside fail-closed recovery and opportunistic migration boundaries", () => {
    const source = offlineWorkspaceCacheSource();

    assert.match(
      source,
      /migrateOfflineWorkspaceCatalogFromRouteCache[\s\S]*try \{[\s\S]*executeWorkspaceRecovery[\s\S]*catch \{[\s\S]*Legacy migration is opportunistic[\s\S]*return null/,
    );
    assert.match(
      source,
      /if \(Number\.isFinite\(authoritativeCatalogStoredAtMs\)\) \{[\s\S]*catalogStoredAtMs: authoritativeCatalogStoredAtMs[\s\S]*\} else \{[\s\S]*loadOfflineWorkspaceRecordInternal[\s\S]*Continue into fallback-first recovery[\s\S]*persistWorkspaceRecoveryWithFallback/,
    );
  });

  it("fences terminally revoked principals across workspace reads, writes, and recovery", () => {
    const source = offlineWorkspaceCacheSource();

    assert.match(
      source,
      /clearOfflineWorkspacePrincipal[\s\S]*terminalRevokedPrincipalIds\.add[\s\S]*persistTerminalWorkspacePrincipalRevocation/,
    );
    assert.match(
      source,
      /createSerializedWorkspaceMutationCoordinator[\s\S]*enqueueGlobal/,
    );
    assert.match(
      source,
      /unavailableWorkspaceIds !== null[\s\S]*globallyProcessRevoked[\s\S]*verifyRelatedCachesAbsent\(\)[\s\S]*allWorkspaceContextsRevoked = false/,
    );
    assert.match(
      source,
      /raw === null && globallyProcessRevoked[\s\S]*persistTerminalWorkspacePrincipalRevocation[\s\S]*verifyRelatedCachesAbsent\(\)/,
    );
    assert.match(
      source,
      /saveOfflineWorkspaceContext[\s\S]*hasBlockingWorkspaceRevocation/,
    );
    assert.match(
      source,
      /persistOfflineWorkspaceRecovery[\s\S]*isTerminalWorkspacePrincipalRevocationRecord[\s\S]*return "revoked"/,
    );
    assert.match(
      source,
      /activateOfflineWorkspacePrincipal[\s\S]*verifyRelatedCachesAbsent[\s\S]*deleteItemAsync[\s\S]*terminalRevokedPrincipalIds\.delete/,
    );
  });

  it("round-trips a principal-scoped validated catalog and active workspace", () => {
    const record = createOfflineWorkspaceCacheRecord(CONTEXT, "user-a", 1_000);

    assert.deepEqual(parseOfflineWorkspaceCacheRecord(record, "user-a", 2_000), {
      ...CONTEXT,
      catalogStoredAtMs: 1_000,
      principalId: "user-a",
      retentionStoredAtMs: 1_000,
      unavailableWorkspaceIds: [],
    });
    assert.equal(parseOfflineWorkspaceCacheRecord(record, "user-b", 2_000), null);
  });

  it("drops stale active ids and rejects expired, future, or malformed records", () => {
    const record = createOfflineWorkspaceCacheRecord(CONTEXT, "user-a", 1_000);
    const staleActive = createOfflineWorkspaceCacheRecord({
      ...CONTEXT,
      activeWorkspaceId: "revoked",
    }, "user-a", 1_000);

    assert.equal(staleActive.value.activeWorkspaceId, null);
    assert.equal(
      parseOfflineWorkspaceCacheRecord(
        record,
        "user-a",
        1_000 + OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS + 1,
      ),
      null,
    );
    assert.equal(parseOfflineWorkspaceCacheRecord(record, "user-a", 999), null);
    assert.equal(parseOfflineWorkspaceCacheRecord({}, "user-a"), null);
    assert.equal(
      parseOfflineWorkspaceCacheRecord({ ...record, schema: 1 }, "user-a", 2_000),
      null,
    );
    assert.equal(
      parseOfflineWorkspaceCacheRecord(
        { ...record, catalogStoredAtMs: 999 },
        "user-a",
        2_000,
      ),
      null,
    );
  });

  it("keeps legacy schema age unknown without moving its original expiry basis", () => {
    const current = createOfflineWorkspaceCacheRecord(CONTEXT, "user-a", 1_000);
    const legacyValue = {
      principalId: current.principalId,
      schema: 3,
      storedAtMs: 1_000,
      value: current.value,
    };

    assert.deepEqual(
      parseOfflineWorkspaceCacheRecord(legacyValue, "user-a", 2_000),
      {
        ...CONTEXT,
        catalogStoredAtMs: null,
        principalId: "user-a",
        retentionStoredAtMs: 1_000,
        unavailableWorkspaceIds: [],
      },
    );
    assert.equal(
      parseOfflineWorkspaceCacheRecord(
        legacyValue,
        "user-a",
        1_000 + OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS + 1,
      ),
      null,
    );
  });

  it("preserves authoritative catalog age across selection-only persistence", async () => {
    const current = parseOfflineWorkspaceCacheRecord(
      createOfflineWorkspaceCacheRecord(CONTEXT, "user-a", 1_000),
      "user-a",
      2_000,
    );
    assert.ok(current);
    let persistedFreshness: {
      catalogStoredAtMs: number | null;
      retentionStoredAtMs: number | null;
    } | null = null;

    const selected = await persistLatestOfflineWorkspaceSelection({
      loadCurrent: async () => current,
      persistContext: async (_context, freshness) => {
        persistedFreshness = freshness;
      },
      principalId: "user-a",
      workspaceId: "workspace-a",
    });

    assert.deepEqual(persistedFreshness, {
      catalogStoredAtMs: 1_000,
      retentionStoredAtMs: 1_000,
    });
    assert.equal(selected?.activeWorkspaceId, "workspace-a");
    assert.equal(selected?.catalogStoredAtMs, 1_000);
    assert.equal(selected?.retentionStoredAtMs, 1_000);
  });

  it("refuses to persist a selection without an immutable retention basis", async () => {
    assert.equal(
      await persistLatestOfflineWorkspaceSelection({
        loadCurrent: async () => ({
          ...CONTEXT,
          catalogStoredAtMs: null,
          principalId: "user-a",
          retentionStoredAtMs: null,
          unavailableWorkspaceIds: [],
        }),
        persistContext: async () => {
          throw new Error("unsafe selection must not persist");
        },
        principalId: "user-a",
        workspaceId: "workspace-a",
      }),
      null,
    );
  });

  it("serializes writes so a slower old selection cannot replace the latest workspace", async () => {
    let releaseFirstWrite: (() => void) | null = null;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    const completedValues: string[] = [];
    const writeRecord = createSerializedWorkspaceRecordWriter(async (_key, value) => {
      if (value === "workspace-a") {
        await firstWriteGate;
      }
      completedValues.push(value);
    });

    const firstWrite = writeRecord("member@example.com", "workspace-a");
    const latestWrite = writeRecord("member@example.com", "workspace-b");
    await Promise.resolve();
    assert.deepEqual(completedValues, []);

    releaseFirstWrite?.();
    await Promise.all([firstWrite, latestWrite]);
    assert.deepEqual(completedValues, ["workspace-a", "workspace-b"]);
  });

  it("atomically excludes durable denied workspace ids from the cached catalog", () => {
    const record = createOfflineWorkspaceCacheRecord({
      ...CONTEXT,
      unavailableWorkspaceIds: [" workspace-b ", "workspace-b", ""],
    }, "user-a", 1_000);

    assert.deepEqual(parseOfflineWorkspaceCacheRecord(record, "user-a", 2_000), {
      activeWorkspaceId: "workspace-a",
      catalogStoredAtMs: 1_000,
      principalId: "user-a",
      retentionStoredAtMs: 1_000,
      unavailableWorkspaceIds: ["workspace-b"],
      workspaces: [CONTEXT.workspaces[0]],
    });
    assert.equal(parseOfflineWorkspaceCacheRecord(record, "user-b", 2_000), null);
    assert.equal(
      parseOfflineWorkspaceCacheRecord({
        ...record,
        value: { ...record.value, unavailableWorkspaceIds: "workspace-b" },
      }, "user-a", 2_000),
      null,
    );
  });

  it("round-trips a principal-bound fallback recovery revocation", () => {
    const record = createWorkspaceRecoveryRevocationRecord(
      " user-a ",
      ["workspace-b", " workspace-a ", "workspace-b"],
    );
    assert.deepEqual(
      parseWorkspaceRecoveryRevocationRecord(record, "user-a"),
      ["workspace-a", "workspace-b"],
    );
    assert.equal(parseWorkspaceRecoveryRevocationRecord(record, "user-b"), null);
    assert.equal(parseWorkspaceRecoveryRevocationRecord("invalid", "user-a"), null);
  });

  it("strictly binds a terminal principal revocation marker", () => {
    const marker =
      createTerminalWorkspacePrincipalRevocationRecord(" user-a ");
    assert.equal(
      isTerminalWorkspacePrincipalRevocationRecord(
        marker,
        "user-a",
      ),
      true,
    );
    assert.equal(
      isTerminalWorkspacePrincipalRevocationRecord(
        marker,
        "user-b",
      ),
      false,
    );
    assert.equal(
      isTerminalWorkspacePrincipalRevocationRecord(
        JSON.stringify({
          kind: "terminal",
          principalId: "user-a",
          schema: 1,
          unexpected: true,
        }),
        "user-a",
      ),
      false,
    );
  });

  it("persists and verifies the terminal marker before removing workspace context", async () => {
    const calls: string[] = [];
    let marker: string | null = null;
    let context: string | null = "sensitive-workspace";
    const expectedMarker =
      createTerminalWorkspacePrincipalRevocationRecord("user-a");

    await persistTerminalWorkspacePrincipalRevocation({
      marker: expectedMarker,
      persistMarker: async (value) => {
        calls.push("marker");
        marker = value;
      },
      readContext: async () => context,
      readMarker: async () => marker,
      removeContext: async () => {
        calls.push("context");
        context = null;
      },
    });

    assert.deepEqual(calls, ["marker", "context"]);
    assert.equal(marker, expectedMarker);
    assert.equal(context, null);
  });

  it("does not remove workspace context when terminal marker readback fails", async () => {
    let contextRemoved = false;
    await assert.rejects(
      persistTerminalWorkspacePrincipalRevocation({
        marker:
          createTerminalWorkspacePrincipalRevocationRecord(
            "user-a",
          ),
        persistMarker: async () => undefined,
        readContext: async () => "sensitive-workspace",
        readMarker: async () => null,
        removeContext: async () => {
          contextRemoved = true;
        },
      }),
      /revocation could not be verified/,
    );
    assert.equal(contextRemoved, false);
  });

  it("awaits every primary recovery write before clearing its fallback revocation", async () => {
    const calls: string[] = [];
    const result = await persistWorkspaceRecoveryWithFallback({
      persistFallback: async () => {
        calls.push("fallback");
      },
      persistPrimary: [
        async () => { calls.push("context"); },
        async () => { calls.push("purge-a"); },
        async () => { calls.push("purge-b"); },
      ],
      clearFallback: async () => {
        calls.push("clear-fallback");
      },
    });

    assert.equal(result, "persisted");
    assert.deepEqual(
      calls,
      ["fallback", "context", "purge-a", "purge-b", "clear-fallback"],
    );
  });

  it("retains a fallback revocation whenever primary recovery is incomplete", async () => {
    assert.equal(
      await persistWorkspaceRecoveryWithFallback({
        persistFallback: async () => undefined,
        persistPrimary: [
          async () => undefined,
          async () => { throw new Error("route purge failed"); },
        ],
        clearFallback: async () => {
          throw new Error("must not clear");
        },
      }),
      "revoked",
    );
    assert.equal(
      await persistWorkspaceRecoveryWithFallback({
        persistFallback: async () => {
          throw new Error("fallback failed");
        },
        persistPrimary: [async () => { throw new Error("context failed"); }],
        clearFallback: async () => undefined,
      }),
      "failed",
    );
  });

  it("does not begin an explicit restoration without a durable fallback", async () => {
    const calls: string[] = [];
    assert.equal(
      await persistWorkspaceRecoveryWithFallback({
        persistFallback: async () => {
          calls.push("fallback");
          throw new Error("secure storage unavailable");
        },
        persistPrimary: [async () => {
          calls.push("primary");
        }],
        clearFallback: async () => {
          calls.push("clear");
        },
        requireFallback: true,
      }),
      "failed",
    );
    assert.deepEqual(calls, ["fallback"]);
  });

  it("serializes each principal recovery through fallback clear or retention", async () => {
    let releaseFirstPrimary: (() => void) | null = null;
    let markFirstPrimaryStarted: (() => void) | null = null;
    const firstPrimaryGate = new Promise<void>((resolve) => {
      releaseFirstPrimary = resolve;
    });
    const firstPrimaryStarted = new Promise<void>((resolve) => {
      markFirstPrimaryStarted = resolve;
    });
    const executeRecovery = createSerializedWorkspaceRecoveryExecutor();
    const calls: string[] = [];
    let fallback: string | null = null;

    const firstRecovery = executeRecovery("user-a", () =>
      persistWorkspaceRecoveryWithFallback({
        persistFallback: async () => {
          fallback = "first";
          calls.push("first-fallback");
        },
        persistPrimary: [async () => {
          calls.push("first-primary-start");
          markFirstPrimaryStarted?.();
          await firstPrimaryGate;
          calls.push("first-primary-end");
        }],
        clearFallback: async () => {
          fallback = null;
          calls.push("first-clear");
        },
      })
    );
    await firstPrimaryStarted;

    const secondRecovery = executeRecovery("user-a", () =>
      persistWorkspaceRecoveryWithFallback({
        persistFallback: async () => {
          fallback = "second";
          calls.push("second-fallback");
        },
        persistPrimary: [async () => {
          calls.push("second-primary");
          throw new Error("route purge failed");
        }],
        clearFallback: async () => {
          throw new Error("must not clear the second fallback");
        },
      })
    );
    assert.deepEqual(calls, ["first-fallback", "first-primary-start"]);

    releaseFirstPrimary?.();
    assert.equal(await firstRecovery, "persisted");
    assert.equal(await secondRecovery, "revoked");
    assert.equal(fallback, "second");
    assert.deepEqual(calls, [
      "first-fallback",
      "first-primary-start",
      "first-primary-end",
      "first-clear",
      "second-fallback",
      "second-primary",
    ]);
  });

  it("serializes ordinary context saves and loads behind an in-flight recovery", async () => {
    const executeWorkspaceOperation = createSerializedWorkspaceRecoveryExecutor();
    let releaseRecovery: (() => void) | null = null;
    let markRecoveryStarted: (() => void) | null = null;
    const recoveryGate = new Promise<void>((resolve) => {
      releaseRecovery = resolve;
    });
    const recoveryStarted = new Promise<void>((resolve) => {
      markRecoveryStarted = resolve;
    });
    const calls: string[] = [];
    const recovery = executeWorkspaceOperation("user-a", async () => {
      calls.push("recovery-start");
      markRecoveryStarted?.();
      await recoveryGate;
      calls.push("recovery-end");
    });
    await recoveryStarted;
    const save = executeWorkspaceOperation("user-a", async () => {
      calls.push("save");
    });
    const load = executeWorkspaceOperation("user-a", async () => {
      calls.push("load");
    });

    await Promise.resolve();
    assert.deepEqual(calls, ["recovery-start"]);
    releaseRecovery?.();
    await Promise.all([recovery, save, load]);
    assert.deepEqual(calls, ["recovery-start", "recovery-end", "save", "load"]);
  });

  it("places global revocation after in-flight writes and before later scoped writes", async () => {
    const mutations = createSerializedWorkspaceMutationCoordinator();
    let revoked = false;
    let storedContext: string | null = null;
    let releaseWrite: (() => void) | null = null;
    let markWriteStarted: (() => void) | null = null;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const writeStarted = new Promise<void>((resolve) => {
      markWriteStarted = resolve;
    });

    const staleWrite = mutations.enqueueScoped("principal-a", async () => {
      if (revoked) {
        return;
      }
      markWriteStarted?.();
      await writeGate;
      storedContext = "stale";
    });
    await writeStarted;

    revoked = true;
    const globalPurge = mutations.enqueueGlobal(async () => {
      storedContext = null;
    });
    const lateWrite = mutations.enqueueScoped("principal-a", async () => {
      if (!revoked) {
        storedContext = "late";
      }
    });

    releaseWrite?.();
    await Promise.all([staleWrite, globalPurge, lateWrite]);
    assert.equal(storedContext, null);
  });

  it("selects review from the latest serialized recovery without replacing its catalog or tombstones", async () => {
    const executeWorkspaceOperation = createSerializedWorkspaceRecoveryExecutor();
    let releaseRecovery: (() => void) | null = null;
    let markRecoveryStarted: (() => void) | null = null;
    const recoveryGate = new Promise<void>((resolve) => {
      releaseRecovery = resolve;
    });
    const recoveryStarted = new Promise<void>((resolve) => {
      markRecoveryStarted = resolve;
    });
    let snapshot = {
      activeWorkspaceId: "workspace-a",
      catalogStoredAtMs: 1_000,
      principalId: "user-a",
      retentionStoredAtMs: 1_000,
      unavailableWorkspaceIds: [] as string[],
      workspaces: CONTEXT.workspaces,
    };

    const recovery = executeWorkspaceOperation("user-a", async () => {
      markRecoveryStarted?.();
      await recoveryGate;
      snapshot = {
        activeWorkspaceId: "workspace-a",
        catalogStoredAtMs: 1_000,
        principalId: "user-a",
        retentionStoredAtMs: 1_000,
        unavailableWorkspaceIds: ["workspace-c"],
        workspaces: [
          ...CONTEXT.workspaces,
          { id: "workspace-d", name: "Delta Operations" },
        ],
      };
    });
    await recoveryStarted;
    const selection = executeWorkspaceOperation("user-a", () =>
      persistLatestOfflineWorkspaceSelection({
        loadCurrent: async () => snapshot,
        persistContext: async (context, freshness) => {
          snapshot = {
            ...context,
            ...freshness,
            principalId: "user-a",
            unavailableWorkspaceIds: context.unavailableWorkspaceIds || [],
          };
        },
        principalId: "user-a",
        workspaceId: "workspace-b",
      })
    );

    releaseRecovery?.();
    await recovery;
    assert.equal((await selection)?.activeWorkspaceId, "workspace-b");
    assert.deepEqual(snapshot, {
      activeWorkspaceId: "workspace-b",
      catalogStoredAtMs: 1_000,
      principalId: "user-a",
      retentionStoredAtMs: 1_000,
      unavailableWorkspaceIds: ["workspace-c"],
      workspaces: [
        ...CONTEXT.workspaces,
        { id: "workspace-d", name: "Delta Operations" },
      ],
    });

    snapshot = {
      activeWorkspaceId: "workspace-a",
      catalogStoredAtMs: 1_000,
      principalId: "user-a",
      retentionStoredAtMs: 1_000,
      unavailableWorkspaceIds: ["workspace-b"],
      workspaces: [CONTEXT.workspaces[0]],
    };
    assert.equal(
      await persistLatestOfflineWorkspaceSelection({
        loadCurrent: async () => snapshot,
        persistContext: async () => {
          throw new Error("denied selection must not persist");
        },
        principalId: "user-a",
        workspaceId: "workspace-b",
      }),
      null,
    );
  });

  it("retains a revocation until a previously failed purge is retried", async () => {
    const executeRecovery = createSerializedWorkspaceRecoveryExecutor();
    let fallback: string | null = null;
    let purgeAttempts = 0;
    const recover = () => executeRecovery("user-a", () =>
      persistWorkspaceRecoveryWithFallback({
        persistFallback: async () => {
          fallback = "workspace-b";
        },
        persistPrimary: [async () => {
          purgeAttempts += 1;
          if (purgeAttempts === 1) {
            throw new Error("route purge failed");
          }
        }],
        clearFallback: async () => {
          fallback = null;
        },
      })
    );

    assert.equal(await recover(), "revoked");
    assert.equal(fallback, "workspace-b");
    assert.equal(await recover(), "persisted");
    assert.equal(fallback, null);
    assert.equal(purgeAttempts, 2);
  });

  it("does not clear a restoration fallback until the old workspace cache is purged", async () => {
    const executeRecovery = createSerializedWorkspaceRecoveryExecutor();
    let fallback: string | null = null;
    let staleRouteCache = true;
    let purgeAttempts = 0;
    const restore = () => executeRecovery("user-a", () =>
      persistWorkspaceRecoveryWithFallback({
        persistFallback: async () => {
          fallback = "workspace-b";
        },
        persistPrimary: [
          async () => undefined,
          async () => {
            purgeAttempts += 1;
            if (purgeAttempts === 1) {
              throw new Error("old workspace purge failed");
            }
            staleRouteCache = false;
          },
        ],
        clearFallback: async () => {
          fallback = null;
        },
        requireFallback: true,
      })
    );

    assert.equal(await restore(), "revoked");
    assert.equal(fallback, "workspace-b");
    assert.equal(staleRouteCache, true);
    assert.equal(await restore(), "persisted");
    assert.equal(fallback, null);
    assert.equal(staleRouteCache, false);
    assert.equal(purgeAttempts, 2);
  });

  it("checks the independent recovery revocation before any workspace cache", () => {
    const source = readFileSync(
      "src/features/workspaces/offlineWorkspaceCache.ts",
      "utf8",
    );
    const revocationRead = source.indexOf("SecureStore.getItemAsync");
    const workspaceRead = source.indexOf("AsyncStorage.getItem");
    assert.ok(revocationRead >= 0 && workspaceRead > revocationRead);
    assert.match(
      source,
      /recoveryRevocation !== null[\s\S]*createRevokedWorkspaceSnapshot/,
    );
    assert.match(
      source,
      /loadOfflineWorkspaceContext[\s\S]*executeWorkspaceRecovery\([\s\S]*recoveryRevocationKey\(principalId\)/,
    );
    assert.match(
      source,
      /saveOfflineWorkspaceContext\([\s\S]*executeWorkspaceRecovery\([\s\S]*saveOfflineWorkspaceContextInternal/,
    );
    assert.match(
      source,
      /persistOfflineWorkspaceRecovery\([\s\S]*executeWorkspaceRecovery\([\s\S]*persistPrimary: \[[\s\S]*saveOfflineWorkspaceContextInternal/,
    );
    assert.match(
      source,
      /persistOfflineReviewWorkspaceSelection\([\s\S]*executeWorkspaceRecovery\([\s\S]*persistLatestOfflineWorkspaceSelection\([\s\S]*loadOfflineWorkspaceContextInternal/,
    );
  });
});
