import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ApiAuthorizationError,
  ApiRequestError,
  ApiSessionExpiredError,
} from "../src/features/api/apiClientCore";
import {
  excludeUnavailableWorkspaces,
  findAuthoritativelyUnavailableWorkspaceIds,
  getRequestUnavailableWorkspaceId,
  isWorkspaceForbiddenError,
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
    assert.equal(isWorkspaceForbiddenError(new ApiAuthorizationError()), true);
    assert.equal(isWorkspaceForbiddenError(new ApiRequestError("Missing", 404)), false);
    assert.equal(isWorkspaceUnavailableError(new ApiAuthorizationError()), true);
    assert.equal(isWorkspaceUnavailableError(new ApiRequestError("Missing", 404)), true);
    assert.equal(isWorkspaceUnavailableError(new ApiRequestError("Offline", 0)), false);
    assert.equal(isWorkspaceUnavailableError(new ApiRequestError("Server", 500)), false);
    assert.equal(isWorkspaceUnavailableError(new ApiSessionExpiredError()), false);
    assert.equal(isWorkspaceUnavailableError(new Error("Forbidden")), false);
  });

  it("accepts only current authenticated workspace-scoped denials", () => {
    const currentRequest = {
      accessToken: " token-a ",
      handled: false,
      requestActive: true,
      workspaceId: " workspace-a ",
    };

    assert.equal(getRequestUnavailableWorkspaceId({
      ...currentRequest,
      error: new ApiAuthorizationError(),
    }), "workspace-a");
    assert.equal(getRequestUnavailableWorkspaceId({
      ...currentRequest,
      error: new ApiRequestError("Missing", 404),
    }), "workspace-a");

    for (const rejected of [
      { ...currentRequest, accessToken: "" },
      { ...currentRequest, workspaceId: "" },
      { ...currentRequest, handled: true },
      { ...currentRequest, requestActive: false },
    ]) {
      assert.equal(getRequestUnavailableWorkspaceId({
        ...rejected,
        error: new ApiAuthorizationError(),
      }), null);
    }

    for (const error of [
      new ApiSessionExpiredError(),
      new ApiRequestError("Offline", 0),
      new ApiRequestError("Rate limited", 429),
      new ApiRequestError("Server", 500),
    ]) {
      assert.equal(getRequestUnavailableWorkspaceId({
        ...currentRequest,
        error,
      }), null);
    }
  });

  it("deduplicates simultaneous denied viewport chunks", () => {
    let handled = false;
    let callbackCount = 0;

    for (const error of [
      new ApiAuthorizationError(),
      new ApiRequestError("Missing", 404),
    ]) {
      const workspaceId = getRequestUnavailableWorkspaceId({
        accessToken: "token-a",
        error,
        handled,
        requestActive: true,
        workspaceId: "workspace-a",
      });
      if (workspaceId) {
        handled = true;
        callbackCount += 1;
      }
    }

    assert.equal(callbackCount, 1);
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

  it("detects cached and route-bound workspaces omitted by a fresh authoritative catalog", () => {
    assert.deepEqual(
      findAuthoritativelyUnavailableWorkspaceIds({
        candidateWorkspaceIds: ["workspace-c", " route-only ", ""],
        freshWorkspaces: [WORKSPACES[0]],
        knownWorkspaces: WORKSPACES.slice(0, 2),
      }),
      ["workspace-b", "workspace-c", "route-only"],
    );
  });
});
