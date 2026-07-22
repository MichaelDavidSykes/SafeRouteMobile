import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  findRestoredWorkspaceIds,
  findVerifiedRestoredWorkspaceIds,
  reconcileUnavailableWorkspaceIds,
} from "../src/features/workspaces/workspaceMembershipRevalidation";

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

  it("automatically restores only fresh workspaces that pass scoped verification", async () => {
    const verifiedIds: string[] = [];
    const restored = await findVerifiedRestoredWorkspaceIds({
      freshWorkspaces: WORKSPACES,
      unavailableWorkspaceIds: [" workspace-a ", "workspace-b", "workspace-c"],
      verifyWorkspace: async (workspaceId) => {
        verifiedIds.push(workspaceId);
        return workspaceId === "workspace-a";
      },
    });

    assert.deepEqual(verifiedIds, ["workspace-a", "workspace-b"]);
    assert.deepEqual(restored, ["workspace-a"]);
  });

  it("does not verify unavailable workspaces omitted by the fresh catalog", async () => {
    let verificationCount = 0;
    const restored = await findVerifiedRestoredWorkspaceIds({
      freshWorkspaces: [{ id: "workspace-b", name: "West" }],
      unavailableWorkspaceIds: ["workspace-a"],
      verifyWorkspace: async () => {
        verificationCount += 1;
        return true;
      },
    });

    assert.equal(verificationCount, 0);
    assert.deepEqual(restored, []);
  });

  it("propagates fatal verification failures such as session expiry", async () => {
    const sessionExpired = new Error("session expired");

    await assert.rejects(
      () => findVerifiedRestoredWorkspaceIds({
        freshWorkspaces: WORKSPACES,
        unavailableWorkspaceIds: ["workspace-a"],
        verifyWorkspace: async () => {
          throw sessionExpired;
        },
      }),
      (error) => error === sessionExpired,
    );
  });

  it("detects restoration even when a different omission keeps the set size unchanged", () => {
    assert.deepEqual(
      findRestoredWorkspaceIds(
        ["workspace-a"],
        ["workspace-b"],
      ),
      ["workspace-a"],
    );
  });
});
