import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  replaceWorkspaceHandoffTarget,
  resolveWorkspaceHandoffRetarget,
  resolveWorkspaceHandoffSelectionFailure,
  resolveWorkspaceHandoffTargetRemovalRecovery,
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

  it("keeps A safe when C disappears, then retains exact Retry D", async () => {
    const workspaceA = { id: "workspace-a", name: "Central Operations" };
    const workspaceC = { id: "workspace-c", name: "North Response" };
    const workspaceD = { id: "workspace-d", name: "East Response" };
    const requestC = {
      requestedPrincipalId: "principal-a",
      requestedSessionEpoch: 7,
      requestedSourceWorkspaceId: workspaceA.id,
      requestedSourceWorkspaceName: workspaceA.name,
      requestedTargetName: workspaceC.name,
      requestedTargetWorkspaceId: workspaceC.id,
    };
    let publishedWorkspaceId = workspaceA.id;
    let workspaceCAvailable = true;

    const removedCAttempt = await runDurableWorkspaceSelectionAttempt({
      persistTarget: async () => {
        workspaceCAvailable = false;
        return { activeWorkspaceId: workspaceC.id };
      },
      reconcileSource: async () => "persisted" as const,
      reconciliationFailure: "failed" as const,
      resolvePersistedTarget: (persistedSelection) =>
        workspaceCAvailable &&
        persistedSelection.activeWorkspaceId === workspaceC.id
          ? workspaceC
          : null,
    });
    assert.deepEqual(removedCAttempt, {
      reconciliation: "persisted",
      status: "failed",
    });
    assert.equal(publishedWorkspaceId, workspaceA.id);

    const context = {
      availableWorkspaces: [workspaceA, workspaceD],
      catalogBusy: false,
      cleanupPending: false,
      cleanupRequired: false,
      currentPrincipalId: "principal-a",
      currentSessionEpoch: 7,
      currentSourceWorkspaceId: workspaceA.id,
      hasActiveNavigation: false,
      hasPendingNavigation: false,
      selectionPending: false,
      unavailableWorkspaceIds: new Set([workspaceC.id]),
    };
    const requestIdentity = {
      principalId: requestC.requestedPrincipalId,
      sessionEpoch: requestC.requestedSessionEpoch,
      sourceWorkspaceId: requestC.requestedSourceWorkspaceId,
      targetWorkspaceId: requestC.requestedTargetWorkspaceId,
    };
    assert.equal(
      resolveWorkspaceHandoffTargetRemovalRecovery({
        context,
        request: requestIdentity,
      }),
      "choose-alternative",
    );

    const retarget = resolveWorkspaceHandoffRetarget({
      context,
      request: requestIdentity,
      selectedWorkspaceId: workspaceD.id,
    });
    assert.equal(retarget.status, "ready");
    assert.ok(retarget.target);
    const requestD = replaceWorkspaceHandoffTarget({
      request: requestC,
      sourceWorkspaceName: workspaceA.name,
      target: retarget.target,
    });

    const failedDAttempt = await runDurableWorkspaceSelectionAttempt({
      persistTarget: async () => {
        throw new Error("D write failed");
      },
      reconcileSource: async () => "persisted" as const,
      reconciliationFailure: "failed" as const,
      resolvePersistedTarget: () => workspaceD,
    });
    assert.deepEqual(failedDAttempt, {
      reconciliation: "persisted",
      status: "failed",
    });
    assert.equal(
      resolveWorkspaceHandoffSelectionFailure({
        continuationStatus: "ready",
        requestOwnerIsCurrent: true,
        sourceReconciliationPersisted:
          failedDAttempt.reconciliation === "persisted",
      }),
      "retain-retry",
    );
    assert.equal(requestD.requestedTargetWorkspaceId, workspaceD.id);
    assert.equal(requestD.requestedTargetName, workspaceD.name);
    assert.equal(publishedWorkspaceId, workspaceA.id);
  });
});
