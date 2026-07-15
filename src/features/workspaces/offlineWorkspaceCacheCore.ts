import {
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
  type SafeRouteWorkspace,
} from "./activeWorkspace";

export const OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_WORKSPACE_CACHE_SCHEMA = 3;
const LEGACY_OFFLINE_WORKSPACE_CACHE_SCHEMA = 2;

export type OfflineWorkspaceContext = {
  activeWorkspaceId: string | null;
  unavailableWorkspaceIds?: string[];
  workspaces: SafeRouteWorkspace[];
};

export type OfflineWorkspaceSnapshot = Omit<OfflineWorkspaceContext, "unavailableWorkspaceIds"> & {
  principalId: string;
  unavailableWorkspaceIds: string[];
};

export type OfflineWorkspaceRecordWriter = (
  key: string,
  value: string,
) => Promise<void>;

export type WorkspaceRecoveryPersistenceResult = "failed" | "persisted" | "revoked";

type OfflineWorkspaceCacheRecord = {
  principalId: string;
  schema: number;
  storedAtMs: number;
  value: OfflineWorkspaceContext & { unavailableWorkspaceIds: string[] };
};

export function createOfflineWorkspaceCacheRecord(
  value: OfflineWorkspaceContext,
  principalIdValue: string,
  nowMs = Date.now(),
): OfflineWorkspaceCacheRecord {
  const principalId = normalizePrincipalId(principalIdValue);
  const unavailableWorkspaceIds = normalizeWorkspaceIds(
    value.unavailableWorkspaceIds || [],
  );
  const unavailableIds = new Set(unavailableWorkspaceIds);
  const workspaces = normalizeWorkspaceCatalog(value.workspaces).filter(
    (workspace) => !unavailableIds.has(workspace.id),
  );
  const activeWorkspace = resolveActiveWorkspace(
    workspaces,
    value.activeWorkspaceId,
    null,
  );

  return {
    principalId,
    schema: OFFLINE_WORKSPACE_CACHE_SCHEMA,
    storedAtMs: nowMs,
    value: {
      activeWorkspaceId: activeWorkspace?.id || null,
      unavailableWorkspaceIds,
      workspaces,
    },
  };
}

export function parseOfflineWorkspaceCacheRecord(
  value: unknown,
  expectedPrincipalIdValue: string,
  nowMs = Date.now(),
): OfflineWorkspaceSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<OfflineWorkspaceCacheRecord>;
  const expectedPrincipalId = normalizePrincipalId(expectedPrincipalIdValue);
  const principalId = normalizePrincipalId(record.principalId);
  if (
    !expectedPrincipalId ||
    principalId !== expectedPrincipalId ||
    (record.schema !== OFFLINE_WORKSPACE_CACHE_SCHEMA &&
      record.schema !== LEGACY_OFFLINE_WORKSPACE_CACHE_SCHEMA) ||
    !Number.isFinite(record.storedAtMs) ||
    (record.storedAtMs as number) > nowMs ||
    nowMs - (record.storedAtMs as number) > OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS ||
    !record.value ||
    !Array.isArray(record.value.workspaces) ||
    (record.schema === OFFLINE_WORKSPACE_CACHE_SCHEMA &&
      !Array.isArray(record.value.unavailableWorkspaceIds))
  ) {
    return null;
  }

  const normalized = createOfflineWorkspaceCacheRecord(
    {
      ...record.value,
      unavailableWorkspaceIds:
        record.schema === OFFLINE_WORKSPACE_CACHE_SCHEMA
          ? record.value.unavailableWorkspaceIds
          : [],
    },
    principalId,
    record.storedAtMs,
  ).value;
  return {
    ...normalized,
    principalId,
  };
}

function normalizePrincipalId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeWorkspaceIds(values: Iterable<unknown>): string[] {
  return Array.from(
    new Set(
      Array.from(values, (value) =>
        typeof value === "string" ? value.trim() : "",
      ).filter(Boolean),
    ),
  ).sort();
}

export function createSerializedWorkspaceRecordWriter(
  writeRecord: OfflineWorkspaceRecordWriter,
): OfflineWorkspaceRecordWriter {
  const pendingWrites = new Map<string, Promise<void>>();

  return async (key, value) => {
    const previousWrite = pendingWrites.get(key) || Promise.resolve();
    const currentWrite = previousWrite
      .catch(() => undefined)
      .then(() => writeRecord(key, value));
    pendingWrites.set(key, currentWrite);

    try {
      await currentWrite;
    } finally {
      if (pendingWrites.get(key) === currentWrite) {
        pendingWrites.delete(key);
      }
    }
  };
}

export type SerializedWorkspaceRecoveryExecutor = <Result>(
  key: string,
  operation: () => Promise<Result>,
) => Promise<Result>;

export function createSerializedWorkspaceRecoveryExecutor(): SerializedWorkspaceRecoveryExecutor {
  const pendingRecoveries = new Map<string, Promise<unknown>>();

  return async <Result>(key: string, operation: () => Promise<Result>) => {
    const previousRecovery = pendingRecoveries.get(key) || Promise.resolve();
    const currentRecovery = previousRecovery
      .catch(() => undefined)
      .then(operation);
    pendingRecoveries.set(key, currentRecovery);

    try {
      return await currentRecovery;
    } finally {
      if (pendingRecoveries.get(key) === currentRecovery) {
        pendingRecoveries.delete(key);
      }
    }
  };
}

export async function persistWorkspaceRecoveryWithFallback({
  clearFallback,
  persistFallback,
  persistPrimary,
  requireFallback = false,
}: {
  clearFallback: () => Promise<void>;
  persistFallback: () => Promise<void>;
  persistPrimary: Array<() => Promise<void>>;
  requireFallback?: boolean;
}): Promise<WorkspaceRecoveryPersistenceResult> {
  let fallbackPersisted = false;
  try {
    await persistFallback();
    fallbackPersisted = true;
  } catch {
    // Independent primary records can still make the recovery durable.
  }
  if (requireFallback && !fallbackPersisted) {
    return "failed";
  }

  const primaryResults = await Promise.allSettled(
    persistPrimary.map((persist) => persist()),
  );
  if (primaryResults.some((result) => result.status === "rejected")) {
    return fallbackPersisted ? "revoked" : "failed";
  }

  if (!fallbackPersisted) {
    return "persisted";
  }

  try {
    await clearFallback();
    return "persisted";
  } catch {
    // Retaining the independent revocation is safe and suppresses stale caches.
    return "revoked";
  }
}

export function createWorkspaceRecoveryRevocationRecord(
  principalIdValue: string,
  unavailableWorkspaceIds: Iterable<string>,
): string {
  return JSON.stringify({
    principalId: normalizePrincipalId(principalIdValue),
    unavailableWorkspaceIds: normalizeWorkspaceIds(unavailableWorkspaceIds),
  });
}

export function parseWorkspaceRecoveryRevocationRecord(
  raw: string,
  principalIdValue: string,
): string[] | null {
  const principalId = normalizePrincipalId(principalIdValue);
  try {
    const record = JSON.parse(raw) as {
      principalId?: unknown;
      unavailableWorkspaceIds?: unknown;
    };
    if (
      normalizePrincipalId(record.principalId) !== principalId ||
      !Array.isArray(record.unavailableWorkspaceIds)
    ) {
      return null;
    }
    return normalizeWorkspaceIds(record.unavailableWorkspaceIds);
  } catch {
    return null;
  }
}
