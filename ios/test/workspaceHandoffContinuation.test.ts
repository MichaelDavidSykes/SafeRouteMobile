import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canRequestWorkspaceHandoffNavigationCleanupFault,
  canRequestWorkspaceHandoffTargetSelectionFault,
  recoverWorkspaceHandoffNavigationCleanupAfterOwnershipLoss,
  resolveDeferredWorkspaceRefreshAfterSelection,
  resolveWorkspaceHandoffAlternativeRecovery,
  resolveWorkspaceHandoffContinuation,
  resolveWorkspaceHandoffRetarget,
  resolveWorkspaceHandoffRetargetOwnership,
  resolveWorkspaceHandoffSelectionFailure,
  resolveWorkspaceHandoffTargetRemovalRecovery,
  shouldInjectWorkspaceHandoffNavigationCleanupFault,
} from "../src/features/workspaces/workspaceHandoffContinuation";

const workspaces = [
  { id: "workspace-a", name: "Central Operations" },
  { id: "workspace-b", name: "West Corridor" },
  { id: "workspace-c", name: "North Response" },
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

function decideRetarget({
  context: contextOverrides = {},
  request: requestOverrides = {},
  selectedWorkspaceId = "workspace-c",
}: {
  context?: Partial<
    Parameters<typeof resolveWorkspaceHandoffRetarget>[0]["context"]
  >;
  request?: Partial<
    Parameters<typeof resolveWorkspaceHandoffRetarget>[0]["request"]
  >;
  selectedWorkspaceId?: string;
} = {}) {
  return resolveWorkspaceHandoffRetarget({
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
    selectedWorkspaceId,
  });
}

describe("workspace handoff continuation", () => {
  it("returns a removed target to direct retry only after exact fresh access is restored", () => {
    assert.equal(
      resolveWorkspaceHandoffAlternativeRecovery({
        continuationStatus: "ready",
        ownershipStatus: "ready",
        reason: "target-removed",
        targetAuthorizationFresh: true,
      }),
      "restore-direct-retry",
    );

    for (const targetAuthorizationFresh of [false, true]) {
      assert.equal(
        resolveWorkspaceHandoffAlternativeRecovery({
          continuationStatus: "ready",
          ownershipStatus: "ready",
          reason: "explicit-choice",
          targetAuthorizationFresh,
        }),
        "retain-alternative",
      );
    }
    assert.equal(
      resolveWorkspaceHandoffAlternativeRecovery({
        continuationStatus: "ready",
        ownershipStatus: "ready",
        reason: "target-removed",
        targetAuthorizationFresh: false,
      }),
      "retain-alternative",
    );
    assert.equal(
      resolveWorkspaceHandoffAlternativeRecovery({
        continuationStatus: "stale",
        ownershipStatus: "ready",
        reason: "target-removed",
        targetAuthorizationFresh: true,
      }),
      "retain-alternative",
    );
  });

  it("defers restored-target recovery while busy and clears stale ownership first", () => {
    assert.equal(
      resolveWorkspaceHandoffAlternativeRecovery({
        continuationStatus: "deferred",
        ownershipStatus: "deferred",
        reason: "target-removed",
        targetAuthorizationFresh: true,
      }),
      "deferred",
    );
    assert.equal(
      resolveWorkspaceHandoffAlternativeRecovery({
        continuationStatus: "ready",
        ownershipStatus: "stale",
        reason: "target-removed",
        targetAuthorizationFresh: true,
      }),
      "clear-stale",
    );
  });

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

  it("replaces a failed handoff target with the latest authorized workspace", () => {
    assert.deepEqual(decideRetarget(), {
      status: "ready",
      target: workspaces[2],
    });
    assert.deepEqual(
      decideRetarget({
        context: {
          availableWorkspaces: [
            workspaces[0],
            workspaces[1],
            { id: "workspace-c", name: "North Response Renamed" },
          ],
        },
      }),
      {
        status: "ready",
        target: { id: "workspace-c", name: "North Response Renamed" },
      },
    );
  });

  it("keeps alternate selection source-owned when the failed target disappears", () => {
    const context = {
      availableWorkspaces: [workspaces[0], workspaces[2]],
      catalogBusy: false,
      cleanupPending: false,
      cleanupRequired: false,
      currentPrincipalId: "principal-a",
      currentSessionEpoch: 7,
      currentSourceWorkspaceId: "workspace-a",
      hasActiveNavigation: false,
      hasPendingNavigation: false,
      selectionPending: false,
      unavailableWorkspaceIds: new Set(["workspace-b"]),
    };
    const request = {
      principalId: "principal-a",
      sessionEpoch: 7,
      sourceWorkspaceId: "workspace-a",
      targetWorkspaceId: "workspace-b",
    };

    assert.equal(
      resolveWorkspaceHandoffRetargetOwnership({ context, request }),
      "ready",
    );
    assert.deepEqual(
      resolveWorkspaceHandoffRetarget({
        context,
        request,
        selectedWorkspaceId: "workspace-c",
      }),
      {
        status: "ready",
        target: workspaces[2],
      },
    );
  });

  it("recovers a removed target into source-owned alternative selection", () => {
    const context = {
      availableWorkspaces: [workspaces[0], workspaces[2]],
      catalogBusy: false,
      cleanupPending: false,
      cleanupRequired: false,
      currentPrincipalId: "principal-a",
      currentSessionEpoch: 7,
      currentSourceWorkspaceId: "workspace-a",
      hasActiveNavigation: false,
      hasPendingNavigation: false,
      selectionPending: false,
      unavailableWorkspaceIds: new Set(["workspace-b"]),
    };
    const request = {
      principalId: "principal-a",
      sessionEpoch: 7,
      sourceWorkspaceId: "workspace-a",
      targetWorkspaceId: "workspace-b",
    };

    assert.equal(
      resolveWorkspaceHandoffTargetRemovalRecovery({ context, request }),
      "choose-alternative",
    );
    for (const deferredContext of [
      { catalogBusy: true },
      { cleanupPending: true },
      { cleanupRequired: true },
      { selectionPending: true },
    ]) {
      assert.equal(
        resolveWorkspaceHandoffTargetRemovalRecovery({
          context: { ...context, ...deferredContext },
          request,
        }),
        "deferred",
      );
    }
    assert.equal(
      resolveWorkspaceHandoffTargetRemovalRecovery({
        context: { ...context, selectionPending: true },
        currentSelectionOwnsPending: true,
        request,
      }),
      "choose-alternative",
    );
  });

  it("clears removed-target recovery after source ownership becomes stale", () => {
    const request = {
      principalId: "principal-a",
      sessionEpoch: 7,
      sourceWorkspaceId: "workspace-a",
      targetWorkspaceId: "workspace-b",
    };
    const context = {
      availableWorkspaces: [workspaces[0], workspaces[2]],
      catalogBusy: false,
      cleanupPending: false,
      cleanupRequired: false,
      currentPrincipalId: "principal-a",
      currentSessionEpoch: 7,
      currentSourceWorkspaceId: "workspace-a",
      hasActiveNavigation: false,
      hasPendingNavigation: false,
      selectionPending: false,
      unavailableWorkspaceIds: new Set(["workspace-b"]),
    };
    for (const staleContext of [
      { currentPrincipalId: "principal-b" },
      { currentSessionEpoch: 8 },
      { currentSourceWorkspaceId: "workspace-c" },
      { hasActiveNavigation: true },
      { hasPendingNavigation: true },
    ]) {
      assert.equal(
        resolveWorkspaceHandoffTargetRemovalRecovery({
          context: { ...context, ...staleContext },
          request,
        }),
        "clear-stale",
      );
    }
  });

  it("treats choosing the verified source as Keep current", () => {
    assert.deepEqual(
      decideRetarget({ selectedWorkspaceId: "workspace-a" }),
      {
        status: "keep-current",
        target: null,
      },
    );
  });

  it("defers or rejects retargeting across every ownership and safety fence", () => {
    for (const context of [
      { catalogBusy: true },
      { cleanupPending: true },
      { cleanupRequired: true },
      { selectionPending: true },
    ]) {
      assert.deepEqual(decideRetarget({ context }), {
        status: "deferred",
        target: null,
      });
    }

    for (const context of [
      { currentPrincipalId: "principal-b" },
      { currentSessionEpoch: 8 },
      { currentSourceWorkspaceId: "workspace-d" },
      { hasActiveNavigation: true },
      { hasPendingNavigation: true },
      { availableWorkspaces: workspaces.slice(0, 2) },
      { unavailableWorkspaceIds: new Set(["workspace-c"]) },
    ]) {
      assert.deepEqual(decideRetarget({ context }), {
        status: "stale",
        target: null,
      });
    }
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
