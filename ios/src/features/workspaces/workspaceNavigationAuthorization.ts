import {
  findWorkspace,
  normalizeWorkspaceCatalog,
  type SafeRouteWorkspace,
} from "./activeWorkspace";

export type WorkspaceNavigationAuthorizationResult =
  | {
      status: "authorized";
      workspace: SafeRouteWorkspace;
      workspaces: SafeRouteWorkspace[];
    }
  | { status: "principal-mismatch" }
  | { status: "stale" }
  | { status: "workspace-unavailable"; workspaces: SafeRouteWorkspace[] };

interface AuthorizeWorkspaceNavigationStartOptions {
  expectedPrincipalId: string;
  loadCurrentPrincipalId?: () => Promise<string>;
  loadWorkspaceCatalog: () => Promise<SafeRouteWorkspace[]>;
  requestIsCurrent: () => boolean;
  workspaceId: string;
}

export async function authorizeWorkspaceNavigationStart({
  expectedPrincipalId,
  loadCurrentPrincipalId,
  loadWorkspaceCatalog,
  requestIsCurrent,
  workspaceId,
}: AuthorizeWorkspaceNavigationStartOptions): Promise<WorkspaceNavigationAuthorizationResult> {
  const normalizedExpectedPrincipalId = expectedPrincipalId.trim();
  const normalizedWorkspaceId = workspaceId.trim();

  if (!normalizedExpectedPrincipalId || !normalizedWorkspaceId) {
    return { status: "principal-mismatch" };
  }

  if (loadCurrentPrincipalId) {
    const currentPrincipalId = String(await loadCurrentPrincipalId()).trim();
    if (!requestIsCurrent()) {
      return { status: "stale" };
    }
    if (currentPrincipalId !== normalizedExpectedPrincipalId) {
      return { status: "principal-mismatch" };
    }
  }

  const workspaces = normalizeWorkspaceCatalog(await loadWorkspaceCatalog());
  if (!requestIsCurrent()) {
    return { status: "stale" };
  }

  const workspace = findWorkspace(workspaces, normalizedWorkspaceId);
  if (!workspace) {
    return { status: "workspace-unavailable", workspaces };
  }

  return {
    status: "authorized",
    workspace,
    workspaces,
  };
}
