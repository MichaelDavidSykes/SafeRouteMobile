import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
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
      verificationUnavailable: false,
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
      verificationUnavailable: false,
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
      verificationUnavailable: false,
    });
    const survivorState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 1,
      loading: true,
      offline: false,
      verificationUnavailable: false,
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
      verificationUnavailable: true,
    });
    const offlineState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      loading: false,
      offline: true,
      verificationUnavailable: true,
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
      verificationUnavailable: true,
    });

    assert.equal(state.title, "Workspace access changed");
    assert.equal(state.actionLabel, "Refresh");
  });

  it("keeps retry visible while verification is checking and hides it after success", () => {
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 1,
      catalogError: true,
      catalogLoading: false,
      catalogRetrying: false,
    }), true);
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 1,
      catalogError: false,
      catalogLoading: true,
      catalogRetrying: true,
    }), true);
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 1,
      catalogError: false,
      catalogLoading: false,
      catalogRetrying: false,
    }), false);
  });

  it("does not offer workspace recovery to signed-out or initial-loading users", () => {
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: true,
      authenticated: false,
      availableWorkspaceCount: 0,
      catalogError: true,
      catalogLoading: false,
      catalogRetrying: false,
    }), false);
    assert.equal(shouldOfferWorkspaceAccessRefresh({
      accessRecoveryPending: false,
      authenticated: true,
      availableWorkspaceCount: 0,
      catalogError: false,
      catalogLoading: true,
      catalogRetrying: false,
    }), false);
  });

  it("stacks the recovery control on compact screens and at larger text sizes", () => {
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1, width: 375 }), true);
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1.3, width: 430 }), true);
    assert.equal(shouldStackWorkspaceAccessControl({ fontScale: 1, width: 430 }), false);
  });
});
