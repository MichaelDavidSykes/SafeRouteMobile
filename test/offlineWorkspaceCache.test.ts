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
  it("round-trips a user-scoped validated catalog and active workspace", () => {
    const record = createOfflineWorkspaceCacheRecord(CONTEXT, 1_000);

    assert.deepEqual(parseOfflineWorkspaceCacheRecord(record, 2_000), CONTEXT);
  });

  it("drops stale active ids and rejects expired, future, or malformed records", () => {
    const record = createOfflineWorkspaceCacheRecord(CONTEXT, 1_000);
    const staleActive = createOfflineWorkspaceCacheRecord({
      ...CONTEXT,
      activeWorkspaceId: "revoked",
    }, 1_000);

    assert.equal(staleActive.value.activeWorkspaceId, null);
    assert.equal(
      parseOfflineWorkspaceCacheRecord(
        record,
        1_000 + OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS + 1,
      ),
      null,
    );
    assert.equal(parseOfflineWorkspaceCacheRecord(record, 999), null);
    assert.equal(parseOfflineWorkspaceCacheRecord({}), null);
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
