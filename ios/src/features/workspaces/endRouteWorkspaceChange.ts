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
  allowSameSourceTarget = false,
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
  allowSameSourceTarget?: boolean;
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
      !allowSameSourceTarget &&
      requestedSourceWorkspaceId !== null &&
      requestedSourceWorkspaceId === requestedTargetWorkspaceId
    )
  ) {
    return null;
  }

  return findWorkspace(availableWorkspaces, requestedTargetWorkspaceId);
}
