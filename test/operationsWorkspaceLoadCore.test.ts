import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ApiAuthorizationError,
  ApiRequestError,
  ApiSessionExpiredError,
} from "../src/features/api/apiClientCore";
import { SAVED_ROUTE_PLANS } from "../src/features/live-map/demoRoute";
import {
  loadOperationsWorkspaceData,
  routesForOperationsWorkspace,
} from "../src/features/operations/operationsWorkspaceLoadCore";
import { loadPreviewOperationsState } from "../src/features/operations/previewOperationsApi";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function routeResult() {
  return {
    clients: [
      { id: "workspace-a", name: "Alpha" },
      { id: "workspace-b", name: "Bravo" },
    ],
    routes: [
      { ...SAVED_ROUTE_PLANS[0], clientId: "workspace-a" },
      { ...SAVED_ROUTE_PLANS[1], clientId: "workspace-b" },
    ],
    selectedClientId: "workspace-a",
  };
}

describe("operations workspace load ownership", () => {
  it("filters a mixed route payload to the exact active workspace", () => {
    assert.deepEqual(
      routesForOperationsWorkspace(routeResult().routes, "workspace-b").map((route) => route.id),
      [SAVED_ROUTE_PLANS[1].id],
    );
  });

  it("does not request manifests after a route response loses workspace ownership", async () => {
    const routes = deferred<ReturnType<typeof routeResult>>();
    let ownsRequest = true;
    let operationsCalls = 0;
    const pending = loadOperationsWorkspaceData({
      loadOperations: async () => {
        operationsCalls += 1;
        return loadPreviewOperationsState("workspace-a");
      },
      loadRoutes: () => routes.promise,
      ownsRequest: () => ownsRequest,
      workspaceId: "workspace-a",
    });

    ownsRequest = false;
    routes.resolve(routeResult());

    assert.deepEqual(await pending, { status: "stale" });
    assert.equal(operationsCalls, 0);
  });

  it("fails closed when the current scoped route request loses workspace access", async () => {
    let operationsCalls = 0;
    const result = await loadOperationsWorkspaceData({
      loadOperations: async () => {
        operationsCalls += 1;
        return loadPreviewOperationsState("workspace-a");
      },
      loadRoutes: async () => {
        throw new ApiAuthorizationError("Membership revoked");
      },
      ownsRequest: () => true,
      workspaceId: "workspace-a",
    });

    assert.deepEqual(result, { status: "workspace-unavailable" });
    assert.equal(operationsCalls, 0);
  });

  it("fails closed without returning route-only content when manifests report a missing workspace", async () => {
    const result = await loadOperationsWorkspaceData({
      loadOperations: async () => {
        throw new ApiRequestError("Workspace missing", 404);
      },
      loadRoutes: async () => routeResult(),
      ownsRequest: () => true,
      workspaceId: "workspace-a",
    });

    assert.deepEqual(result, { status: "workspace-unavailable" });
  });

  it("suppresses a late route denial after the user switches workspaces", async () => {
    const routes = deferred<ReturnType<typeof routeResult>>();
    let ownsRequest = true;
    const pending = loadOperationsWorkspaceData({
      loadOperations: async () => loadPreviewOperationsState("workspace-a"),
      loadRoutes: () => routes.promise,
      ownsRequest: () => ownsRequest,
      workspaceId: "workspace-a",
    });

    ownsRequest = false;
    routes.reject(new ApiAuthorizationError("Old workspace denied"));

    assert.deepEqual(await pending, { status: "stale" });
  });

  it("preserves route-request 401s for the central session-expiry handler", async () => {
    const error = new ApiSessionExpiredError();
    await assert.rejects(
      loadOperationsWorkspaceData({
        loadOperations: async () => loadPreviewOperationsState("workspace-a"),
        loadRoutes: async () => {
          throw error;
        },
        ownsRequest: () => true,
        workspaceId: "workspace-a",
      }),
      (caught) => caught === error,
    );
  });

  it("preserves manifest-request 401s for the central session-expiry handler", async () => {
    const error = new ApiSessionExpiredError();
    await assert.rejects(
      loadOperationsWorkspaceData({
        loadOperations: async () => {
          throw error;
        },
        loadRoutes: async () => routeResult(),
        ownsRequest: () => true,
        workspaceId: "workspace-a",
      }),
      (caught) => caught === error,
    );
  });

  it("suppresses a late manifest success after switching workspaces", async () => {
    const operations = deferred<ReturnType<typeof loadPreviewOperationsState>>();
    let ownsRequest = true;
    const pending = loadOperationsWorkspaceData({
      loadOperations: () => operations.promise,
      loadRoutes: async () => routeResult(),
      ownsRequest: () => ownsRequest,
      workspaceId: "workspace-a",
    });

    await Promise.resolve();
    ownsRequest = false;
    operations.resolve(loadPreviewOperationsState("workspace-a"));

    assert.deepEqual(await pending, { status: "stale" });
  });

  it("suppresses a late manifest error instead of warning in the new workspace", async () => {
    const operations = deferred<ReturnType<typeof loadPreviewOperationsState>>();
    let ownsRequest = true;
    const pending = loadOperationsWorkspaceData({
      loadOperations: () => operations.promise,
      loadRoutes: async () => routeResult(),
      ownsRequest: () => ownsRequest,
      workspaceId: "workspace-a",
    });

    await Promise.resolve();
    ownsRequest = false;
    operations.reject(new Error("Old workspace failed"));

    assert.deepEqual(await pending, { status: "stale" });
  });

  it("suppresses a late manifest denial instead of invalidating the new workspace", async () => {
    const operations = deferred<ReturnType<typeof loadPreviewOperationsState>>();
    let ownsRequest = true;
    const pending = loadOperationsWorkspaceData({
      loadOperations: () => operations.promise,
      loadRoutes: async () => routeResult(),
      ownsRequest: () => ownsRequest,
      workspaceId: "workspace-a",
    });

    await Promise.resolve();
    ownsRequest = false;
    operations.reject(new ApiAuthorizationError("Old workspace denied"));

    assert.deepEqual(await pending, { status: "stale" });
  });

  it("returns an exact-workspace saved-route fallback for a current manifest error", async () => {
    const error = new Error("Manifest unavailable");
    const result = await loadOperationsWorkspaceData({
      loadOperations: async () => {
        throw error;
      },
      loadRoutes: async () => routeResult(),
      ownsRequest: () => true,
      workspaceId: "workspace-b",
    });

    assert.equal(result.status, "operations-error");
    if (result.status === "operations-error") {
      assert.equal(result.error, error);
      assert.deepEqual(result.routes.map((route) => route.clientId), ["workspace-b"]);
    }
  });
});
