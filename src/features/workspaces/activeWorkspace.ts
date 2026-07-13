import type { MobileSafeRouteClient } from "../routes/routeMapper";

export type SafeRouteWorkspace = MobileSafeRouteClient;

function normalizeWorkspaceId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWorkspaceName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function normalizeWorkspaceCatalog(
  clients: MobileSafeRouteClient[],
): SafeRouteWorkspace[] {
  const seen = new Set<string>();
  const workspaces: SafeRouteWorkspace[] = [];

  for (const client of clients) {
    const id = normalizeWorkspaceId(client?.id);
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    workspaces.push({
      id,
      name: normalizeWorkspaceName(client?.name) || "SafeRoute workspace",
    });
  }

  return workspaces;
}

export function resolveActiveWorkspace(
  workspaces: SafeRouteWorkspace[],
  currentWorkspaceId?: string | null,
  preferredWorkspaceId?: string | null,
): SafeRouteWorkspace | null {
  const catalog = normalizeWorkspaceCatalog(workspaces);
  const currentId = normalizeWorkspaceId(currentWorkspaceId);
  const preferredId = normalizeWorkspaceId(preferredWorkspaceId);

  if (currentId) {
    const current = catalog.find((workspace) => workspace.id === currentId);
    if (current) {
      return current;
    }
  }

  if (preferredId) {
    const preferred = catalog.find((workspace) => workspace.id === preferredId);
    if (preferred) {
      return preferred;
    }
  }

  return catalog.length === 1 ? catalog[0] : null;
}

export function findWorkspace(
  workspaces: SafeRouteWorkspace[],
  workspaceId?: string | null,
): SafeRouteWorkspace | null {
  const normalizedId = normalizeWorkspaceId(workspaceId);
  if (!normalizedId) {
    return null;
  }

  return normalizeWorkspaceCatalog(workspaces).find(
    (workspace) => workspace.id === normalizedId,
  ) || null;
}
