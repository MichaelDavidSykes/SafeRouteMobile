import type { NetworkAvailabilityStatus } from "../api/networkAvailabilityState";
import { OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS } from "./offlineWorkspaceCacheCore";

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
  | "connection-checking-cached"
  | "connection-checking-empty"
  | "connection-checking-generic"
  | "offline-safety"
  | "verification-unavailable";

export interface WorkspaceAccessAnnouncementTransition {
  announcement: string | null;
  phase: WorkspaceAccessAnnouncementPhase;
}

type WorkspaceCatalogCacheDisclosure = {
  accessibilitySentence: string;
  visibleLabel: string;
};

const WORKSPACE_CATALOG_TIMER_MAX_DELAY_MS = 2_147_483_647;

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
  catalogStoredAtMs = null,
  issue,
  loading,
  networkStatus,
  nowMs = Date.now(),
  previousPhase,
  retrying,
  workspaceContextResolved = true,
}: {
  accessRecoveryPending: boolean;
  availableWorkspaceCount: number;
  catalogStoredAtMs?: number | null;
  issue: WorkspaceAccessIssue;
  loading: boolean;
  networkStatus: NetworkAvailabilityStatus;
  nowMs?: number;
  previousPhase: WorkspaceAccessAnnouncementPhase;
  retrying: boolean;
  workspaceContextResolved?: boolean;
}): WorkspaceAccessAnnouncementTransition {
  if (!workspaceContextResolved) {
    if (networkStatus !== "checking") {
      return {
        announcement: null,
        phase: "idle",
      };
    }
    return {
      announcement:
        previousPhase === "connection-checking-generic"
          ? null
          : "Checking connection. Map downloads are paused.",
      phase: "connection-checking-generic",
    };
  }
  if (networkStatus === "checking") {
    const phase = availableWorkspaceCount > 0
      ? "connection-checking-cached"
      : "connection-checking-empty";
    return {
      announcement:
        previousPhase === phase
          ? null
          : createWorkspaceAccessRefreshState({
              accessRecoveryPending,
              availableWorkspaceCount,
              catalogStoredAtMs,
              issue,
              loading,
              networkStatus,
              nowMs,
            }).accessibilityLabel,
      phase,
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
            catalogStoredAtMs,
            issue,
            loading: true,
            networkStatus,
            nowMs,
          }).accessibilityLabel,
      phase: "checking",
    };
  }

  if (loading) {
    if (
      previousPhase === "connection-checking-cached" ||
      previousPhase === "connection-checking-empty"
    ) {
      return {
        announcement: null,
        phase: previousPhase,
      };
    }
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
        catalogStoredAtMs,
        issue,
        loading: false,
        networkStatus,
        nowMs,
      }).accessibilityLabel,
      phase: issue,
    };
  }

  if (!loading && issue !== "none" && previousPhase !== issue) {
    return {
      announcement: createWorkspaceAccessRefreshState({
        accessRecoveryPending,
        availableWorkspaceCount,
        catalogStoredAtMs,
        issue,
        loading: false,
        networkStatus,
        nowMs,
      }).accessibilityLabel,
      phase: issue,
    };
  }

  return {
    announcement: null,
    phase: issue === "none" ? "idle" : issue,
  };
}

export function shouldArmAutomaticReconnectAnnouncement({
  authenticated,
  networkStatus,
  offlineObserved,
}: {
  authenticated: boolean;
  networkStatus: NetworkAvailabilityStatus;
  offlineObserved: boolean;
}): boolean {
  return authenticated && networkStatus === "checking" && offlineObserved;
}

