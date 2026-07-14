import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createWorkspaceAccessRefreshState,
  shouldStackWorkspaceAccessControl,
} from "../src/features/workspaces/workspaceAccessRefreshState";

describe("workspace access refresh state", () => {
  it("explains how a driver with no workspace can regain access", () => {
    const state = createWorkspaceAccessRefreshState({
      availableWorkspaceCount: 0,
      loading: false,
    });

    assert.equal(state.title, "No workspace access");
    assert.equal(state.actionLabel, "Check again");
    assert.match(state.detail, /admin.*restore access.*check again/i);
    assert.match(state.accessibilityLabel, /No workspace access.*restore access.*check again/i);
  });

  it("keeps restored-membership recovery distinct when another workspace remains", () => {
    const state = createWorkspaceAccessRefreshState({
      availableWorkspaceCount: 2,
      loading: false,
    });

    assert.equal(state.title, "Workspace access changed");
    assert.equal(state.actionLabel, "Refresh");
    assert.match(state.accessibilityHint, /another workspace membership/i);
  });

  it("provides a specific busy state without implying access was restored", () => {
    const noAccessState = createWorkspaceAccessRefreshState({
      availableWorkspaceCount: 0,
      loading: true,
    });
    const survivorState = createWorkspaceAccessRefreshState({
      availableWorkspaceCount: 1,
      loading: true,
    });

    assert.equal(noAccessState.title, "Checking workspace access");
    assert.equal(noAccessState.actionLabel, "Checking…");
    assert.match(noAccessState.accessibilityLabel, /No workspace is currently available/i);
    assert.match(survivorState.accessibilityLabel, /Current workspace remains available/i);
  });

  it("stacks the recovery control on compact screens and at larger text sizes", () => {
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1, width: 375 }), true);
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1.3, width: 430 }), true);
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1, width: 430 }), false);
  });
});
