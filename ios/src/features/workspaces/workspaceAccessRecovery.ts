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

export type FreshWorkspaceAccessRecovery =
  | { status: "ignored" }
  | {
      activeWorkspace: SafeRouteWorkspace | null;
      newlyUnavailableWorkspaceIds: string[];
      status: "recovered";
      unavailableWorkspaceIds: Set<string>;
      workspaces: SafeRouteWorkspace[];
    };

export type FreshWorkspaceCatalogReconciliation = {
  activeWorkspace: SafeRouteWorkspace | null;
  newlyUnavailableWorkspaceIds: string[];
  unavailableWorkspaceIds: Set<string>;
  workspaces: SafeRouteWorkspace[];
};

export type WorkspaceSurfaceClosure = {
  navigationUnavailable: boolean;
  previewUnavailable: boolean;
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

export function isWorkspaceIdUnavailable(
  workspaceId: string | null | undefined,
  unavailableWorkspaceIds: Iterable<string>,
): boolean {
  const normalizedWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!normalizedWorkspaceId) {
    return false;
  }

  for (const unavailableWorkspaceId of unavailableWorkspaceIds) {
    if (normalizeWorkspaceId(unavailableWorkspaceId) === normalizedWorkspaceId) {
      return true;
    }
  }
  return false;
}

export function resolveWorkspaceSurfaceClosure({
  navigationWorkspaceId,
  previewWorkspaceId,
  unavailableWorkspaceIds,
}: {
  navigationWorkspaceId?: string | null;
  previewWorkspaceId?: string | null;
  unavailableWorkspaceIds: Iterable<string>;
}): WorkspaceSurfaceClosure {
  const unavailableIds = Array.from(unavailableWorkspaceIds);
  return {
    navigationUnavailable: isWorkspaceIdUnavailable(
      navigationWorkspaceId,
      unavailableIds,
    ),
    previewUnavailable: isWorkspaceIdUnavailable(
      previewWorkspaceId,
      unavailableIds,
    ),
  };
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

export function resolveFreshWorkspaceAccessRecovery({
  activeWorkspaceId,
  candidateWorkspaceIds,
  freshWorkspaces,
  knownWorkspaces,
  unavailableWorkspaceId,
  unavailableWorkspaceIds,
}: {
  activeWorkspaceId: string | null | undefined;
  candidateWorkspaceIds?: Iterable<string | null | undefined>;
  freshWorkspaces: SafeRouteWorkspace[];
  knownWorkspaces: SafeRouteWorkspace[];
  unavailableWorkspaceId: string | null | undefined;
  unavailableWorkspaceIds: Iterable<string>;
}): FreshWorkspaceAccessRecovery {
  const unavailableId = normalizeWorkspaceId(unavailableWorkspaceId);
  const reconciliation = reconcileFreshWorkspaceCatalog({
    activeWorkspaceId,
    additionalUnavailableWorkspaceIds: [unavailableId],
    candidateWorkspaceIds,
    freshWorkspaces,
    knownWorkspaces,
    unavailableWorkspaceIds,
  });
  const recovery = resolveWorkspaceAccessRecovery(
    reconciliation.workspaces,
    activeWorkspaceId,
    unavailableId,
  );
  if (recovery.status === "ignored") {
    return recovery;
  }

  return {
    ...recovery,
    newlyUnavailableWorkspaceIds: reconciliation.newlyUnavailableWorkspaceIds,
    unavailableWorkspaceIds: reconciliation.unavailableWorkspaceIds,
  };
}

export function reconcileFreshWorkspaceCatalog({
  activeWorkspaceId,
  additionalUnavailableWorkspaceIds,
  candidateWorkspaceIds,
  freshWorkspaces,
  knownWorkspaces,
  unavailableWorkspaceIds,
}: {
  activeWorkspaceId: string | null | undefined;
  additionalUnavailableWorkspaceIds?: Iterable<string | null | undefined>;
  candidateWorkspaceIds?: Iterable<string | null | undefined>;
  freshWorkspaces: SafeRouteWorkspace[];
  knownWorkspaces: SafeRouteWorkspace[];
  unavailableWorkspaceIds: Iterable<string>;
}): FreshWorkspaceCatalogReconciliation {
  const existingUnavailableIds = new Set(
    Array.from(unavailableWorkspaceIds, normalizeWorkspaceId).filter(Boolean),
  );
  const nextUnavailableIds = new Set(existingUnavailableIds);
  for (const workspaceIdValue of additionalUnavailableWorkspaceIds || []) {
    const workspaceId = normalizeWorkspaceId(workspaceIdValue);
    if (workspaceId) {
      nextUnavailableIds.add(workspaceId);
    }
  }
  for (const workspaceId of findAuthoritativelyUnavailableWorkspaceIds({
    candidateWorkspaceIds,
    freshWorkspaces,
    knownWorkspaces,
  })) {
    nextUnavailableIds.add(workspaceId);
  }
  const workspaces = excludeUnavailableWorkspaces(
    freshWorkspaces,
    nextUnavailableIds,
  );

  return {
    activeWorkspace: resolveActiveWorkspace(
      workspaces,
      activeWorkspaceId,
      null,
    ),
    newlyUnavailableWorkspaceIds: Array.from(nextUnavailableIds).filter(
      (workspaceId) => !existingUnavailableIds.has(workspaceId),
    ),
    unavailableWorkspaceIds: nextUnavailableIds,
    workspaces,
  };
}

function normalizeWorkspaceId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
