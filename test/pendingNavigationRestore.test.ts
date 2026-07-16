import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createActiveNavigationSession,
  type ActiveNavigationSession,
} from "../src/features/live-map/activeNavigationSessionCore";
import {
  isCurrentPendingNavigationRestore,
  resolvePendingNavigationRestore,
} from "../src/features/live-map/pendingNavigationRestore";
import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";

function pendingSession(
  overrides: Partial<ActiveNavigationSession> = {},
): ActiveNavigationSession {
  const routePlan = {
    ...SAVED_ROUTE_PLANS[0],
    clientId: "workspace-a",
  };

  return {
    ...createActiveNavigationSession({
      backgroundTrackingEnabled: true,
      followModeEnabled: true,
      navigationInstanceId: "journey-a",
      navigationStartedAtMs: 1_700_000_000_000,
      navigationState: "paused",
      principalId: "principal-a",
      progressFloorMeters: 125,
      routeContext: "saved",
      routePlan,
      savedAtMs: 1_700_000_001_000,
    }),
    ...overrides,
  };
}

describe("pending navigation restore", () => {
  it("resumes only the exact pending journey after workspace verification", () => {
    const candidate = pendingSession();

    assert.equal(
      resolvePendingNavigationRestore({
        candidate,
        current: candidate,
      }),
      "resume",
    );
  });

  it("keeps an explicitly ended journey closed when a delayed catalog settles", async () => {
    const candidate = pendingSession();
    let current: ActiveNavigationSession | null = candidate;
    let releaseCatalog!: () => void;
    const catalogPersistence = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    let resumeCalls = 0;
    let confirmationCalls = 0;

    const settleRestore = (async () => {
      await catalogPersistence;
      const resolution = resolvePendingNavigationRestore({
        candidate,
        current,
      });
      if (resolution === "resume") {
        resumeCalls += 1;
        confirmationCalls += 1;
      }
      return resolution;
    })();

    current = null;
    releaseCatalog();

    assert.equal(await settleRestore, "stale");
    assert.equal(resumeCalls, 0);
    assert.equal(confirmationCalls, 0);
    assert.equal(isCurrentPendingNavigationRestore(null, candidate), false);
  });

  it("rejects a replacement journey, route, workspace, or principal", () => {
    const candidate = pendingSession();
    const mismatches = [
      pendingSession({ navigationInstanceId: "journey-b" }),
      pendingSession({ routePlan: { ...candidate.routePlan, id: "plan-b" } }),
      pendingSession({
        accessScope: {
          clientId: "workspace-b",
          kind: "workspace",
          principalId: "principal-a",
        },
      }),
      pendingSession({
        accessScope: {
          clientId: "workspace-a",
          kind: "workspace",
          principalId: "principal-b",
        },
      }),
    ];

    for (const current of mismatches) {
      assert.equal(
        resolvePendingNavigationRestore({
          candidate,
          current,
        }),
        "stale",
      );
    }
  });

  it("does nothing when no restore was staged", () => {
    assert.equal(
      resolvePendingNavigationRestore({
        candidate: null,
        current: pendingSession(),
      }),
      "none",
    );
  });
});
