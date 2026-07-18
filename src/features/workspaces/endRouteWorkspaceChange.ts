import {
  findWorkspace,
  type SafeRouteWorkspace,
} from "./activeWorkspace";

export function resolveEndRouteWorkspaceChangeTarget({
  availableWorkspaces,
  currentPrincipalId,
  currentSessionEpoch,
  currentSourceWorkspaceId,
  currentWorkspaceRequestRevision,
  hasActiveNavigation,
  hasPendingNavigation,
  requestedPrincipalId,
  requestedSessionEpoch,
  requestedSourceWorkspaceId,
  requestedTargetWorkspaceId,
  requestedWorkspaceRequestRevision,
}: {
  availableWorkspaces: SafeRouteWorkspace[];
  currentPrincipalId: string;
  currentSessionEpoch: number;
  currentSourceWorkspaceId: string | null;
  currentWorkspaceRequestRevision: number;
  hasActiveNavigation: boolean;
  hasPendingNavigation: boolean;
  requestedPrincipalId: string;
  requestedSessionEpoch: number;
  requestedSourceWorkspaceId: string | null;
  requestedTargetWorkspaceId: string;
  requestedWorkspaceRequestRevision: number;
}): SafeRouteWorkspace | null {
  if (
    hasActiveNavigation ||
    hasPendingNavigation ||
    requestedPrincipalId !== currentPrincipalId ||
    requestedSessionEpoch !== currentSessionEpoch ||
    requestedSourceWorkspaceId !== currentSourceWorkspaceId ||
    requestedWorkspaceRequestRevision !== currentWorkspaceRequestRevision ||
    (
      requestedSourceWorkspaceId !== null &&
      requestedSourceWorkspaceId === requestedTargetWorkspaceId
    )
  ) {
    return null;
  }

  return findWorkspace(availableWorkspaces, requestedTargetWorkspaceId);
}
