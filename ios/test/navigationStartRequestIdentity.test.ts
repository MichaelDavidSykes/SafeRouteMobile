import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isNavigationStartRequestCurrent,
  type CurrentNavigationStartRequestState,
  type NavigationStartRequestIdentity,
} from "../src/features/live-map/navigationStartRequestIdentity";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

const routePlan = { clientId: "workspace-a", route: { id: "shared-route-id" } };
const request: NavigationStartRequestIdentity = {
  accessToken: "token-a",
  principalId: "principal-a",
  routePlan,
  routePreviewRevision: 4,
  sessionEpoch: 2,
  workspaceId: "workspace-a",
};
const currentState = (): CurrentNavigationStartRequestState => ({
  accessToken: "token-a",
  activeWorkspaceId: "workspace-a",
  navigationCleanupRequired: false,
  pendingNavigationRestore: false,
  principalId: "principal-a",
  routePlan,
  routePlanWorkspaceId: "workspace-a",
  routePreviewRevision: 4,
  sessionEpoch: 2,
});

describe("navigation Start request identity", () => {
  it("accepts only the exact current preview and authorization context", () => {
    assert.equal(isNavigationStartRequestCurrent(request, currentState()), true);
    assert.equal(
      isNavigationStartRequestCurrent(request, {
        ...currentState(),
        routePlan: { clientId: "workspace-a", route: { id: "shared-route-id" } },
      }),
      false,
    );
  });

  it("rejects a deferred response after the same preview object is reopened", async () => {
    const authorization = deferred<void>();
    let current = currentState();
    const responseIsCurrent = authorization.promise.then(() =>
      isNavigationStartRequestCurrent(request, current),
    );

    current = { ...current, routePreviewRevision: current.routePreviewRevision + 2 };
    authorization.resolve();

    assert.equal(await responseIsCurrent, false);
  });

  it("fails closed across auth, workspace, cleanup, and restore changes", () => {
    for (const changed of [
      { accessToken: "token-b" },
      { activeWorkspaceId: "workspace-b" },
      { navigationCleanupRequired: true },
      { pendingNavigationRestore: true },
      { principalId: "principal-b" },
      { routePlanWorkspaceId: "workspace-b" },
      { sessionEpoch: 3 },
    ]) {
      assert.equal(
        isNavigationStartRequestCurrent(request, { ...currentState(), ...changed }),
        false,
      );
    }
  });
});
