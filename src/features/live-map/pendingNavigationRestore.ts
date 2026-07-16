import type { ActiveNavigationSession } from "./activeNavigationSessionCore";

export type PendingNavigationRestoreResolution =
  | "none"
  | "resume"
  | "stale";

function hasMatchingAccessScope(
  current: ActiveNavigationSession,
  candidate: ActiveNavigationSession,
): boolean {
  if (current.accessScope.kind !== candidate.accessScope.kind) {
    return false;
  }

  if (
    current.accessScope.kind === "public" ||
    candidate.accessScope.kind === "public"
  ) {
    return true;
  }

  return (
    current.accessScope.clientId === candidate.accessScope.clientId &&
    current.accessScope.principalId === candidate.accessScope.principalId
  );
}

export function isCurrentPendingNavigationRestore(
  current: ActiveNavigationSession | null,
  candidate: ActiveNavigationSession | null,
): boolean {
  return Boolean(
    current &&
      candidate &&
      current.navigationInstanceId === candidate.navigationInstanceId &&
      current.routeContext === candidate.routeContext &&
      current.routePlan.id === candidate.routePlan.id &&
      current.routePlan.route.id === candidate.routePlan.route.id &&
      hasMatchingAccessScope(current, candidate),
  );
}

export function resolvePendingNavigationRestore({
  candidate,
  current,
}: {
  candidate: ActiveNavigationSession | null;
  current: ActiveNavigationSession | null;
}): PendingNavigationRestoreResolution {
  if (!candidate) {
    return "none";
  }

  if (!isCurrentPendingNavigationRestore(current, candidate)) {
    return "stale";
  }

  return "resume";
}
