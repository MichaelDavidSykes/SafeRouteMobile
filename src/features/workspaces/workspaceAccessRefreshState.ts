export interface WorkspaceAccessRefreshState {
  accessibilityHint: string;
  accessibilityLabel: string;
  actionLabel: string;
  detail: string;
  title: string;
}

export type WorkspaceAccessIssue =
  | "none"
  | "offline-safety"
  | "verification-unavailable";

export type WorkspaceAccessAnnouncementPhase =
  | "idle"
  | "checking"
  | "connection-checking"
  | "offline-safety"
  | "verification-unavailable";

export interface WorkspaceAccessAnnouncementTransition {
  announcement: string | null;
  phase: WorkspaceAccessAnnouncementPhase;
}

export function completeWorkspaceCatalogRetry(
  retryingRef: { current: boolean },
  setRetrying: (retrying: boolean) => void,
): boolean {
  const wasRetrying = retryingRef.current;
  retryingRef.current = false;
  setRetrying(false);
  return wasRetrying;
}

export function resolveWorkspaceAccessAnnouncement({
  accessRecoveryPending,
  availableWorkspaceCount,
  issue,
  loading,
  networkStatus,
  previousPhase,
  retrying,
}: {
  accessRecoveryPending: boolean;
  availableWorkspaceCount: number;
  issue: WorkspaceAccessIssue;
  loading: boolean;
  networkStatus: NetworkAvailabilityStatus;
  previousPhase: WorkspaceAccessAnnouncementPhase;
  retrying: boolean;
}): WorkspaceAccessAnnouncementTransition {
  if (networkStatus === "checking") {
    return {
      announcement:
        previousPhase === "connection-checking"
          ? null
          : createWorkspaceAccessRefreshState({
              accessRecoveryPending,
              availableWorkspaceCount,
              issue,
              loading,
              networkStatus,
            }).accessibilityLabel,
      phase: "connection-checking",
    };
  }

  if (retrying) {
    return {
      announcement:
        previousPhase === "checking"
          ? null
          : createWorkspaceAccessRefreshState({
              accessRecoveryPending,
              availableWorkspaceCount,
              issue,
              loading: true,
              networkStatus,
            }).accessibilityLabel,
      phase: "checking",
    };
  }

  if (loading) {
    return {
      announcement: null,
      phase: "checking",
    };
  }

  if (previousPhase === "checking" && !loading && issue !== "none") {
    return {
      announcement: createWorkspaceAccessRefreshState({
        accessRecoveryPending,
        availableWorkspaceCount,
        issue,
        loading: false,
        networkStatus,
      }).accessibilityLabel,
      phase: issue,
    };
  }

  if (!loading && issue !== "none" && previousPhase !== issue) {
    return {
      announcement: createWorkspaceAccessRefreshState({
        accessRecoveryPending,
        availableWorkspaceCount,
        issue,
        loading: false,
        networkStatus,
      }).accessibilityLabel,
      phase: issue,
    };
  }

  return {
    announcement: null,
    phase: issue === "none" ? "idle" : issue,
  };
}

export function createWorkspaceAccessRefreshState({
  accessRecoveryPending,
  availableWorkspaceCount,
  issue,
  loading,
  networkStatus,
}: {
  accessRecoveryPending: boolean;
  availableWorkspaceCount: number;
  issue: WorkspaceAccessIssue;
  loading: boolean;
  networkStatus: NetworkAvailabilityStatus;
}): WorkspaceAccessRefreshState {
  const hasAvailableWorkspace = availableWorkspaceCount > 0;
  const offline = networkStatus === "offline";

  if (networkStatus === "checking") {
    return {
      accessibilityHint: "Wait while SafeRoute checks the connection.",
      accessibilityLabel: hasAvailableWorkspace
        ? "Checking connection. Cached workspace remains available for review only."
        : "Checking connection. No workspace is currently available.",
      actionLabel: "Waiting…",
      detail: hasAvailableWorkspace
        ? "Cached workspace remains review only"
        : "Waiting for connectivity",
      title: "Checking connection",
    };
  }

  if (loading) {
    if (issue === "offline-safety") {
      return {
        accessibilityHint: "Wait while SafeRoute secures offline workspace data.",
        accessibilityLabel: "Securing offline workspace data.",
        actionLabel: "Securing…",
        detail: "Finishing protected offline cleanup",
        title: "Securing offline access",
      };
    }

    if (issue === "verification-unavailable" && !accessRecoveryPending) {
      return {
        accessibilityHint: "Wait while SafeRoute verifies current workspace membership.",
        accessibilityLabel: hasAvailableWorkspace
          ? "Checking current workspace access. Cached workspace remains available for review only."
          : "Checking current workspace access. No workspace is currently available.",
        actionLabel: "Checking…",
        detail: hasAvailableWorkspace
          ? "Cached workspace remains review only"
          : "Verifying current membership",
        title: "Checking current access",
      };
    }

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

  if (accessRecoveryPending) {
    return {
      accessibilityHint: "Checks whether an administrator restored workspace membership.",
      accessibilityLabel:
        "No workspace access. Ask an administrator to restore access, then check again.",
      actionLabel: "Check again",
      detail: "Ask an admin to restore access, then check again",
      title: "No workspace access",
    };
  }

  if (issue === "offline-safety") {
    return {
      accessibilityHint: offline
        ? "Reconnect, then activate this control to finish securing offline workspace data."
        : "Retries protected offline workspace cleanup.",
      accessibilityLabel: offline
        ? "Offline safety needs retry. Reconnect, then finish offline cleanup."
        : "Offline safety needs retry. Finish offline cleanup.",
      actionLabel: "Retry",
      detail: offline
        ? "Reconnect, then finish offline cleanup"
        : "Finish protected offline cleanup",
      title: "Offline safety needs retry",
    };
  }

  if (issue === "verification-unavailable") {
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

  if (!hasAvailableWorkspace) {
    return {
      accessibilityHint: "Checks whether an administrator restored workspace membership.",
      accessibilityLabel:
        "No workspace access. Ask an administrator to restore access, then check again.",
      actionLabel: "Check again",
      detail: "Ask an admin to restore access, then check again",
      title: "No workspace access",
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
  issue,
  catalogLoading,
  catalogRetrying,
}: {
  accessRecoveryPending: boolean;
  authenticated: boolean;
  availableWorkspaceCount: number;
  issue: WorkspaceAccessIssue;
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

  return !catalogLoading && (issue !== "none" || availableWorkspaceCount === 0);
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
import type { NetworkAvailabilityStatus } from "../api/networkAvailabilityState";
