import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS,
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  parseOfflineWorkspaceCacheRecord,
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
});
