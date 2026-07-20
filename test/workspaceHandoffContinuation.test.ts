import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canRequestWorkspaceHandoffNavigationCleanupFault,
  canRequestWorkspaceHandoffTargetSelectionFault,
  recoverWorkspaceHandoffNavigationCleanupAfterOwnershipLoss,
  resolveDeferredWorkspaceRefreshAfterSelection,
  resolveWorkspaceHandoffContinuation,
  resolveWorkspaceHandoffSelectionFailure,
  shouldInjectWorkspaceHandoffNavigationCleanupFault,
} from "../src/features/workspaces/workspaceHandoffContinuation";

const workspaces = [
  { id: "workspace-a", name: "Central Operations" },
  { id: "workspace-b", name: "West Corridor" },
];

function decide({
  context: contextOverrides = {},
  request: requestOverrides = {},
}: {
  context?: Partial<
    Parameters<typeof resolveWorkspaceHandoffContinuation>[0]["context"]
  >;
  request?: Partial<
    Parameters<typeof resolveWorkspaceHandoffContinuation>[0]["request"]
  >;
} = {}) {
  return resolveWorkspaceHandoffContinuation({
    context: {
      availableWorkspaces: workspaces,
      catalogBusy: false,
      cleanupPending: false,
      cleanupRequired: false,
      currentPrincipalId: "principal-a",
      currentSessionEpoch: 7,
      currentSourceWorkspaceId: "workspace-a",
      hasActiveNavigation: false,
      hasPendingNavigation: false,
      selectionPending: false,
      unavailableWorkspaceIds: new Set<string>(),
      ...contextOverrides,
    },
    request: {
      principalId: "principal-a",
      sessionEpoch: 7,
      sourceWorkspaceId: "workspace-a",
      targetWorkspaceId: "workspace-b",
      ...requestOverrides,
    },
  });
}

