import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  canRetainNavigationWorkspace,
  findWorkspace,
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
} from "../src/features/workspaces/activeWorkspace";

const WORKSPACES = [
  { id: "workspace-a", name: "Alpha Operations" },
  { id: "workspace-b", name: "Bravo Operations" },
];

describe("active SafeRoute workspace", () => {
  it("normalizes and deduplicates the authoritative catalog", () => {
    assert.deepEqual(
      normalizeWorkspaceCatalog([
        { id: " workspace-a ", name: " Alpha   Operations " },
        { id: "workspace-a", name: "Duplicate" },
        { id: "", name: "Missing id" },
      ]),
      [{ id: "workspace-a", name: "Alpha Operations" }],
    );
  });

  it("keeps a valid current workspace ahead of the server preference", () => {
    assert.deepEqual(
      resolveActiveWorkspace(WORKSPACES, "workspace-b", "workspace-a"),
      WORKSPACES[1],
    );
  });

  it("uses a valid server preference but never silently chooses the first of many", () => {
    assert.deepEqual(resolveActiveWorkspace(WORKSPACES, null, "workspace-b"), WORKSPACES[1]);
    assert.equal(resolveActiveWorkspace(WORKSPACES, null, null), null);
    assert.equal(resolveActiveWorkspace(WORKSPACES, "revoked", null), null);
  });

  it("auto-selects the only authorized workspace and fails closed for an empty catalog", () => {
    assert.deepEqual(resolveActiveWorkspace([WORKSPACES[0]]), WORKSPACES[0]);
    assert.equal(resolveActiveWorkspace([]), null);
    assert.equal(findWorkspace(WORKSPACES, "missing"), null);
  });

  it("retains public guidance but rejects guidance for a revoked workspace", () => {
    assert.equal(canRetainNavigationWorkspace(WORKSPACES, null), true);
    assert.equal(canRetainNavigationWorkspace(WORKSPACES, "workspace-b"), true);
    assert.equal(canRetainNavigationWorkspace(WORKSPACES, "revoked"), false);
    assert.equal(canRetainNavigationWorkspace([], "workspace-a"), false);
  });
});
