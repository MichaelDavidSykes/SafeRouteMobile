import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS,
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  parseOfflineWorkspaceCacheRecord,
  persistOrClearWorkspaceRecovery,
} from "../src/features/workspaces/offlineWorkspaceCacheCore";

const CONTEXT = {
  activeWorkspaceId: "workspace-b",
  workspaces: [
    { id: "workspace-a", name: "Alpha Operations" },
    { id: "workspace-b", name: "Bravo Operations" },
  ],
};

describe("offline active workspace cache", () => {
  it("round-trips a principal-scoped validated catalog and active workspace", () => {
    const record = createOfflineWorkspaceCacheRecord(CONTEXT, "user-a", 1_000);

    assert.deepEqual(parseOfflineWorkspaceCacheRecord(record, "user-a", 2_000), {
      ...CONTEXT,
      principalId: "user-a",
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
      principalId: "user-a",
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

  it("removes the stale catalog when denied-workspace persistence fails", async () => {
    const calls: string[] = [];
    const result = await persistOrClearWorkspaceRecovery({
      persist: async () => {
        calls.push("persist");
        throw new Error("storage write failed");
      },
      clear: async () => {
        calls.push("clear");
      },
    });

    assert.equal(result, "cleared");
    assert.deepEqual(calls, ["persist", "clear"]);
    assert.equal(
      await persistOrClearWorkspaceRecovery({
        persist: async () => {
          throw new Error("storage write failed");
        },
        clear: async () => {
          throw new Error("storage clear failed");
        },
      }),
      "failed",
    );
  });
});
