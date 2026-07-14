import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ApiAuthorizationError,
  ApiRequestError,
  ApiSessionExpiredError,
} from "../src/features/api/apiClientCore";
import {
  excludeUnavailableWorkspaces,
  isWorkspaceUnavailableError,
  resolveWorkspaceAccessRecovery,
} from "../src/features/workspaces/workspaceAccessRecovery";

const WORKSPACES = [
  { id: "workspace-a", name: "Alpha Operations" },
  { id: "workspace-b", name: "Bravo Operations" },
  { id: "workspace-c", name: "Charlie Operations" },
];

describe("workspace access recovery", () => {
  it("classifies only request-level workspace 403 and 404 errors", () => {
    assert.equal(isWorkspaceUnavailableError(new ApiAuthorizationError()), true);
    assert.equal(isWorkspaceUnavailableError(new ApiRequestError("Missing", 404)), true);
    assert.equal(isWorkspaceUnavailableError(new ApiRequestError("Offline", 0)), false);
    assert.equal(isWorkspaceUnavailableError(new ApiRequestError("Server", 500)), false);
    assert.equal(isWorkspaceUnavailableError(new ApiSessionExpiredError()), false);
    assert.equal(isWorkspaceUnavailableError(new Error("Forbidden")), false);
  });

  it("ignores a stale denial reported for a workspace that is no longer active", () => {
    assert.deepEqual(
      resolveWorkspaceAccessRecovery(WORKSPACES, "workspace-b", "workspace-a"),
      { status: "ignored" },
    );
  });

  it("removes the denied active workspace and auto-selects the sole survivor", () => {
    assert.deepEqual(
      resolveWorkspaceAccessRecovery(WORKSPACES.slice(0, 2), "workspace-b", " workspace-b "),
      {
        activeWorkspace: WORKSPACES[0],
        status: "recovered",
        workspaces: [WORKSPACES[0]],
      },
    );
  });

  it("requires an explicit choice when multiple authorized workspaces remain", () => {
    assert.deepEqual(
      resolveWorkspaceAccessRecovery(WORKSPACES, "workspace-b", "workspace-b"),
      {
        activeWorkspace: null,
        status: "recovered",
        workspaces: [WORKSPACES[0], WORKSPACES[2]],
      },
    );
  });

  it("returns no active workspace when access to the final workspace is lost", () => {
    assert.deepEqual(
      resolveWorkspaceAccessRecovery([WORKSPACES[0]], "workspace-a", "workspace-a"),
      {
        activeWorkspace: null,
        status: "recovered",
        workspaces: [],
      },
    );
  });

  it("keeps denied workspace ids out of cached and refreshed catalogs", () => {
    assert.deepEqual(
      excludeUnavailableWorkspaces(
        [...WORKSPACES, { id: " workspace-b ", name: "Duplicate" }],
        ["workspace-b", "missing"],
      ),
      [WORKSPACES[0], WORKSPACES[2]],
    );
  });
});
