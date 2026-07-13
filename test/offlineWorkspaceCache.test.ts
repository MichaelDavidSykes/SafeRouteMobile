import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS,
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
});
