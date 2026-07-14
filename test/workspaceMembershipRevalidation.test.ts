import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { reconcileUnavailableWorkspaceIds } from "../src/features/workspaces/workspaceMembershipRevalidation";

const WORKSPACES = [
  { id: "workspace-a", name: "Central" },
  { id: "workspace-b", name: "West" },
];

describe("workspace membership revalidation", () => {
  it("keeps denied workspaces unavailable during automatic discovery", () => {
    const unavailable = reconcileUnavailableWorkspaceIds({
      allowFreshRestoration: false,
      freshWorkspaces: WORKSPACES,
      unavailableWorkspaceIds: [" workspace-a ", "workspace-c"],
    });

    assert.deepEqual([...unavailable], ["workspace-a", "workspace-c"]);
  });

  it("restores only denied workspaces confirmed by an explicit fresh catalog", () => {
    const unavailable = reconcileUnavailableWorkspaceIds({
      allowFreshRestoration: true,
      freshWorkspaces: WORKSPACES,
      unavailableWorkspaceIds: ["workspace-a", "workspace-c"],
    });

    assert.deepEqual([...unavailable], ["workspace-c"]);
  });

  it("does not restore a denied workspace absent from the fresh catalog", () => {
    const unavailable = reconcileUnavailableWorkspaceIds({
      allowFreshRestoration: true,
      freshWorkspaces: [{ id: "workspace-b", name: "West" }],
      unavailableWorkspaceIds: ["workspace-a"],
    });

    assert.deepEqual([...unavailable], ["workspace-a"]);
  });

  it("supports partial restoration without mutating the active tombstone set", () => {
    const currentUnavailable = new Set(["workspace-a", "workspace-b"]);
    const unavailable = reconcileUnavailableWorkspaceIds({
      allowFreshRestoration: true,
      freshWorkspaces: [{ id: " workspace-b ", name: "West" }],
      unavailableWorkspaceIds: currentUnavailable,
    });

    assert.deepEqual([...unavailable], ["workspace-a"]);
    assert.deepEqual([...currentUnavailable], ["workspace-a", "workspace-b"]);
  });
});
