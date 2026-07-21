import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  backgroundNavigationScopesMatch,
  createBackgroundNavigationRuntimePermitStore,
  createBackgroundNavigationPermit,
  isBackgroundNavigationSampleCurrent,
  isBackgroundNavigationWriteAuthorized,
  normalizeBackgroundNavigationPermit,
} from "../src/features/live-map/backgroundNavigationPermitCore";

describe("background navigation permit", () => {
  it("binds workspace collection to route, client, and stable principal", () => {
    const permit = createBackgroundNavigationPermit(" route-a ", {
      clientId: " client-a ",
      kind: "workspace",
      principalId: " user-a ",
    }, " navigation-a ", 1_000);

    assert.deepEqual(permit, {
      accessScope: {
        clientId: "client-a",
        kind: "workspace",
        principalId: "user-a",
      },
      grantedAtMs: 1_000,
      navigationInstanceId: "navigation-a",
      routeId: "route-a",
      version: 2,
    });
    assert.deepEqual(normalizeBackgroundNavigationPermit(JSON.stringify(permit)), permit);
  });

  it("rejects blank identities, malformed public scope, and legacy permits", () => {
    assert.equal(
      createBackgroundNavigationPermit("route-a", {
        clientId: "client-a",
        kind: "workspace",
        principalId: "",
      }, "navigation-a"),
      null,
    );
    assert.equal(
      normalizeBackgroundNavigationPermit({
        accessScope: { clientId: "client-a", kind: "public" },
        navigationInstanceId: "navigation-a",
        routeId: "route-a",
        version: 1,
      }),
      null,
    );
    assert.equal(
      normalizeBackgroundNavigationPermit({
        accessScope: { kind: "public" },
        routeId: "route-a",
        version: 0,
      }),
      null,
    );
  });

  it("never matches public/workspace, cross-client, or cross-principal samples", () => {
    const publicScope = { kind: "public" } as const;
    const workspaceA = {
      clientId: "client-a",
      kind: "workspace",
      principalId: "user-a",
    } as const;

    assert.equal(backgroundNavigationScopesMatch(publicScope, publicScope), true);
    assert.equal(backgroundNavigationScopesMatch(publicScope, workspaceA), false);
    assert.equal(
      backgroundNavigationScopesMatch(workspaceA, { ...workspaceA, clientId: "client-b" }),
      false,
    );
    assert.equal(
      backgroundNavigationScopesMatch(workspaceA, { ...workspaceA, principalId: "user-b" }),
      false,
    );
    assert.equal(
      backgroundNavigationScopesMatch(workspaceA, {
        clientId: " client-a ",
        kind: "workspace",
        principalId: " user-a ",
      }),
      true,
    );
  });

  it("requires one exact active route and scope before a task sample can write", () => {
    const permit = createBackgroundNavigationPermit("route-a", {
      clientId: "client-a",
      kind: "workspace",
      principalId: "user-a",
    }, "navigation-a", 1_000);
    assert.equal(
      isBackgroundNavigationWriteAuthorized({
        navigationInstanceIdValue: "navigation-a",
        permitValue: permit,
        routeIdValue: "route-a",
        sessionAccessScope: permit?.accessScope,
        sessionNavigationInstanceIdValue: "navigation-a",
        sessionRouteIdValue: "route-a",
      }),
      true,
    );
    assert.equal(
      isBackgroundNavigationWriteAuthorized({
        navigationInstanceIdValue: "navigation-a",
        permitValue: permit,
        routeIdValue: "route-a",
        sessionAccessScope: permit?.accessScope,
        sessionNavigationInstanceIdValue: "navigation-a",
        sessionRouteIdValue: "route-b",
      }),
      false,
    );
    assert.equal(
      isBackgroundNavigationWriteAuthorized({
        navigationInstanceIdValue: "navigation-b",
        permitValue: permit,
        routeIdValue: "route-a",
        sessionAccessScope: permit?.accessScope,
        sessionNavigationInstanceIdValue: "navigation-b",
        sessionRouteIdValue: "route-a",
      }),
      false,
    );
    assert.equal(
      isBackgroundNavigationWriteAuthorized({
        navigationInstanceIdValue: "navigation-a",
        permitValue: null,
        routeIdValue: "route-a",
        sessionAccessScope: permit?.accessScope,
        sessionNavigationInstanceIdValue: "navigation-a",
        sessionRouteIdValue: "route-a",
      }),
      false,
    );
  });

  it("requires a permit granted in the current JS process", () => {
    const permit = createBackgroundNavigationPermit("route-a", {
      clientId: "client-a",
      kind: "workspace",
      principalId: "user-a",
    }, "navigation-a", 1_000);
    const originalProcess = createBackgroundNavigationRuntimePermitStore();
    const grantRevision = originalProcess.beginGrant();

    assert.equal(originalProcess.hasActivePermit(), false);
    assert.equal(originalProcess.status(), "none");
    assert.equal(originalProcess.matches(permit), false);
    assert.equal(originalProcess.commitGrant(grantRevision, permit), true);
    assert.equal(originalProcess.status(), "pending");
    assert.equal(originalProcess.hasActivePermit(), false);
    assert.equal(originalProcess.matches(permit), false);
    assert.equal(originalProcess.activate(permit), true);
    assert.equal(originalProcess.status(), "active");
    assert.equal(originalProcess.hasActivePermit(), true);
    assert.equal(originalProcess.matches(permit), true);
    assert.equal(
      originalProcess.matches({
        ...permit,
        navigationInstanceId: "navigation-b",
      }),
      false,
    );

    const restartedProcess = createBackgroundNavigationRuntimePermitStore();
    assert.equal(restartedProcess.status(), "none");
    assert.equal(restartedProcess.hasActivePermit(), false);
    assert.equal(restartedProcess.matches(permit), false);
  });

  it("does not revive an in-flight grant after access is revoked", () => {
    const permit = createBackgroundNavigationPermit("route-a", {
      clientId: "client-a",
      kind: "workspace",
      principalId: "user-a",
    }, "navigation-a", 1_000);
    const runtimePermit = createBackgroundNavigationRuntimePermitStore();
    const staleGrantRevision = runtimePermit.beginGrant();

    runtimePermit.revoke();

    assert.equal(
      runtimePermit.commitGrant(staleGrantRevision, permit),
      false,
    );
    assert.equal(runtimePermit.hasActivePermit(), false);
    assert.equal(runtimePermit.matches(permit), false);
  });

  it("rejects a task sample captured before the current native grant", () => {
    const permit = createBackgroundNavigationPermit(
      "route-a",
      { kind: "public" },
      "navigation-a",
      2_000,
    );

    assert.equal(isBackgroundNavigationSampleCurrent(permit, 1_999), false);
    assert.equal(isBackgroundNavigationSampleCurrent(permit, 2_000), true);
  });
});
