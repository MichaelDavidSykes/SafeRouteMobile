import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isCurrentWorkspaceNavigationContinuation,
  resolveWorkspaceForegroundRevalidation,
} from "../src/features/workspaces/workspaceForegroundRevalidation";

const readyState = {
  authenticated: true,
  backgrounded: true,
  catalogBusy: false,
  nextAppState: "active" as const,
  previewSession: false,
  refreshPending: false,
  sessionCleanupPending: false,
  stablePrincipal: true,
};

describe("workspace foreground revalidation", () => {
  it("arms only after the app reaches background", () => {
    assert.deepEqual(
      resolveWorkspaceForegroundRevalidation({
        ...readyState,
        backgrounded: false,
        nextAppState: "background",
      }),
      { backgrounded: true, revalidate: false },
    );
    assert.deepEqual(
      resolveWorkspaceForegroundRevalidation({
        ...readyState,
        backgrounded: false,
        nextAppState: "inactive",
      }),
      { backgrounded: false, revalidate: false },
    );
  });

  it("requests one fresh check when an authenticated stable principal returns", () => {
    assert.deepEqual(resolveWorkspaceForegroundRevalidation(readyState), {
      backgrounded: false,
      revalidate: true,
    });
  });

  it("does not treat repeated active events as new foreground epochs", () => {
    assert.deepEqual(
      resolveWorkspaceForegroundRevalidation({
        ...readyState,
        backgrounded: false,
      }),
      { backgrounded: false, revalidate: false },
    );
  });

  it("defers to catalog, retry, and session-cleanup work already in flight", () => {
    for (const blocked of [
      { catalogBusy: true },
      { refreshPending: true },
      { sessionCleanupPending: true },
    ]) {
      assert.deepEqual(
        resolveWorkspaceForegroundRevalidation({ ...readyState, ...blocked }),
        { backgrounded: false, revalidate: false },
      );
    }
  });

  it("ignores signed-out, unstable-principal, and preview sessions", () => {
    for (const blocked of [
      { authenticated: false },
      { stablePrincipal: false },
      { previewSession: true },
    ]) {
      assert.deepEqual(
        resolveWorkspaceForegroundRevalidation({ ...readyState, ...blocked }),
        { backgrounded: false, revalidate: false },
      );
    }
  });

  it("preserves only the exact active workspace journey while authorization is checking", () => {
    const currentSession = {
      accessScope: {
        clientId: "workspace-a",
        kind: "workspace" as const,
        principalId: "principal-a",
      },
      navigationInstanceId: "journey-a",
      routePlan: { id: "plan-a", route: { id: "route-a" } },
    };

    assert.equal(
      isCurrentWorkspaceNavigationContinuation(currentSession, currentSession),
      true,
    );
    assert.equal(
      isCurrentWorkspaceNavigationContinuation(currentSession, {
        ...currentSession,
        routePlan: { ...currentSession.routePlan, route: { id: "route-a-reroute-2" } },
      }),
      true,
    );
    for (const nextSession of [
      { ...currentSession, navigationInstanceId: "journey-b" },
      { ...currentSession, routePlan: { id: "plan-b" } },
      {
        ...currentSession,
        accessScope: { ...currentSession.accessScope, clientId: "workspace-b" },
      },
      {
        ...currentSession,
        accessScope: { ...currentSession.accessScope, principalId: "principal-b" },
      },
    ]) {
      assert.equal(
        isCurrentWorkspaceNavigationContinuation(currentSession, nextSession),
        false,
      );
    }
  });
});
