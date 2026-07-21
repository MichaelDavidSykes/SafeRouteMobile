import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createSuspendedNavigationAccessibilityLabel,
  createSuspendedNavigationPresentation,
  isSuspendedNavigationEndRequestCurrent,
} from "../src/features/live-map/suspendedNavigationState";

describe("suspended navigation presentation", () => {
  it("keeps guidance explicitly off while membership is checking", () => {
    assert.deepEqual(
      createSuspendedNavigationPresentation({
        networkStatus: "online",
        status: "checking",
      }),
      {
        message: "Confirming this saved route is ready to resume.",
        retryAccessibilityLabel: "Restoring saved route",
        retryBusy: true,
        retryLabel: "Restoring…",
        title: "Restoring route",
      },
    );
  });

  it("explains reconnect and manual retry without promising unsafe resume", () => {
    assert.match(
      createSuspendedNavigationPresentation({
        networkStatus: "offline",
        status: "paused",
      }).message,
      /Reconnect to verify access/,
    );
    assert.match(
      createSuspendedNavigationPresentation({
        networkStatus: "online",
        status: "paused",
      }).message,
      /could not be verified/,
    );
  });

  it("names connection checking without calling it offline", () => {
    const presentation = createSuspendedNavigationPresentation({
      networkStatus: "checking",
      status: "paused",
    });

    assert.match(presentation.message, /Checking connection/);
    assert.equal(presentation.retryBusy, true);
    assert.equal(presentation.retryLabel, "Waiting…");
    assert.match(presentation.retryAccessibilityLabel, /Checking connection/);
    assert.doesNotMatch(presentation.message, /offline/i);
  });

  it("keeps offline interruption distinct while a retry was checking", () => {
    const presentation = createSuspendedNavigationPresentation({
      networkStatus: "offline",
      status: "checking",
    });

    assert.match(presentation.message, /Reconnect/);
    assert.equal(presentation.retryBusy, false);
    assert.equal(presentation.retryLabel, "Reconnect");
  });

  it("provides one exact route-aware status label separate from its actions", () => {
    const presentation = createSuspendedNavigationPresentation({
      networkStatus: "offline",
      status: "paused",
    });

    assert.equal(
      createSuspendedNavigationAccessibilityLabel(
        presentation,
        " Cold restart verification v1 ",
      ),
      "Guidance paused. Cold restart verification v1. Reconnect to verify access before guidance can resume.",
    );
    assert.equal(
      createSuspendedNavigationAccessibilityLabel(presentation, " "),
      "Guidance paused. Active route. Reconnect to verify access before guidance can resume.",
    );
  });

  it("suppresses stale End cleanup failure after a deferred cleanup crosses an account epoch", async () => {
    let currentPrincipalId = "user-a";
    let currentSessionEpoch = 7;
    let releaseCleanup: ((result: boolean) => void) | null = null;
    const cleanup = new Promise<boolean>((resolve) => {
      releaseCleanup = resolve;
    });
    const publishedMessages: string[] = [];
    const requestIsCurrent = () =>
      isSuspendedNavigationEndRequestCurrent({
        currentPrincipalId,
        currentSessionEpoch,
        endedPrincipalId: "user-a",
        endedSessionEpoch: 7,
        hasActiveNavigation: false,
        hasPendingNavigation: false,
      });
    const endRequest = (async () => {
      const cleanupSucceeded = await cleanup;
      if (!cleanupSucceeded) {
        if (requestIsCurrent()) {
          publishedMessages.push("Saved guidance could not be removed.");
        }
        return;
      }
    })();

    currentPrincipalId = "user-b";
    currentSessionEpoch = 8;
    releaseCleanup?.(false);
    await endRequest;
    assert.deepEqual(publishedMessages, []);
  });

  it("suppresses stale End selection failure after deferred persistence crosses an account epoch", async () => {
    let currentPrincipalId = "user-a";
    let currentSessionEpoch = 7;
    let rejectSelection: ((error: Error) => void) | null = null;
    let markSelectionStarted: (() => void) | null = null;
    const selectionStarted = new Promise<void>((resolve) => {
      markSelectionStarted = resolve;
    });
    const selection = new Promise<void>((_resolve, reject) => {
      rejectSelection = reject;
    });
    const publishedMessages: string[] = [];
    const publishedWorkspaces: string[] = [];
    const requestIsCurrent = () =>
      isSuspendedNavigationEndRequestCurrent({
        currentPrincipalId,
        currentSessionEpoch,
        endedPrincipalId: "user-a",
        endedSessionEpoch: 7,
        hasActiveNavigation: false,
        hasPendingNavigation: false,
      });
    const endRequest = (async () => {
      if (!requestIsCurrent()) {
        return;
      }
      try {
        markSelectionStarted?.();
        await selection;
        if (requestIsCurrent()) {
          publishedWorkspaces.push("workspace-a");
        }
      } catch {
        if (requestIsCurrent()) {
          publishedMessages.push("Choose a cached workspace.");
        }
      }
    })();

    await selectionStarted;
    currentPrincipalId = "user-b";
    currentSessionEpoch = 8;
    rejectSelection?.(new Error("selection failed"));
    await endRequest;
    assert.deepEqual(publishedMessages, []);
    assert.deepEqual(publishedWorkspaces, []);
  });
});
