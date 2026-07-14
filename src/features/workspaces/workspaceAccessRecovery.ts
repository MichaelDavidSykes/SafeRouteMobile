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
  return isWorkspaceForbiddenError(error) ||
    (error instanceof ApiRequestError && error.statusCode === 404);
}

export function isWorkspaceForbiddenError(error: unknown): boolean {
  return error instanceof ApiRequestError && error.statusCode === 403;
}

export function getRequestUnavailableWorkspaceId({
  accessToken,
  error,
  handled,
  requestActive,
  workspaceId,
}: {
  accessToken?: string | null;
  error: unknown;
  handled: boolean;
  requestActive: boolean;
  workspaceId?: string | null;
}): string | null {
  const normalizedAccessToken = typeof accessToken === "string" ? accessToken.trim() : "";
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);

  return normalizedAccessToken &&
    normalizedWorkspaceId &&
    requestActive &&
    !handled &&
    isWorkspaceUnavailableError(error)
    ? normalizedWorkspaceId
    : null;
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

export function findAuthoritativelyUnavailableWorkspaceIds({
  candidateWorkspaceIds,
  freshWorkspaces,
  knownWorkspaces,
}: {
  candidateWorkspaceIds?: Iterable<string | null | undefined>;
  freshWorkspaces: SafeRouteWorkspace[];
  knownWorkspaces: SafeRouteWorkspace[];
}): string[] {
  const freshIds = new Set(
    normalizeWorkspaceCatalog(freshWorkspaces).map((workspace) => workspace.id),
  );
  const knownIds = new Set(
    normalizeWorkspaceCatalog(knownWorkspaces).map((workspace) => workspace.id),
  );
  for (const candidate of candidateWorkspaceIds || []) {
    const workspaceId = normalizeWorkspaceId(candidate);
    if (workspaceId) {
      knownIds.add(workspaceId);
    }
  }

  return Array.from(knownIds).filter((workspaceId) => !freshIds.has(workspaceId));
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
