import type { SafeRouteWorkspace } from "./activeWorkspace";

function normalizeWorkspaceId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function reconcileUnavailableWorkspaceIds({
  allowFreshRestoration,
  freshWorkspaces,
  unavailableWorkspaceIds,
}: {
  allowFreshRestoration: boolean;
  freshWorkspaces: SafeRouteWorkspace[];
  unavailableWorkspaceIds: Iterable<string>;
}): Set<string> {
  const unavailable = new Set(
    Array.from(unavailableWorkspaceIds, normalizeWorkspaceId).filter(Boolean),
  );

  if (!allowFreshRestoration) {
    return unavailable;
  }

  for (const workspace of freshWorkspaces) {
    const workspaceId = normalizeWorkspaceId(workspace?.id);
    if (workspaceId) {
      unavailable.delete(workspaceId);
    }
  }

  return unavailable;
}

export function findRestoredWorkspaceIds(
  previousUnavailableWorkspaceIds: Iterable<string>,
  nextUnavailableWorkspaceIds: Iterable<string>,
): string[] {
  const nextUnavailableIds = new Set(
    Array.from(nextUnavailableWorkspaceIds, normalizeWorkspaceId).filter(Boolean),
  );
  return Array.from(
    new Set(
      Array.from(previousUnavailableWorkspaceIds, normalizeWorkspaceId).filter(Boolean),
    ),
  ).filter((workspaceId) => !nextUnavailableIds.has(workspaceId));
}
