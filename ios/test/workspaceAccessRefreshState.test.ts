import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  completeWorkspaceCatalogRetry,
  createWorkspaceAccessRefreshState,
  getWorkspaceCatalogAgeRefreshDelayMs,
  getWorkspaceCatalogExpiryDelayMs,
  resolveWorkspaceAccessAnnouncement,
  shouldArmAutomaticReconnectAnnouncement,
  shouldStackWorkspaceAccessControl,
  shouldOfferWorkspaceAccessRefresh,
} from "../src/features/workspaces/workspaceAccessRefreshState";

describe("workspace access refresh state", () => {
  it("explains how a driver with no workspace can regain access", () => {
    const state = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 0,
      loading: false,
      networkStatus: "online",
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
      networkStatus: "online",
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
      networkStatus: "online",
      issue: "none",
    });
    const survivorState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 1,
      loading: true,
      networkStatus: "online",
      issue: "none",
    });
    const verificationState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      loading: true,
      networkStatus: "online",
      issue: "verification-unavailable",
    });
    const survivorRecoveryState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 1,
      loading: true,
      networkStatus: "online",
      issue: "verification-unavailable",
    });
    const noAccessRecoveryState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 0,
      loading: true,
      networkStatus: "online",
      issue: "verification-unavailable",
    });

    assert.equal(noAccessState.title, "Checking workspace access");
    assert.equal(noAccessState.actionLabel, "Checking…");
    assert.match(noAccessState.accessibilityLabel, /No workspace is currently available/i);
    assert.equal(survivorState.title, "Checking current access");
    assert.match(survivorState.detail, /review only/i);
    assert.match(survivorState.accessibilityLabel, /Current workspace access is not verified/i);
    assert.equal(verificationState.title, "Checking current access");
    assert.match(verificationState.detail, /review only/i);
    assert.match(verificationState.accessibilityLabel, /workspace list.*review only/i);
    assert.doesNotMatch(verificationState.detail, /restored/i);
    assert.equal(survivorRecoveryState.title, "Checking current access");
    assert.match(survivorRecoveryState.accessibilityLabel, /Current workspace access is not verified/i);
    assert.match(survivorRecoveryState.detail, /review only/i);
    assert.match(noAccessRecoveryState.accessibilityLabel, /No workspace is currently available/i);
  });

  it("offers an honest retry when cached workspace access cannot be verified", () => {
    const onlineState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 2,
      loading: false,
      networkStatus: "online",
      issue: "verification-unavailable",
    });
    const offlineState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      loading: false,
      networkStatus: "offline",
      issue: "verification-unavailable",
    });

    assert.equal(onlineState.title, "Workspace access not verified");
    assert.equal(onlineState.actionLabel, "Try again");
    assert.match(onlineState.detail, /workspace list.*review only/i);
    assert.equal(offlineState.actionLabel, "Check again");
    assert.match(offlineState.detail, /workspace list.*review only/i);
    assert.match(offlineState.accessibilityHint, /Reconnect, then activate/i);
    assert.doesNotMatch(offlineState.accessibilityHint, /^Reconnects/i);
  });

  it("presents connectivity checking instead of an online retry", () => {
    const state = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "checking",
    });

    assert.equal(state.title, "Checking connection");
    assert.equal(state.actionLabel, "Waiting…");
    assert.match(state.accessibilityLabel, /Checking connection.*review only/i);
    assert.doesNotMatch(state.accessibilityLabel, /try again/i);
  });

  it("keeps membership recovery ahead of a transient verification failure", () => {
    const state = createWorkspaceAccessRefreshState({
      accessRecoveryPending: true,
      availableWorkspaceCount: 1,
      loading: false,
      networkStatus: "offline",
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
      networkStatus: "online",
    });
    const busyState = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "offline-safety",
      loading: true,
      networkStatus: "online",
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

  it("announces one iOS checking and failure transition per explicit retry", () => {
    const hourMs = 60 * 60 * 1000;
    const nowMs = 10 * hourMs;
    const checking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      catalogStoredAtMs: nowMs - 6 * hourMs,
      issue: "verification-unavailable",
      loading: true,
      networkStatus: "online",
      nowMs,
      previousPhase: "verification-unavailable",
      retrying: true,
    });
    const duplicateChecking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      catalogStoredAtMs: nowMs - 6 * hourMs,
      issue: "verification-unavailable",
      loading: true,
      networkStatus: "online",
      nowMs,
      previousPhase: checking.phase,
      retrying: true,
    });
    const failed = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      catalogStoredAtMs: nowMs - 6 * hourMs,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "online",
      nowMs,
      previousPhase: duplicateChecking.phase,
      retrying: false,
    });
    const duplicateFailure = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      catalogStoredAtMs: nowMs - 6 * hourMs,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "online",
      nowMs,
      previousPhase: failed.phase,
      retrying: false,
    });

    assert.match(
      checking.announcement || "",
      /Checking current workspace access.*cached 6 hours ago.*review only/i,
    );
    assert.equal(duplicateChecking.announcement, null);
    assert.match(
      failed.announcement || "",
      /Workspace access not verified.*cached 6 hours ago.*Try checking/i,
    );
    assert.equal(duplicateFailure.announcement, null);
  });

  it("announces a cold catalog failure once without requiring a retry", () => {
    const pendingFailure = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: true,
      networkStatus: "online",
      previousPhase: "idle",
      retrying: false,
    });
    const coldFailure = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "online",
      previousPhase: pendingFailure.phase,
      retrying: false,
    });
    const repeatedFailure = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "online",
      previousPhase: coldFailure.phase,
      retrying: false,
    });

    assert.deepEqual(pendingFailure, {
      announcement: null,
      phase: "checking",
    });
    assert.match(coldFailure.announcement || "", /not verified.*again/i);
    assert.equal(coldFailure.phase, "verification-unavailable");
    assert.equal(repeatedFailure.announcement, null);
  });

  it("keeps the announcement pending when retry and loading settle separately", () => {
    const stillLoading = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: true,
      networkStatus: "online",
      previousPhase: "checking",
      retrying: false,
    });
    const failed = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "online",
      previousPhase: stillLoading.phase,
      retrying: false,
    });

    assert.deepEqual(stillLoading, {
      announcement: null,
      phase: "checking",
    });
    assert.match(failed.announcement || "", /Workspace access not verified/i);
  });

  it("announces offline recovery outcomes without presenting cached access as fresh", () => {
    const failed = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "offline",
      previousPhase: "checking",
      retrying: false,
    });
    const offlineSafety = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "offline-safety",
      loading: false,
      networkStatus: "offline",
      previousPhase: "checking",
      retrying: false,
    });

    assert.match(failed.announcement || "", /not verified.*Reconnect/i);
    assert.doesNotMatch(failed.announcement || "", /verified\.$/i);
    assert.match(offlineSafety.announcement || "", /Offline safety needs retry.*Reconnect/i);
  });

  it("announces checking and its offline correction only once", () => {
    const checking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "checking",
      previousPhase: "verification-unavailable",
      retrying: false,
    });
    const duplicateChecking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "checking",
      previousPhase: checking.phase,
      retrying: false,
    });
    const offline = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "offline",
      previousPhase: duplicateChecking.phase,
      retrying: false,
    });
    const duplicateOffline = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "offline",
      previousPhase: offline.phase,
      retrying: false,
    });

    assert.match(checking.announcement || "", /Checking connection/i);
    assert.equal(duplicateChecking.announcement, null);
    assert.match(offline.announcement || "", /Reconnect/i);
    assert.equal(duplicateOffline.announcement, null);
  });

  it("corrects a checking announcement when cached workspace review becomes available", () => {
    const emptyChecking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 0,
      issue: "none",
      loading: false,
      networkStatus: "checking",
      previousPhase: "idle",
      retrying: false,
    });
    const cachedChecking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "none",
      loading: true,
      networkStatus: "checking",
      previousPhase: emptyChecking.phase,
      retrying: false,
    });
    const duplicateCachedChecking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "none",
      loading: true,
      networkStatus: "checking",
      previousPhase: cachedChecking.phase,
      retrying: false,
    });

    assert.match(emptyChecking.announcement || "", /No workspace is currently available/i);
    assert.equal(emptyChecking.phase, "connection-checking-empty");
    assert.match(cachedChecking.announcement || "", /workspace list/i);
    assert.equal(cachedChecking.phase, "connection-checking-cached");
    assert.equal(duplicateCachedChecking.announcement, null);
  });

  it("announces generic cold checking once before workspace context resolves", () => {
    const checking = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 0,
      issue: "none",
      loading: true,
      networkStatus: "checking",
      previousPhase: "idle",
      retrying: false,
      workspaceContextResolved: false,
    });
    const duplicate = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 0,
      issue: "none",
      loading: true,
      networkStatus: "checking",
      previousPhase: checking.phase,
      retrying: false,
      workspaceContextResolved: false,
    });

    assert.deepEqual(checking, {
      announcement: "Checking connection. Map downloads are paused.",
      phase: "connection-checking-generic",
    });
    assert.equal(duplicate.announcement, null);
  });

  it("arms restored copy only after an authenticated offline observation", () => {
    assert.equal(shouldArmAutomaticReconnectAnnouncement({
      authenticated: true,
      networkStatus: "checking",
      offlineObserved: true,
    }), true);
    assert.equal(shouldArmAutomaticReconnectAnnouncement({
      authenticated: true,
      networkStatus: "checking",
      offlineObserved: false,
    }), false);
    assert.equal(shouldArmAutomaticReconnectAnnouncement({
      authenticated: true,
      networkStatus: "online",
      offlineObserved: true,
    }), false);
    assert.equal(shouldArmAutomaticReconnectAnnouncement({
      authenticated: false,
      networkStatus: "checking",
      offlineObserved: true,
    }), false);
  });

  it("preserves automatic reconnect identity while its online catalog is loading", () => {
    const stillLoading = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "none",
      loading: true,
      networkStatus: "online",
      previousPhase: "connection-checking-cached",
      retrying: false,
    });
    const restored = resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "none",
      loading: false,
      networkStatus: "online",
      previousPhase: stillLoading.phase,
      retrying: false,
    });
    assert.deepEqual(stillLoading, {
      announcement: null,
      phase: "connection-checking-cached",
    });
    assert.deepEqual(restored, {
      announcement: null,
      phase: "idle",
    });
  });

  it("leaves successful retries to the single explicit confirmation announcement", () => {
    assert.deepEqual(resolveWorkspaceAccessAnnouncement({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      issue: "none",
      loading: false,
      networkStatus: "online",
      previousPhase: "checking",
      retrying: false,
    }), {
      announcement: null,
      phase: "idle",
    });
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

  it("discloses authoritative workspace-list age without claiming data freshness", () => {
    const hourMs = 60 * 60 * 1000;
    const nowMs = 30 * 24 * hourMs;
    const recent = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 2,
      catalogStoredAtMs: nowMs - 59 * 60 * 1000,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "offline",
      nowMs,
    });
    const hours = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      catalogStoredAtMs: nowMs - 6.9 * hourMs,
      issue: "verification-unavailable",
      loading: true,
      networkStatus: "online",
      nowMs,
    });
    const days = createWorkspaceAccessRefreshState({
      accessRecoveryPending: false,
      availableWorkspaceCount: 1,
      catalogStoredAtMs: nowMs - 12.9 * 24 * hourMs,
      issue: "verification-unavailable",
      loading: false,
      networkStatus: "checking",
      nowMs,
    });

    assert.equal(
      recent.detail,
      "Workspace list cached <1h ago · review only",
    );
    assert.match(
      recent.accessibilityLabel,
      /workspace list was cached less than one hour ago for review only/i,
    );
    assert.equal(hours.detail, "Workspace list cached 6h ago · review only");
    assert.match(hours.accessibilityLabel, /cached 6 hours ago/i);
    assert.equal(days.detail, "Workspace list cached 12d ago · review only");
    assert.match(days.accessibilityLabel, /cached 12 days ago/i);
    for (const state of [recent, hours, days]) {
      assert.match(
        state.accessibilityLabel,
        /does not verify access or the age of routes, risk intelligence, or operations/i,
      );
      assert.doesNotMatch(state.detail, /operations cached|current operations/i);
    }
  });

  it("advances workspace age bands and expires the retained catalog on time", () => {
    const hourMs = 60 * 60 * 1000;
    assert.equal(
      getWorkspaceCatalogAgeRefreshDelayMs({
        catalogStoredAtMs: 0,
        nowMs: 30 * 60 * 1000,
      }),
      30 * 60 * 1000,
    );
    assert.equal(
      getWorkspaceCatalogExpiryDelayMs({
        retentionStoredAtMs: 0,
        nowMs: 30 * 24 * hourMs,
      }),
      1,
    );
    assert.equal(
      getWorkspaceCatalogExpiryDelayMs({
        retentionStoredAtMs: 0,
        nowMs: 30 * 24 * hourMs + 1,
      }),
      null,
    );
  });
});
