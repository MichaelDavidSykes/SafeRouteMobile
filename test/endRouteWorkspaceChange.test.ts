import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveEndRouteWorkspaceChangeTarget } from "../src/features/workspaces/endRouteWorkspaceChange";

const workspaces = [
  { id: "workspace-a", name: "Central Operations" },
  { id: "workspace-b", name: "West Corridor" },
];

function resolveTarget(
  overrides: Partial<Parameters<typeof resolveEndRouteWorkspaceChangeTarget>[0]> = {},
) {
  return resolveEndRouteWorkspaceChangeTarget({
    availableWorkspaces: workspaces,
    currentPrincipalId: "principal-a",
    currentSessionEpoch: 7,
    currentSourceWorkspaceId: "workspace-a",
    currentWorkspaceRequestRevision: 11,
    hasActiveNavigation: false,
    hasPendingNavigation: false,
    requestedPrincipalId: "principal-a",
    requestedSessionEpoch: 7,
    requestedSourceWorkspaceId: "workspace-a",
    requestedTargetWorkspaceId: "workspace-b",
    requestedWorkspaceRequestRevision: 11,
    ...overrides,
  });
}

describe("end-route workspace change", () => {
  it("resolves the target only after navigation is absent and request identity is current", () => {
    assert.equal(resolveTarget()?.id, "workspace-b");
    assert.equal(
      resolveTarget({
        currentSourceWorkspaceId: null,
        requestedSourceWorkspaceId: null,
      })?.id,
      "workspace-b",
    );
  });

  it("rejects a replacement journey before cleanup settles", () => {
    assert.equal(resolveTarget({ hasActiveNavigation: true }), null);
    assert.equal(resolveTarget({ hasPendingNavigation: true }), null);
  });

  it("rejects stale principals, session epochs, catalogs, and source workspaces", () => {
    assert.equal(resolveTarget({ currentPrincipalId: "principal-b" }), null);
    assert.equal(resolveTarget({ currentSessionEpoch: 8 }), null);
    assert.equal(resolveTarget({ currentWorkspaceRequestRevision: 12 }), null);
    assert.equal(resolveTarget({ currentSourceWorkspaceId: "workspace-c" }), null);
  });

  it("rejects removed and no-op targets", () => {
    assert.equal(
      resolveTarget({ availableWorkspaces: workspaces.slice(0, 1) }),
      null,
    );
    assert.equal(
      resolveTarget({ requestedTargetWorkspaceId: "workspace-a" }),
      null,
    );
  });
});
