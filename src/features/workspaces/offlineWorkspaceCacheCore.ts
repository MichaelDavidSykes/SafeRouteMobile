import {
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
  type SafeRouteWorkspace,
} from "./activeWorkspace";

export const OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_WORKSPACE_CACHE_SCHEMA = 1;

export type OfflineWorkspaceContext = {
  activeWorkspaceId: string | null;
  workspaces: SafeRouteWorkspace[];
};

type OfflineWorkspaceCacheRecord = {
  schema: number;
  storedAtMs: number;
  value: OfflineWorkspaceContext;
};

export function createOfflineWorkspaceCacheRecord(
  value: OfflineWorkspaceContext,
  nowMs = Date.now(),
): OfflineWorkspaceCacheRecord {
  const workspaces = normalizeWorkspaceCatalog(value.workspaces);
  const activeWorkspace = resolveActiveWorkspace(
    workspaces,
    value.activeWorkspaceId,
    null,
  );

  return {
    schema: OFFLINE_WORKSPACE_CACHE_SCHEMA,
    storedAtMs: nowMs,
    value: {
      activeWorkspaceId: activeWorkspace?.id || null,
      workspaces,
    },
  };
}

export function parseOfflineWorkspaceCacheRecord(
  value: unknown,
  nowMs = Date.now(),
): OfflineWorkspaceContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<OfflineWorkspaceCacheRecord>;
  if (
    record.schema !== OFFLINE_WORKSPACE_CACHE_SCHEMA ||
    !Number.isFinite(record.storedAtMs) ||
    (record.storedAtMs as number) > nowMs ||
    nowMs - (record.storedAtMs as number) > OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS ||
    !record.value ||
    !Array.isArray(record.value.workspaces)
  ) {
    return null;
  }

  return createOfflineWorkspaceCacheRecord(record.value, record.storedAtMs).value;
}
