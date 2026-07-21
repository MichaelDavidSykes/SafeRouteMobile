export interface NavigationStartRequestIdentity {
  accessToken: string;
  principalId: string;
  routePlan: object;
  routePreviewRevision: number;
  sessionEpoch: number;
  workspaceId: string;
}

export interface CurrentNavigationStartRequestState {
  accessToken: string;
  activeWorkspaceId: string;
  navigationCleanupRequired: boolean;
  pendingNavigationRestore: boolean;
  principalId: string;
  routePlan: object | null;
  routePlanWorkspaceId: string;
  routePreviewRevision: number;
  sessionEpoch: number;
}

export function isNavigationStartRequestCurrent(
  request: NavigationStartRequestIdentity,
  current: CurrentNavigationStartRequestState,
): boolean {
  return Boolean(
    request.accessToken &&
      request.principalId &&
      current.accessToken === request.accessToken &&
      current.principalId === request.principalId &&
      current.sessionEpoch === request.sessionEpoch &&
      current.routePreviewRevision === request.routePreviewRevision &&
      current.routePlan === request.routePlan &&
      current.routePlanWorkspaceId === request.workspaceId &&
      current.activeWorkspaceId === request.workspaceId &&
      !current.navigationCleanupRequired &&
      !current.pendingNavigationRestore
  );
}
