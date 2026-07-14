import assert from "node:assert/strict";
import { describe, it } from "node:test";

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
