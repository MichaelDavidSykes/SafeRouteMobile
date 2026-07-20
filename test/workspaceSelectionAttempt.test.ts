import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  replaceWorkspaceHandoffTarget,
  resolveWorkspaceHandoffSelectionFailure,
} from "../src/features/workspaces/workspaceHandoffContinuation";
import { runDurableWorkspaceSelectionAttempt } from "../src/features/workspaces/workspaceSelectionAttempt";

describe("durable workspace selection attempt", () => {
  it("retains B after safe A compensation, then retries selection without cleanup", async () => {
    const workspaceB = { id: "workspace-b", name: "West Corridor" };
    let cleanupCalls = 0;
    let persistCalls = 0;
    let reconcileCalls = 0;
    let publishedWorkspaceId = "workspace-a";

    const failedAttempt = await runDurableWorkspaceSelectionAttempt({
      persistTarget: async () => {
        persistCalls += 1;
        throw new Error("target write failed");
      },
      reconcileSource: async () => {
        reconcileCalls += 1;
        return "persisted" as const;
      },
      reconciliationFailure: "failed" as const,
      resolvePersistedTarget: () => workspaceB,
    });

    assert.deepEqual(failedAttempt, {
      reconciliation: "persisted",
      status: "failed",
    });
    assert.equal(publishedWorkspaceId, "workspace-a");
    assert.equal(
      resolveWorkspaceHandoffSelectionFailure({
        continuationStatus: "ready",
        requestOwnerIsCurrent: true,
        sourceReconciliationPersisted:
          failedAttempt.reconciliation === "persisted",
      }),
      "retain-retry",
    );

    const retryAttempt = await runDurableWorkspaceSelectionAttempt({
      persistTarget: async () => {
        persistCalls += 1;
        return { activeWorkspaceId: workspaceB.id };
      },
      reconcileSource: async () => {
        reconcileCalls += 1;
        return "persisted" as const;
      },
      reconciliationFailure: "failed" as const,
      resolvePersistedTarget: (persistedSelection) =>
        persistedSelection.activeWorkspaceId === workspaceB.id
          ? workspaceB
          : null,
    });

    assert.equal(retryAttempt.status, "verified");
    if (retryAttempt.status === "verified") {
      publishedWorkspaceId = retryAttempt.target.id;
    }
    assert.equal(publishedWorkspaceId, "workspace-b");
    assert.equal(persistCalls, 2);
    assert.equal(reconcileCalls, 1);
    assert.equal(cleanupCalls, 0);
  });

  it("maps a thrown source reconciliation to the fail-closed result", async () => {
    const attempt = await runDurableWorkspaceSelectionAttempt({
      persistTarget: async () => null,
      reconcileSource: async () => {
        throw new Error("source reconciliation failed");
      },
      reconciliationFailure: "failed" as const,
      resolvePersistedTarget: () => null,
    });

    assert.deepEqual(attempt, {
      reconciliation: "failed",
      status: "failed",
    });
    assert.equal(
      resolveWorkspaceHandoffSelectionFailure({
        continuationStatus: "stale",
        requestOwnerIsCurrent: false,
        sourceReconciliationPersisted:
          attempt.status === "failed" &&
          attempt.reconciliation === "persisted",
      }),
      "storage-blocked",
    );
  });

  it("retains replacement C after safe A compensation without restoring B", async () => {
    const originalRequest = {
      requestedPrincipalId: "principal-a",
      requestedSessionEpoch: 7,
      requestedSourceWorkspaceId: "workspace-a",
      requestedSourceWorkspaceName: "Central Operations",
      requestedTargetName: "West Corridor",
      requestedTargetWorkspaceId: "workspace-b",
    };
    const replacementRequest = replaceWorkspaceHandoffTarget({
      request: originalRequest,
      sourceWorkspaceName: "Central Operations Renamed",
      target: { id: "workspace-c", name: "North Response" },
    });

    assert.deepEqual(replacementRequest, {
      requestedPrincipalId: "principal-a",
      requestedSessionEpoch: 7,
      requestedSourceWorkspaceId: "workspace-a",
      requestedSourceWorkspaceName: "Central Operations Renamed",
      requestedTargetName: "North Response",
      requestedTargetWorkspaceId: "workspace-c",
    });
    assert.equal(originalRequest.requestedTargetWorkspaceId, "workspace-b");

    const failedAttempt = await runDurableWorkspaceSelectionAttempt({
      persistTarget: async () => {
        throw new Error("replacement target write failed");
      },
      reconcileSource: async () => "persisted" as const,
      reconciliationFailure: "failed" as const,
      resolvePersistedTarget: () => ({
        id: replacementRequest.requestedTargetWorkspaceId,
        name: replacementRequest.requestedTargetName,
      }),
    });

    assert.deepEqual(failedAttempt, {
      reconciliation: "persisted",
      status: "failed",
    });
    assert.equal(
      resolveWorkspaceHandoffSelectionFailure({
        continuationStatus: "ready",
        requestOwnerIsCurrent: true,
        sourceReconciliationPersisted:
          failedAttempt.reconciliation === "persisted",
      }),
      "retain-retry",
    );
    assert.equal(replacementRequest.requestedTargetWorkspaceId, "workspace-c");
  });
});