export function createWorkspaceAccessRefreshState({
  accessRecoveryPending,
  availableWorkspaceCount,
  catalogStoredAtMs = null,
  issue,
  loading,
  networkStatus,
  nowMs = Date.now(),
}: {
  accessRecoveryPending: boolean;
  availableWorkspaceCount: number;
  catalogStoredAtMs?: number | null;
  issue: WorkspaceAccessIssue;
  loading: boolean;
  networkStatus: NetworkAvailabilityStatus;
  nowMs?: number;
}): WorkspaceAccessRefreshState {
  const hasAvailableWorkspace = availableWorkspaceCount > 0;
  const offline = networkStatus === "offline";
  const online = networkStatus === "online";
  const cachedCatalogDisclosure = hasAvailableWorkspace
    ? createWorkspaceCatalogCacheDisclosure(catalogStoredAtMs, nowMs)
    : null;

  if (networkStatus === "checking") {
    return {
      accessibilityHint: "Wait while SafeRoute checks the connection.",
      accessibilityLabel: hasAvailableWorkspace
        ? `Checking connection. ${cachedCatalogDisclosure?.accessibilitySentence} Current workspace access is not verified.`
        : "Checking connection. No workspace is currently available.",
      actionLabel: "Waiting…",
      detail: hasAvailableWorkspace
        ? cachedCatalogDisclosure?.visibleLabel || "Workspace list · review only"
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
          ? `Checking current workspace access. ${cachedCatalogDisclosure?.accessibilitySentence} Current workspace access is not verified.`
          : "Checking current workspace access. No workspace is currently available.",
        actionLabel: "Checking…",
        detail: hasAvailableWorkspace
          ? cachedCatalogDisclosure?.visibleLabel || "Workspace list · review only"
          : "Verifying current membership",
        title: "Checking current access",
      };
    }

    if (hasAvailableWorkspace && accessRecoveryPending) {
      return {
        accessibilityHint:
          "Wait while SafeRoute checks whether workspace membership was restored.",
        accessibilityLabel:
          `Checking current workspace access. ${cachedCatalogDisclosure?.accessibilitySentence} Current workspace access is not verified.`,
        actionLabel: "Checking…",
        detail: cachedCatalogDisclosure?.visibleLabel || "Workspace list · review only",
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
    if (!online) {
      return {
        accessibilityHint:
          "Reconnect, then check whether an administrator restored another workspace membership.",
        accessibilityLabel:
          `Workspace access changed. ${cachedCatalogDisclosure?.accessibilitySentence} Current workspace access is not verified.`,
        actionLabel: "Refresh",
        detail: cachedCatalogDisclosure?.visibleLabel || "Workspace list · review only",
        title: "Workspace access changed",
      };
    }
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
    const cachedCatalogSentence =
      cachedCatalogDisclosure?.accessibilitySentence || "";
    return {
      accessibilityHint: offline
        ? "Reconnect, then activate this control to check current workspace membership."
        : "Retries checking current workspace membership.",
      accessibilityLabel: offline
        ? `Workspace access not verified. ${cachedCatalogSentence} Reconnect, then check current access.`.replace(
            /\s+/g,
            " ",
          )
        : `Workspace access not verified. ${cachedCatalogSentence} Try checking current access again.`.replace(
            /\s+/g,
            " ",
          ),
      actionLabel: offline ? "Check again" : "Try again",
      detail: cachedCatalogDisclosure?.visibleLabel || (
        offline
          ? "Reconnect, then check current access"
          : "Try again to check current access"
      ),
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

export function getWorkspaceCatalogAgeRefreshDelayMs({
  catalogStoredAtMs,
  nowMs = Date.now(),
}: {
  catalogStoredAtMs: number;
  nowMs?: number;
}): number | null {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(catalogStoredAtMs) ||
    catalogStoredAtMs > nowMs ||
    nowMs - catalogStoredAtMs > OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS
  ) {
    return null;
  }

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const ageMs = nowMs - catalogStoredAtMs;
  const bucketMs = ageMs < dayMs ? hourMs : dayMs;
  const nextAgeBoundaryMs =
    catalogStoredAtMs + (Math.floor(ageMs / bucketMs) + 1) * bucketMs;
  const expiryBoundaryMs =
    catalogStoredAtMs + OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS + 1;

  return Math.max(
    1,
    Math.min(
      WORKSPACE_CATALOG_TIMER_MAX_DELAY_MS,
      nextAgeBoundaryMs - nowMs,
      expiryBoundaryMs - nowMs,
    ),
  );
}

export function getWorkspaceCatalogExpiryDelayMs({
  nowMs = Date.now(),
  retentionStoredAtMs,
}: {
  nowMs?: number;
  retentionStoredAtMs: number;
}): number | null {
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(retentionStoredAtMs) ||
    retentionStoredAtMs > nowMs ||
    nowMs - retentionStoredAtMs > OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS
  ) {
    return null;
  }
  return Math.max(
    1,
    Math.min(
      WORKSPACE_CATALOG_TIMER_MAX_DELAY_MS,
      retentionStoredAtMs + OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS + 1 - nowMs,
    ),
  );
}

function createWorkspaceCatalogCacheDisclosure(
  catalogStoredAtMs: number | null,
  nowMs: number,
): WorkspaceCatalogCacheDisclosure {
  if (
    catalogStoredAtMs === null ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(catalogStoredAtMs) ||
    catalogStoredAtMs > nowMs ||
    nowMs - catalogStoredAtMs > OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS
  ) {
    return {
      accessibilitySentence:
        "The saved time for this workspace list is unavailable. It is review only and does not verify access or the age of routes, risk intelligence, or operations.",
      visibleLabel: "Workspace list age unavailable · review only",
    };
  }

  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;
  const ageMs = nowMs - catalogStoredAtMs;
  let spokenAge: string;
  let visibleAge: string;
  if (ageMs < hourMs) {
    spokenAge = "less than one hour ago";
    visibleAge = "<1h ago";
  } else if (ageMs < dayMs) {
    const hours = Math.floor(ageMs / hourMs);
    spokenAge = `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
    visibleAge = `${hours}h ago`;
  } else {
    const days = Math.floor(ageMs / dayMs);
    spokenAge = `${days} ${days === 1 ? "day" : "days"} ago`;
    visibleAge = `${days}d ago`;
  }

  return {
    accessibilitySentence:
      `This workspace list was cached ${spokenAge} for review only. It does not verify access or the age of routes, risk intelligence, or operations.`,
    visibleLabel: `Workspace list cached ${visibleAge} · review only`,
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
