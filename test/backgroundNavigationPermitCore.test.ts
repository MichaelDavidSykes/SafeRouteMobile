import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  backgroundNavigationScopesMatch,
  createBackgroundNavigationPermit,
  isBackgroundNavigationWriteAuthorized,
  normalizeBackgroundNavigationPermit,
} from "../src/features/live-map/backgroundNavigationPermitCore";

describe("background navigation permit", () => {
  it("binds workspace collection to route, client, and stable principal", () => {
    const permit = createBackgroundNavigationPermit(" route-a ", {
      clientId: " client-a ",
      kind: "workspace",
      principalId: " user-a ",
    });

    assert.deepEqual(permit, {
      accessScope: {
        clientId: "client-a",
        kind: "workspace",
        principalId: "user-a",
      },
      routeId: "route-a",
      version: 1,
    });
    assert.deepEqual(normalizeBackgroundNavigationPermit(JSON.stringify(permit)), permit);
  });

  it("rejects blank identities, malformed public scope, and legacy permits", () => {
    assert.equal(
      createBackgroundNavigationPermit("route-a", {
        clientId: "client-a",
        kind: "workspace",
        principalId: "",
      }),
      null,
    );
    assert.equal(
      normalizeBackgroundNavigationPermit({
        accessScope: { clientId: "client-a", kind: "public" },
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
    });
    assert.equal(
      isBackgroundNavigationWriteAuthorized({
        permitValue: permit,
        routeIdValue: "route-a",
        sessionAccessScope: permit?.accessScope,
        sessionRouteIdValue: "route-a",
      }),
      true,
    );
    assert.equal(
      isBackgroundNavigationWriteAuthorized({
        permitValue: permit,
        routeIdValue: "route-a",
        sessionAccessScope: permit?.accessScope,
        sessionRouteIdValue: "route-b",
      }),
      false,
    );
    assert.equal(
      isBackgroundNavigationWriteAuthorized({
        permitValue: null,
        routeIdValue: "route-a",
        sessionAccessScope: permit?.accessScope,
        sessionRouteIdValue: "route-a",
      }),
      false,
    );
  });
});
