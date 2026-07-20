import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createWorkspaceHandoffRetryNoticeCopy } from "../src/features/workspaces/workspaceHandoffRetryNoticeCopy";

describe("workspace handoff retry notice copy", () => {
  it("keeps the verified source visible while offering a direct target retry", () => {
    const copy = createWorkspaceHandoffRetryNoticeCopy({
      saving: false,
      sourceWorkspaceName: "Central Operations",
      targetWorkspaceName: "West Corridor",
    });

    assert.equal(copy.title, "Workspace change needed");
    assert.equal(copy.retryLabel, "Retry West Corridor");
    assert.equal(copy.chooseAnotherLabel, "Choose another workspace");
    assert.equal(copy.keepLabel, "Keep Central Operations");
    assert.match(copy.message, /Still using Central Operations/);
    assert.match(copy.accessibilityMessage, /without choosing it again/);
    assert.match(
      copy.chooseAnotherAccessibilityLabel,
      /Central Operations remains active/,
    );
  });

  it("describes durability-first saving without claiming the target is active", () => {
    const copy = createWorkspaceHandoffRetryNoticeCopy({
      saving: true,
      sourceWorkspaceName: "Central Operations",
      targetWorkspaceName: "West Corridor",
    });

    assert.equal(copy.title, "Saving workspace");
    assert.equal(copy.retryLabel, "Saving…");
    assert.match(copy.message, /stays active until verified/);
    assert.match(copy.accessibilityMessage, /remains active/);
  });

  it("makes deferred access checking visible without claiming a retry started", () => {
    const copy = createWorkspaceHandoffRetryNoticeCopy({
      checkingAccess: true,
      saving: false,
      sourceWorkspaceName: "Central Operations",
      targetWorkspaceName: "West Corridor",
    });

    assert.equal(copy.title, "Checking workspace access");
    assert.equal(copy.retryLabel, "Checking…");
    assert.equal(copy.keepLabel, "Keep Central Operations");
    assert.match(copy.message, /Still using Central Operations/);
    assert.match(copy.accessibilityMessage, /while access is verified/);
  });

  it("bounds visible workspace names while preserving full accessibility labels", () => {
    const targetWorkspaceName =
      "West Corridor With A Deliberately Long Operational Workspace Name";
    const copy = createWorkspaceHandoffRetryNoticeCopy({
      saving: false,
      targetWorkspaceName,
    });

    assert.match(copy.retryLabel, /…$/);
    assert.ok(copy.retryLabel.length <= "Retry ".length + 40);
    assert.match(copy.retryAccessibilityLabel, new RegExp(targetWorkspaceName));
    assert.equal(copy.chooseAnotherLabel, "Choose another workspace");
    assert.equal(copy.keepLabel, "Discard change");
    assert.equal(
      copy.keepAccessibilityLabel,
      `Discard the change to ${targetWorkspaceName}`,
    );
  });
});
