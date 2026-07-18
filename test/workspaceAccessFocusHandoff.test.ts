import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  WORKSPACE_ACCESS_FOCUS_FALLBACK_MS,
  createWorkspaceAccessFocusHandoff,
  type WorkspaceAccessAnnouncementFinishedEvent,
} from "../src/features/workspaces/workspaceAccessFocusHandoff";

interface FocusHarness {
  announced: string[];
  cancelledFallbacks: number;
  focused: string[];
  listeners: Array<(event: WorkspaceAccessAnnouncementFinishedEvent) => void>;
  removedListeners: number;
  scheduledDelay: number | null;
  triggerFallback: () => void;
}

function createFocusHarness({
  screenReaderEnabled = true,
}: {
  screenReaderEnabled?: boolean;
} = {}) {
  const harness: FocusHarness = {
    announced: [],
    cancelledFallbacks: 0,
    focused: [],
    listeners: [],
    removedListeners: 0,
    scheduledDelay: null,
    triggerFallback: () => undefined,
  };
  const handoff = createWorkspaceAccessFocusHandoff<string>({
    announce: (announcement) => harness.announced.push(announcement),
    focus: (target) => harness.focused.push(target),
    isScreenReaderEnabled: async () => screenReaderEnabled,
    scheduleFallback: (callback, delayMs) => {
      let cancelled = false;
      harness.scheduledDelay = delayMs;
      harness.triggerFallback = () => {
        if (!cancelled) {
          callback();
        }
      };
      return () => {
        if (!cancelled) {
          cancelled = true;
          harness.cancelledFallbacks += 1;
        }
      };
    },
    subscribeToAnnouncementFinished: (listener) => {
      harness.listeners.push(listener);
      let removed = false;
      return () => {
        if (!removed) {
          removed = true;
          harness.removedListeners += 1;
        }
      };
    },
  });
  return { handoff, harness };
}

describe("workspace access focus handoff", () => {
  it("moves focus once after the matching successful iOS announcement", async () => {
    const { handoff, harness } = createFocusHarness();

    await handoff.request("Workspace access verified.", () => "workspace-selector");

    assert.deepEqual(harness.announced, ["Workspace access verified."]);
    assert.equal(harness.scheduledDelay, WORKSPACE_ACCESS_FOCUS_FALLBACK_MS);
    harness.listeners[0]?.({ announcement: "Another message.", success: true });
    assert.deepEqual(harness.focused, []);
    harness.listeners[0]?.({
      announcement: "Workspace access verified.",
      success: true,
    });
    harness.triggerFallback();

    assert.deepEqual(harness.focused, ["workspace-selector"]);
    assert.equal(harness.removedListeners, 1);
    assert.equal(harness.cancelledFallbacks, 1);
  });

  it("uses the bounded fallback when iOS does not report announcement completion", async () => {
    const { handoff, harness } = createFocusHarness();

    await handoff.request("Workspace access refreshed.", () => "workspace-selector");
    harness.triggerFallback();
    harness.listeners[0]?.({
      announcement: "Workspace access refreshed.",
      success: true,
    });

    assert.deepEqual(harness.focused, ["workspace-selector"]);
    assert.equal(harness.removedListeners, 1);
    assert.equal(harness.cancelledFallbacks, 1);
  });

  it("waits for the bounded fallback when the replacement selector mounts after speech", async () => {
    const { handoff, harness } = createFocusHarness();
    let target: string | null = null;

    await handoff.request("Workspace access verified.", () => target);
    harness.listeners[0]?.({
      announcement: "Workspace access verified.",
      success: true,
    });

    assert.deepEqual(harness.focused, []);
    assert.equal(harness.removedListeners, 0);
    assert.equal(harness.cancelledFallbacks, 0);

    target = "late-workspace-selector";
    harness.triggerFallback();

    assert.deepEqual(harness.focused, ["late-workspace-selector"]);
    assert.equal(harness.removedListeners, 1);
    assert.equal(harness.cancelledFallbacks, 1);
  });

  it("does not steal focus when the matching announcement fails", async () => {
    const { handoff, harness } = createFocusHarness();

    await handoff.request("Workspace access verified.", () => "workspace-selector");
    harness.listeners[0]?.({
      announcement: "Workspace access verified.",
      success: false,
    });
    harness.triggerFallback();

    assert.deepEqual(harness.focused, []);
    assert.equal(harness.removedListeners, 1);
    assert.equal(harness.cancelledFallbacks, 1);
  });

  it("announces without subscribing or moving focus when VoiceOver is disabled", async () => {
    const { handoff, harness } = createFocusHarness({
      screenReaderEnabled: false,
    });

    await handoff.request("Workspace access verified.", () => "workspace-selector");

    assert.deepEqual(harness.announced, ["Workspace access verified."]);
    assert.equal(harness.listeners.length, 0);
    assert.equal(harness.scheduledDelay, null);
    assert.deepEqual(harness.focused, []);
  });

  it("cancels stale requests and ignores a missing current-surface target", async () => {
    let resolveFirst: ((enabled: boolean) => void) | undefined;
    let requestCount = 0;
    const announced: string[] = [];
    const fallbacks: Array<() => void> = [];
    const focused: string[] = [];
    const handoff = createWorkspaceAccessFocusHandoff<string>({
      announce: (announcement) => announced.push(announcement),
      focus: (target) => focused.push(target),
      isScreenReaderEnabled: () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Promise<boolean>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve(true);
      },
      scheduleFallback: (callback) => {
        fallbacks.push(callback);
        return () => undefined;
      },
      subscribeToAnnouncementFinished: () => () => undefined,
    });

    const staleRequest = handoff.request("Stale confirmation.", () => "stale-target");
    const currentRequest = handoff.request("Current confirmation.", () => null);
    resolveFirst?.(true);
    await Promise.all([staleRequest, currentRequest]);
    fallbacks.forEach((fallback) => fallback());

    assert.deepEqual(announced, ["Current confirmation."]);
    assert.deepEqual(focused, []);
  });

  it("cancels an active listener and fallback before an unmounted App can move focus", async () => {
    const { handoff, harness } = createFocusHarness();

    await handoff.request("Workspace access verified.", () => "workspace-selector");
    handoff.cancel();
    harness.listeners[0]?.({
      announcement: "Workspace access verified.",
      success: true,
    });
    harness.triggerFallback();

    assert.deepEqual(harness.focused, []);
    assert.equal(harness.removedListeners, 1);
    assert.equal(harness.cancelledFallbacks, 1);
  });
});
