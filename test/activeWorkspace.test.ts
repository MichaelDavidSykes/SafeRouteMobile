import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canRetainRouteWorkspace,
  findWorkspace,
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
  resolveReviewWorkspaceAfterNavigationEnd,
} from "../src/features/workspaces/activeWorkspace";

const WORKSPACES = [
  { id: "workspace-a", name: "Alpha Operations" },
  { id: "workspace-b", name: "Bravo Operations" },
];

describe("active SafeRoute workspace", () => {
  it("normalizes and deduplicates the authoritative catalog", () => {
    assert.deepEqual(
      normalizeWorkspaceCatalog([
        { id: " workspace-a ", name: " Alpha   Operations " },
        { id: "workspace-a", name: "Duplicate" },
        { id: "", name: "Missing id" },
      ]),
      [{ id: "workspace-a", name: "Alpha Operations" }],
    );
  });

  it("keeps a valid current workspace ahead of the server preference", () => {
    assert.deepEqual(
      resolveActiveWorkspace(WORKSPACES, "workspace-b", "workspace-a"),
      WORKSPACES[1],
    );
  });

  it("uses a valid server preference but never silently chooses the first of many", () => {
    assert.deepEqual(resolveActiveWorkspace(WORKSPACES, null, "workspace-b"), WORKSPACES[1]);
    assert.equal(resolveActiveWorkspace(WORKSPACES, null, null), null);
    assert.equal(resolveActiveWorkspace(WORKSPACES, "revoked", null), null);
  });

  it("auto-selects the only authorized workspace and fails closed for an empty catalog", () => {
    assert.deepEqual(resolveActiveWorkspace([WORKSPACES[0]]), WORKSPACES[0]);
    assert.equal(resolveActiveWorkspace([]), null);
    assert.equal(findWorkspace(WORKSPACES, "missing"), null);
  });

  it("restores only the ended navigation workspace for review after local End", () => {
    assert.deepEqual(
      resolveReviewWorkspaceAfterNavigationEnd({
        endedWorkspaceId: " workspace-b ",
        unavailableWorkspaceIds: [],
        workspaces: WORKSPACES,
      }),
      WORKSPACES[1],
    );
    assert.equal(
      resolveReviewWorkspaceAfterNavigationEnd({
        endedWorkspaceId: "workspace-b",
        unavailableWorkspaceIds: ["workspace-b"],
        workspaces: WORKSPACES,
      }),
      null,
    );
    assert.equal(
      resolveReviewWorkspaceAfterNavigationEnd({
        endedWorkspaceId: "missing",
        unavailableWorkspaceIds: [],
        workspaces: WORKSPACES,
      }),
      null,
    );
    assert.equal(
      resolveReviewWorkspaceAfterNavigationEnd({
        endedWorkspaceId: null,
        unavailableWorkspaceIds: [],
        workspaces: WORKSPACES,
      }),
      null,
    );
  });

  it("retains only public guest routes or routes in an authorized workspace", () => {
    assert.equal(canRetainRouteWorkspace(WORKSPACES, "guest", null), true);
    assert.equal(canRetainRouteWorkspace(WORKSPACES, "saved", null), false);
    assert.equal(canRetainRouteWorkspace(WORKSPACES, "guest", "workspace-b"), true);
    assert.equal(canRetainRouteWorkspace(WORKSPACES, "saved", "workspace-b"), true);
    assert.equal(canRetainRouteWorkspace(WORKSPACES, "guest", "revoked"), false);
    assert.equal(canRetainRouteWorkspace(WORKSPACES, "saved", "revoked"), false);
    assert.equal(canRetainRouteWorkspace([], "guest", "workspace-a"), false);
  });
});
