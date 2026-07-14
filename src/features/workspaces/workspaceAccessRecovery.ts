import { ApiRequestError } from "../api/apiClientCore";
import {
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
  type SafeRouteWorkspace,
} from "./activeWorkspace";

export type WorkspaceAccessRecovery =
  | { status: "ignored" }
  | {
      activeWorkspace: SafeRouteWorkspace | null;
      status: "recovered";
      workspaces: SafeRouteWorkspace[];
    };

export function isWorkspaceUnavailableError(error: unknown): boolean {
  return error instanceof ApiRequestError &&
    (error.statusCode === 403 || error.statusCode === 404);
}

export function excludeUnavailableWorkspaces(
  workspaces: SafeRouteWorkspace[],
  unavailableWorkspaceIds: Iterable<string>,
): SafeRouteWorkspace[] {
  const unavailableIds = new Set(
    Array.from(unavailableWorkspaceIds, normalizeWorkspaceId).filter(Boolean),
  );

  return normalizeWorkspaceCatalog(workspaces).filter(
    (workspace) => !unavailableIds.has(workspace.id),
  );
}

export function resolveWorkspaceAccessRecovery(
  workspaces: SafeRouteWorkspace[],
  activeWorkspaceId: string | null | undefined,
  unavailableWorkspaceId: string | null | undefined,
): WorkspaceAccessRecovery {
  const activeId = normalizeWorkspaceId(activeWorkspaceId);
  const unavailableId = normalizeWorkspaceId(unavailableWorkspaceId);
  if (!activeId || !unavailableId || activeId !== unavailableId) {
    return { status: "ignored" };
  }

  const remainingWorkspaces = excludeUnavailableWorkspaces(workspaces, [unavailableId]);

  return {
    activeWorkspace: resolveActiveWorkspace(remainingWorkspaces, null, null),
    status: "recovered",
    workspaces: remainingWorkspaces,
  };
}

function normalizeWorkspaceId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
