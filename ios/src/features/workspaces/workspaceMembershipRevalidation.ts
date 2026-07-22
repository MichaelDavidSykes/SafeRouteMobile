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

export async function findVerifiedRestoredWorkspaceIds({
  freshWorkspaces,
  unavailableWorkspaceIds,
  verifyWorkspace,
}: {
  freshWorkspaces: SafeRouteWorkspace[];
  unavailableWorkspaceIds: Iterable<string>;
  verifyWorkspace: (workspaceId: string) => Promise<boolean>;
}): Promise<string[]> {
  const freshWorkspaceIds = new Set(
    freshWorkspaces.map((workspace) => normalizeWorkspaceId(workspace?.id)).filter(Boolean),
  );
  const candidates = Array.from(
    new Set(
      Array.from(unavailableWorkspaceIds, normalizeWorkspaceId).filter(
        (workspaceId) => workspaceId && freshWorkspaceIds.has(workspaceId),
      ),
    ),
  );
  const verificationResults = await Promise.all(
    candidates.map(async (workspaceId) => ({
      restored: await verifyWorkspace(workspaceId),
      workspaceId,
    })),
  );

  return verificationResults
    .filter(({ restored }) => restored)
    .map(({ workspaceId }) => workspaceId);
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
