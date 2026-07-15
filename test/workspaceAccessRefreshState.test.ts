import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completeWorkspaceCatalogRetry,
  createWorkspaceAccessRefreshState,
  shouldStackWorkspaceAccessControl,
  shouldOfferWorkspaceAccessRefresh,
} from "../src/features/workspaces/workspaceAccessRefreshState";

describe("workspace access refresh state", () => {
  it("explains how a driver with no workspace can regain access", () => {
    const state = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 0,
      loading: false,
      offline: false,
      issue: "none",
    });

    assert.equal(state.title, "No workspace access");
    assert.equal(state.actionLabel, "Check again");
    assert.match(state.detail, /admin.*restore access.*check again/i);
    assert.match(state.accessibilityLabel, /No workspace access.*restore access.*check again/i);
  });

  it("keeps restored-membership recovery distinct when another workspace remains", () => {
    const state = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 2,
      loading: false,
      offline: false,
      issue: "none",
    });

    assert.equal(state.title, "Workspace access changed");
    assert.equal(state.actionLabel, "Refresh");
    assert.match(state.accessibilityHint, /another workspace membership/i);
  });

  it("provides a specific busy state without implying access was restored", () => {
    const noAccessState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 0,
      loading: true,
      offline: false,
      issue: "none",
    });
    const survivorState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 1,
      loading: true,
      offline: false,
      issue: "none",
    });

    assert.equal(noAccessState.title, "Checking workspace access");
    assert.equal(noAccessState.actionLabel, "Checking…");
    assert.match(noAccessState.accessibilityLabel, /No workspace is currently available/i);
    assert.match(survivorState.accessibilityLabel, /Current workspace remains available/i);
  });

  it("offers an honest retry when cached workspace access cannot be verified", () => {
    const onlineState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 2,
      loading: false,
      offline: false,
      issue: "verification-unavailable",
    });
    const offlineState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      loading: false,
      offline: true,
      issue: "verification-unavailable",
    });

    assert.equal(onlineState.title, "Workspace access not verified");
    assert.equal(onlineState.actionLabel, "Try again");
    assert.match(onlineState.detail, /try again.*current access/i);
    assert.equal(offlineState.actionLabel, "Check again");
    assert.match(offlineState.detail, /reconnect.*current access/i);
    assert.match(offlineState.accessibilityHint, /Reconnect, then activate/i);
    assert.doesNotMatch(offlineState.accessibilityHint, /^Reconnects/i);
  });

  it("keeps membership recovery ahead of a transient verification failure", () => {
    const state = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 1,
      loading: false,
      offline: true,
      issue: "verification-unavailable",
    });

    assert.equal(state.title, "Workspace access changed");
    assert.equal(state.actionLabel, "Refresh");
  });

  it("keeps verified membership distinct from offline safety cleanup", () => {
    const onlineState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "offline-safety",
      loading: false,
      offline: false,
    });
    const busyState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "offline-safety",
      loading: true,
      offline: false,
    });

    assert.equal(onlineState.title, "Offline safety needs retry");
    assert.equal(onlineState.actionLabel, "Retry");
    assert.match(onlineState.detail, /protected offline cleanup/i);
    assert.doesNotMatch(onlineState.accessibilityLabel, /not verified/i);
    assert.equal(busyState.title, "Securing offline access");
    assert.equal(busyState.actionLabel, "Securing…");
  });

  it("clears a superseded retry ref and rendered busy state together", () => {
    const retryingRef = { current: true };
    const renderedStates: boolean[] = [];

    assert.equal(
      completeWorkspaceCatalogRetry(retryingRef, (retrying) => {
        renderedStates.push(retrying);
      }),
      true,
    );
    assert.equal(retryingRef.current, false);
    assert.deepEqual(renderedStates, [false]);
  });

  it("keeps retry visible while verification is checking and hides it after success", () => {
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 1,
      catalogLoading: false,
      catalogRetrying: false,
      issue: "verification-unavailable",
    }), true);
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 1,
      catalogLoading: true,
      catalogRetrying: true,
      issue: "verification-unavailable",
    }), true);
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 1,
      catalogLoading: false,
      catalogRetrying: false,
      issue: "none",
    }), false);
  });

  it("does not offer workspace recovery to signed-out or initial-loading users", () => {
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: true,
      authenticated: false,
      availableWorkspaceCount: 0,
      catalogLoading: false,
      catalogRetrying: false,
      issue: "verification-unavailable",
    }), false);
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 0,
      catalogLoading: true,
      catalogRetrying: false,
      issue: "none",
    }), false);
  });

  it("stacks the recovery control on compact screens and at larger text sizes", () => {
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1, width: 375 }), true);
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1.3, width: 430 }), true);
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1, width: 430 }), false);
  });
});
