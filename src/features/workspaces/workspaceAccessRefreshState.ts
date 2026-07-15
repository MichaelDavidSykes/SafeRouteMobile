export interface WorkspaceAccessRefreshState {
  accessibilityHint: string;
  accessibilityLabel: string;
  actionLabel: string;
  detail: string;
  title: string;
}

export function createWorkspaceAccessRefreshState({
  accessRecoveryPending,
  availableWorkspaceCount,
  loading,
  offline,
  verificationUnavailable,
}: {
  accessRecoveryPending: boolean;
  availableWorkspaceCount: number;
  loading: boolean;
  offline: boolean;
  verificationUnavailable: boolean;
}): WorkspaceAccessRefreshState {
  const hasAvailableWorkspace = availableWorkspaceCount > 0;

  if (loading) {
    return {
      accessibilityHint: "Wait while SafeRoute checks current workspace membership.",
      accessibilityLabel: hasAvailableWorkspace
        ? "Refreshing workspace access. Current workspace remains available."
        : "Refreshing workspace access. No workspace is currently available.",
      actionLabel: "Checking…",
      detail: hasAvailableWorkspace
        ? "Looking for restored workspaces"
        : "Looking for restored membership",
      title: "Checking workspace access",
    };
  }

  if (accessRecoveryPending && hasAvailableWorkspace) {
    return {
      accessibilityHint: "Checks whether an administrator restored another workspace membership.",
      accessibilityLabel: "Workspace access changed. Check for restored access.",
      actionLabel: "Refresh",
      detail: "Check for restored access",
      title: "Workspace access changed",
    };
  }

  if (accessRecoveryPending || (!hasAvailableWorkspace && !verificationUnavailable)) {
    return {
      accessibilityHint: "Checks whether an administrator restored workspace membership.",
      accessibilityLabel:
        "No workspace access. Ask an administrator to restore access, then check again.",
      actionLabel: "Check again",
      detail: "Ask an admin to restore access, then check again",
      title: "No workspace access",
    };
  }

  if (verificationUnavailable) {
    return {
      accessibilityHint: offline
        ? "Reconnect, then activate this control to check current workspace membership."
        : "Retries checking current workspace membership.",
      accessibilityLabel: offline
        ? "Workspace access not verified. Reconnect, then check current access."
        : "Workspace access not verified. Try checking current access again.",
      actionLabel: offline ? "Check again" : "Try again",
      detail: offline
        ? "Reconnect, then check current access"
        : "Try again to check current access",
      title: "Workspace access not verified",
    };
  }

  return {
    accessibilityHint: "Checks current workspace membership.",
    accessibilityLabel: "Check current workspace access.",
    actionLabel: "Check again",
    detail: "Check current access",
    title: "Workspace access",
  };
}

export function shouldOfferWorkspaceAccessRefresh({
  accessRecoveryPending,
  authenticated,
  availableWorkspaceCount,
  catalogError,
  catalogLoading,
  catalogRetrying,
}: {
  accessRecoveryPending: boolean;
  authenticated: boolean;
  availableWorkspaceCount: number;
  catalogError: boolean;
  catalogLoading: boolean;
  catalogRetrying: boolean;
}): boolean {
  if (!authenticated) {
    return false;
  }

  if (accessRecoveryPending) {
    return true;
  }

  if (catalogRetrying) {
    return true;
  }

  return !catalogLoading && (catalogError || availableWorkspaceCount === 0);
}

export function shouldStackWorkspaceAccessControl({
  fontScale,
  width,
}: {
  fontScale: number;
  width: number;
}): boolean {
  return width < 390 || fontScale >= 1.3;
}
