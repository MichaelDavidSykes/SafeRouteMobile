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
