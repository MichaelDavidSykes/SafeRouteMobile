export type WorkspaceAppState =
  | "active"
  | "background"
  | "extension"
  | "inactive"
  | "unknown";

export interface WorkspaceForegroundRevalidationDecision {
  backgrounded: boolean;
  revalidate: boolean;
}

interface WorkspaceNavigationIdentity {
  accessScope:
    | { kind: "public" }
    | { clientId: string; kind: "workspace"; principalId: string };
  navigationInstanceId: string;
  routePlan: {
    id: string;
  };
}

export function isCurrentWorkspaceNavigationContinuation(
  currentSession: WorkspaceNavigationIdentity | null,
  nextSession: WorkspaceNavigationIdentity,
): boolean {
  return Boolean(
    currentSession &&
      currentSession.accessScope.kind === "workspace" &&
      nextSession.accessScope.kind === "workspace" &&
      currentSession.navigationInstanceId === nextSession.navigationInstanceId &&
      currentSession.routePlan.id === nextSession.routePlan.id &&
      currentSession.accessScope.clientId === nextSession.accessScope.clientId &&
      currentSession.accessScope.principalId === nextSession.accessScope.principalId,
  );
}

export function resolveWorkspaceForegroundRevalidation({
  authenticated,
  backgrounded,
  catalogBusy,
  nextAppState,
  previewSession,
  refreshPending,
  sessionCleanupPending,
  stablePrincipal,
}: {
  authenticated: boolean;
  backgrounded: boolean;
  catalogBusy: boolean;
  nextAppState: WorkspaceAppState;
  previewSession: boolean;
  refreshPending: boolean;
  sessionCleanupPending: boolean;
  stablePrincipal: boolean;
}): WorkspaceForegroundRevalidationDecision {
  if (nextAppState === "background") {
    return { backgrounded: true, revalidate: false };
  }

  if (nextAppState !== "active") {
    return { backgrounded, revalidate: false };
  }

  const eligibleForRevalidation =
    authenticated && stablePrincipal && !previewSession;
  if (!backgrounded || !eligibleForRevalidation) {
    return { backgrounded: false, revalidate: false };
  }

  if (catalogBusy || refreshPending || sessionCleanupPending) {
    return { backgrounded: true, revalidate: false };
  }

  return {
    backgrounded: false,
    revalidate: true,
  };
}
