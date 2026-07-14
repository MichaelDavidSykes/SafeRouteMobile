export interface WorkspaceAccessRefreshState {
  accessibilityHint: string;
  accessibilityLabel: string;
  actionLabel: string;
  detail: string;
  title: string;
}

export function createWorkspaceAccessRefreshState({
  availableWorkspaceCount,
  loading,
}: {
  availableWorkspaceCount: number;
  loading: boolean;
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

  if (hasAvailableWorkspace) {
    return {
      accessibilityHint: "Checks whether an administrator restored another workspace membership.",
      accessibilityLabel: "Workspace access changed. Check for restored access.",
      actionLabel: "Refresh",
      detail: "Check for restored access",
      title: "Workspace access changed",
    };
  }

  return {
    accessibilityHint: "Checks whether an administrator restored workspace membership.",
    accessibilityLabel:
      "No workspace access. Ask an administrator to restore access, then check again.",
    actionLabel: "Check again",
    detail: "Ask an admin to restore access, then check again",
    title: "No workspace access",
  };
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