describe("workspace handoff continuation", () => {
  it("arms the navigation cleanup fault only for one exact current handoff", () => {
    const eligible = {
      evidenceSessionIsCurrent: true,
      faultContractEnabled: true,
      handoffPending: true,
      navigationStateIsCurrent: true,
      pendingRequestIsCurrent: true,
      principalIsCurrent: true,
      sessionIsCurrent: true,
      sourceIsCurrent: true,
      targetIsCurrent: true,
    };
    assert.equal(
      canRequestWorkspaceHandoffNavigationCleanupFault(eligible),
      true,
    );
    for (const key of Object.keys(eligible) as Array<keyof typeof eligible>) {
      assert.equal(
        canRequestWorkspaceHandoffNavigationCleanupFault({
          ...eligible,
          [key]: false,
        }),
        false,
        key,
      );
    }
  });

  it("rechecks cleanup-fault ownership after the asynchronous probe", async () => {
    let current = true;
    let requestCount = 0;
    assert.equal(
      await shouldInjectWorkspaceHandoffNavigationCleanupFault({
        faultContractEnabled: true,
        requestFault: async () => {
          requestCount += 1;
          return true;
        },
        requestIsCurrent: () => current,
      }),
      true,
    );
    assert.equal(requestCount, 1);

    assert.equal(
      await shouldInjectWorkspaceHandoffNavigationCleanupFault({
        faultContractEnabled: false,
        requestFault: async () => {
          requestCount += 1;
          return true;
        },
        requestIsCurrent: () => current,
      }),
      false,
    );
    current = false;
    assert.equal(
      await shouldInjectWorkspaceHandoffNavigationCleanupFault({
        faultContractEnabled: true,
        requestFault: async () => {
          requestCount += 1;
          return true;
        },
        requestIsCurrent: () => current,
      }),
      false,
    );
    assert.equal(requestCount, 1);

    current = true;
    assert.equal(
      await shouldInjectWorkspaceHandoffNavigationCleanupFault({
        faultContractEnabled: true,
        requestFault: async () => {
          current = false;
          return true;
        },
        requestIsCurrent: () => current,
      }),
      false,
    );
    assert.equal(
      await shouldInjectWorkspaceHandoffNavigationCleanupFault({
        faultContractEnabled: true,
        requestFault: async () => {
          throw new Error("contract unavailable");
        },
        requestIsCurrent: () => true,
      }),
      false,
    );
  });

  it("performs the real clear if handoff ownership is lost while tracking stop settles", async () => {
    let clearCount = 0;
    assert.equal(
      await recoverWorkspaceHandoffNavigationCleanupAfterOwnershipLoss({
        clearNavigation: async () => {
          clearCount += 1;
          return true;
        },
        requestIsCurrent: () => true,
      }),
      false,
    );
    assert.equal(clearCount, 0);
    assert.equal(
      await recoverWorkspaceHandoffNavigationCleanupAfterOwnershipLoss({
        clearNavigation: async () => {
          clearCount += 1;
          return true;
        },
        requestIsCurrent: () => false,
      }),
      true,
    );
    assert.equal(clearCount, 1);
    assert.equal(
      await recoverWorkspaceHandoffNavigationCleanupAfterOwnershipLoss({
        clearNavigation: async () => {
          throw new Error("storage unavailable");
        },
        requestIsCurrent: () => false,
      }),
      false,
    );
  });

  it("arms the target fault only for one current post-cleanup retry owner", () => {
    const eligible = {
      completedRouteHandoff: true,
      faultContractEnabled: true,
      requestOwnerIsCurrent: true,
      selectionRetryIsCurrent: true,
      targetIsCurrent: true,
    };
    assert.equal(
      canRequestWorkspaceHandoffTargetSelectionFault(eligible),
      true,
    );
    for (const key of Object.keys(eligible) as Array<keyof typeof eligible>) {
      assert.equal(
        canRequestWorkspaceHandoffTargetSelectionFault({
          ...eligible,
          [key]: false,
        }),
        false,
        key,
      );
    }
  });

  it("retains a direct target retry only after the visible source is restored durably", () => {
    assert.equal(
      resolveWorkspaceHandoffSelectionFailure({
        continuationStatus: "ready",
        requestOwnerIsCurrent: true,
        sourceReconciliationPersisted: true,
      }),
      "retain-retry",
    );
    assert.equal(
      resolveWorkspaceHandoffSelectionFailure({
        continuationStatus: "deferred",
        requestOwnerIsCurrent: true,
        sourceReconciliationPersisted: true,
      }),
      "retain-retry",
    );
  });

  it("fails closed instead of retaining a retry when source reconciliation is unsafe", () => {
    for (const continuationStatus of ["ready", "deferred", "stale"] as const) {
      for (const requestOwnerIsCurrent of [true, false]) {
        assert.equal(
          resolveWorkspaceHandoffSelectionFailure({
            continuationStatus,
            requestOwnerIsCurrent,
            sourceReconciliationPersisted: false,
          }),
          "storage-blocked",
        );
      }
    }
  });

  it("clears retained retry intent after its owner, source, journey, or target becomes stale", () => {
    for (const requestOwnerIsCurrent of [true, false]) {
      assert.equal(
        resolveWorkspaceHandoffSelectionFailure({
          continuationStatus: "stale",
          requestOwnerIsCurrent,
          sourceReconciliationPersisted: true,
        }),
        "clear-stale",
      );
    }
    assert.equal(
      resolveWorkspaceHandoffSelectionFailure({
        continuationStatus: "ready",
        requestOwnerIsCurrent: false,
        sourceReconciliationPersisted: true,
      }),
      "clear-stale",
    );
  });

  it("resumes a deferred refresh for the same request owner after A publishes B", () => {
    assert.equal(
      resolveDeferredWorkspaceRefreshAfterSelection({
        refreshDeferred: true,
        requestOwnerIsCurrent: true,
      }),
      "resume",
    );
    assert.equal(
      resolveDeferredWorkspaceRefreshAfterSelection({
        refreshDeferred: true,
        requestOwnerIsCurrent: false,
      }),
      "discard",
    );
    assert.equal(
      resolveDeferredWorkspaceRefreshAfterSelection({
        refreshDeferred: false,
        requestOwnerIsCurrent: true,
      }),
      "none",
    );
  });

  it("continues the retained target only after cleanup and other writes settle", () => {
    assert.deepEqual(decide(), {
      status: "ready",
      target: workspaces[1],
    });
    for (const context of [
      { cleanupRequired: true },
      { cleanupPending: true },
      { catalogBusy: true },
      { selectionPending: true },
    ]) {
      assert.deepEqual(decide({ context }), {
        status: "deferred",
        target: workspaces[1],
      });
    }
  });

  it("accepts a harmless catalog refresh when source and target identities survive", () => {
    assert.deepEqual(
      decide({
        context: {
          availableWorkspaces: [
            { id: "workspace-a", name: "Central Operations v2" },
            { id: "workspace-b", name: "West Corridor v2" },
          ],
        },
      }),
      {
        status: "ready",
        target: { id: "workspace-b", name: "West Corridor v2" },
      },
    );
  });

  it("rejects stale owners, sources, journeys, and target membership", () => {
    for (const context of [
      { currentPrincipalId: "principal-b" },
      { currentSessionEpoch: 8 },
      { currentSourceWorkspaceId: "workspace-c" },
      { hasActiveNavigation: true },
      { hasPendingNavigation: true },
      { availableWorkspaces: workspaces.slice(0, 1) },
      { unavailableWorkspaceIds: new Set(["workspace-b"]) },
    ]) {
      assert.deepEqual(decide({ context }), {
        status: "stale",
        target: null,
      });
    }
  });
});
