import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authorizeWorkspaceNavigationStart } from "../src/features/workspaces/workspaceNavigationAuthorization";

const WORKSPACES = [
  { id: "workspace-a", name: "Alpha Operations" },
  { id: "workspace-b", name: "Bravo Operations" },
];

describe("workspace navigation start authorization", () => {
  it("authorizes only after the current principal and fresh catalog both match", async () => {
    const calls: string[] = [];

    const result = await authorizeWorkspaceNavigationStart({
      expectedPrincipalId: "principal-a",
      loadCurrentPrincipalId: async () => {
        calls.push("principal");
        return " principal-a ";
      },
      loadWorkspaceCatalog: async () => {
        calls.push("catalog");
        return WORKSPACES;
      },
      requestIsCurrent: () => true,
      workspaceId: " workspace-b ",
    });

    assert.deepEqual(calls, ["principal", "catalog"]);
    assert.deepEqual(result, {
      status: "authorized",
      workspace: WORKSPACES[1],
      workspaces: WORKSPACES,
    });
  });

  it("rejects another principal without requesting the workspace catalog", async () => {
    let catalogCalls = 0;

    const result = await authorizeWorkspaceNavigationStart({
      expectedPrincipalId: "principal-a",
      loadCurrentPrincipalId: async () => "principal-b",
      loadWorkspaceCatalog: async () => {
        catalogCalls += 1;
        return WORKSPACES;
      },
      requestIsCurrent: () => true,
      workspaceId: "workspace-a",
    });

    assert.deepEqual(result, { status: "principal-mismatch" });
    assert.equal(catalogCalls, 0);
  });

  it("rejects a workspace omitted from the fresh authoritative catalog", async () => {
    const result = await authorizeWorkspaceNavigationStart({
      expectedPrincipalId: "principal-a",
      loadCurrentPrincipalId: async () => "principal-a",
      loadWorkspaceCatalog: async () => [WORKSPACES[0]],
      requestIsCurrent: () => true,
      workspaceId: "workspace-b",
    });

    assert.deepEqual(result, { status: "workspace-unavailable" });
  });

  it("rejects a request made stale after either authorization response", async () => {
    let current = true;
    let catalogCalls = 0;
    const staleAfterPrincipal = await authorizeWorkspaceNavigationStart({
      expectedPrincipalId: "principal-a",
      loadCurrentPrincipalId: async () => {
        current = false;
        return "principal-a";
      },
      loadWorkspaceCatalog: async () => {
        catalogCalls += 1;
        return WORKSPACES;
      },
      requestIsCurrent: () => current,
      workspaceId: "workspace-a",
    });

    assert.deepEqual(staleAfterPrincipal, { status: "stale" });
    assert.equal(catalogCalls, 0);

    current = true;
    const staleAfterCatalog = await authorizeWorkspaceNavigationStart({
      expectedPrincipalId: "principal-a",
      loadCurrentPrincipalId: async () => "principal-a",
      loadWorkspaceCatalog: async () => {
        current = false;
        return WORKSPACES;
      },
      requestIsCurrent: () => current,
      workspaceId: "workspace-a",
    });

    assert.deepEqual(staleAfterCatalog, { status: "stale" });
  });

  it("supports local preview authorization while still requiring a fresh catalog", async () => {
    let catalogCalls = 0;
    const result = await authorizeWorkspaceNavigationStart({
      expectedPrincipalId: "preview-user",
      loadWorkspaceCatalog: async () => {
        catalogCalls += 1;
        return [WORKSPACES[0]];
      },
      requestIsCurrent: () => true,
      workspaceId: "workspace-a",
    });

    assert.equal(catalogCalls, 1);
    assert.equal(result.status, "authorized");
  });
});
