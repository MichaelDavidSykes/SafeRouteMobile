import {
  normalizeWorkspaceCatalog,
  resolveActiveWorkspace,
  type SafeRouteWorkspace,
} from "./activeWorkspace";

export const OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const OFFLINE_WORKSPACE_CACHE_SCHEMA = 4;
const LEGACY_OFFLINE_WORKSPACE_CACHE_SCHEMAS = new Set([2, 3]);

export type OfflineWorkspaceContext = {
  activeWorkspaceId: string | null;
  unavailableWorkspaceIds?: string[];
  workspaces: SafeRouteWorkspace[];
};

export type OfflineWorkspaceSnapshot = Omit<OfflineWorkspaceContext, "unavailableWorkspaceIds"> & {
  catalogStoredAtMs: number | null;
  principalId: string;
  retentionStoredAtMs: number | null;
  unavailableWorkspaceIds: string[];
};

export type OfflineWorkspaceCacheFreshness = Pick<
  OfflineWorkspaceSnapshot,
  "catalogStoredAtMs" | "retentionStoredAtMs"
>;

export type OfflineWorkspaceRecordWriter = (
  key: string,
  value: string,
) => Promise<void>;

export type WorkspaceRecoveryPersistenceResult = "failed" | "persisted" | "revoked";

type OfflineWorkspaceCacheRecord = {
  catalogStoredAtMs: number | null;
  principalId: string;
  retentionStoredAtMs: number;
  schema: number;
  storedAtMs: number;
  value: OfflineWorkspaceContext & { unavailableWorkspaceIds: string[] };
};

export function createOfflineWorkspaceCacheRecord(
  value: OfflineWorkspaceContext,
  principalIdValue: string,
  nowMs = Date.now(),
  freshness: OfflineWorkspaceCacheFreshness = {
    catalogStoredAtMs: nowMs,
    retentionStoredAtMs: nowMs,
  },
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
    catalogStoredAtMs: freshness.catalogStoredAtMs,
    principalId,
    retentionStoredAtMs:
      freshness.retentionStoredAtMs === null
        ? nowMs
        : freshness.retentionStoredAtMs,
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
  const schema = record.schema;
  const expectedPrincipalId = normalizePrincipalId(expectedPrincipalIdValue);
  const principalId = normalizePrincipalId(record.principalId);
  const currentSchema = schema === OFFLINE_WORKSPACE_CACHE_SCHEMA;
  const legacySchema =
    typeof schema === "number" &&
    LEGACY_OFFLINE_WORKSPACE_CACHE_SCHEMAS.has(schema);
  const retentionStoredAtMs = currentSchema
    ? record.retentionStoredAtMs
    : record.storedAtMs;
  const catalogStoredAtMs = currentSchema
    ? record.catalogStoredAtMs
    : null;
  if (
    !expectedPrincipalId ||
    principalId !== expectedPrincipalId ||
    (!currentSchema && !legacySchema) ||
    !Number.isFinite(record.storedAtMs) ||
    (record.storedAtMs as number) > nowMs ||
    !Number.isFinite(retentionStoredAtMs) ||
    (retentionStoredAtMs as number) > nowMs ||
    nowMs - (retentionStoredAtMs as number) > OFFLINE_WORKSPACE_CACHE_MAX_AGE_MS ||
    (currentSchema &&
      catalogStoredAtMs !== null &&
      (
        !Number.isFinite(catalogStoredAtMs) ||
        catalogStoredAtMs !== retentionStoredAtMs
      )) ||
    !record.value ||
    !Array.isArray(record.value.workspaces) ||
    ((currentSchema || schema === 3) &&
      !Array.isArray(record.value.unavailableWorkspaceIds))
  ) {
    return null;
  }

  const unavailableWorkspaceIds =
    currentSchema || schema === 3
      ? record.value.unavailableWorkspaceIds
      : [];
  const normalized = normalizeOfflineWorkspaceContext({
    ...record.value,
    unavailableWorkspaceIds,
  });
  return {
    ...normalized,
    catalogStoredAtMs:
      typeof catalogStoredAtMs === "number" ? catalogStoredAtMs : null,
    principalId,
    retentionStoredAtMs: retentionStoredAtMs as number,
  };
}

export async function persistLatestOfflineWorkspaceSelection({
  loadCurrent,
  persistContext,
  principalId: principalIdValue,
  workspaceId: workspaceIdValue,
}: {
  loadCurrent: () => Promise<OfflineWorkspaceSnapshot | null>;
  persistContext: (
    context: OfflineWorkspaceContext,
    freshness: OfflineWorkspaceCacheFreshness,
  ) => Promise<void>;
  principalId: string;
  workspaceId: string;
}): Promise<OfflineWorkspaceSnapshot | null> {
  const principalId = normalizePrincipalId(principalIdValue);
  const workspaceId = workspaceIdValue.trim();
  const current = await loadCurrent();
  if (
    !principalId ||
    !workspaceId ||
    current?.principalId !== principalId ||
    !Number.isFinite(current.retentionStoredAtMs) ||
    current.unavailableWorkspaceIds.includes(workspaceId) ||
    !current.workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return null;
  }

  const nextContext: OfflineWorkspaceContext = {
    activeWorkspaceId: workspaceId,
    unavailableWorkspaceIds: current.unavailableWorkspaceIds,
    workspaces: current.workspaces,
  };
  const freshness: OfflineWorkspaceCacheFreshness = {
    catalogStoredAtMs: current.catalogStoredAtMs ?? null,
    retentionStoredAtMs: current.retentionStoredAtMs,
  };
  await persistContext(nextContext, freshness);
  const persisted = await loadCurrent();
  if (
    persisted?.principalId !== principalId ||
    persisted.activeWorkspaceId !== workspaceId ||
    persisted.unavailableWorkspaceIds.includes(workspaceId) ||
    !persisted.workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return null;
  }
  return persisted;
}

export async function reconcileLatestOfflineWorkspaceSelection({
  clearFallback,
  context,
  loadCurrent,
  persistContext,
  persistFallback,
  principalId: principalIdValue,
}: {
  clearFallback: () => Promise<void>;
  context: OfflineWorkspaceContext;
  loadCurrent: () => Promise<OfflineWorkspaceSnapshot | null>;
  persistContext: (
    context: OfflineWorkspaceContext,
    freshness: OfflineWorkspaceCacheFreshness,
  ) => Promise<void>;
  persistFallback: () => Promise<void>;
  principalId: string;
}): Promise<WorkspaceRecoveryPersistenceResult> {
  const principalId = normalizePrincipalId(principalIdValue);
  const normalizedContext = normalizeOfflineWorkspaceContext(context);
  let current: OfflineWorkspaceSnapshot | null = null;
  try {
    current = await loadCurrent();
  } catch {
    // The independent fallback below suppresses a possibly half-written
    // selection when the primary record cannot be read safely.
  }
  const freshness =
    current?.principalId === principalId &&
    Number.isFinite(current.retentionStoredAtMs)
      ? {
          catalogStoredAtMs: current.catalogStoredAtMs,
          retentionStoredAtMs: current.retentionStoredAtMs,
        }
      : null;

  return persistWorkspaceRecoveryWithFallback({
    clearFallback,
    persistFallback,
    persistPrimary: [
      async () => {
        if (!principalId || !freshness) {
          throw new Error("Workspace selection freshness is unavailable");
        }
        await persistContext(normalizedContext, freshness);
        const persisted = await loadCurrent();
        if (
          persisted?.principalId !== principalId ||
          persisted.activeWorkspaceId !== normalizedContext.activeWorkspaceId ||
          persisted.unavailableWorkspaceIds.join(",") !==
            normalizedContext.unavailableWorkspaceIds.join(",") ||
          JSON.stringify(persisted.workspaces) !==
            JSON.stringify(normalizedContext.workspaces)
        ) {
          throw new Error("Workspace selection reconciliation readback failed");
        }
      },
    ],
    requireFallback: true,
  });
}

function normalizeOfflineWorkspaceContext(
  value: OfflineWorkspaceContext,
): OfflineWorkspaceContext & { unavailableWorkspaceIds: string[] } {
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
    activeWorkspaceId: activeWorkspace?.id || null,
    unavailableWorkspaceIds,
    workspaces,
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

export function createSerializedWorkspaceMutationCoordinator() {
  const pendingScopedMutations = new Map<string, Promise<unknown>>();
  let pendingGlobalMutation: Promise<unknown> = Promise.resolve();

  const enqueueScoped = async <Result>(
    key: string,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const previousScopedMutation =
      pendingScopedMutations.get(key) || Promise.resolve();
    const currentMutation = Promise.all([
      previousScopedMutation.catch(() => undefined),
      pendingGlobalMutation.catch(() => undefined),
    ]).then(operation);
    pendingScopedMutations.set(key, currentMutation);

    try {
      return await currentMutation;
    } finally {
      if (pendingScopedMutations.get(key) === currentMutation) {
        pendingScopedMutations.delete(key);
      }
    }
  };

  return {
    enqueueGlobal: async <Result>(
      operation: () => Promise<Result>,
    ): Promise<Result> => {
      const currentMutation = Promise.all([
        pendingGlobalMutation.catch(() => undefined),
        ...Array.from(
          pendingScopedMutations.values(),
          (pending) => pending.catch(() => undefined),
        ),
      ]).then(operation);
      pendingGlobalMutation = currentMutation.then(
        () => undefined,
        () => undefined,
      );
      return currentMutation;
    },
    enqueueScoped,
    waitForScoped: async (key: string): Promise<void> => {
      await Promise.all([
        pendingGlobalMutation.catch(() => undefined),
        pendingScopedMutations.get(key)?.catch(() => undefined),
      ]);
    },
  };
}

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

export function createTerminalWorkspacePrincipalRevocationRecord(
  principalIdValue: string,
): string {
  return JSON.stringify({
    kind: "terminal",
    principalId: normalizePrincipalId(principalIdValue),
    schema: 1,
  });
}

export function isTerminalWorkspacePrincipalRevocationRecord(
  raw: string,
  principalIdValue: string,
): boolean {
  const principalId = normalizePrincipalId(principalIdValue);
  try {
    const record = JSON.parse(raw) as {
      kind?: unknown;
      principalId?: unknown;
      schema?: unknown;
    };
    return (
      Object.keys(record).sort().join(",") ===
        "kind,principalId,schema" &&
      record.kind === "terminal" &&
      record.schema === 1 &&
      normalizePrincipalId(record.principalId) === principalId &&
      Boolean(principalId)
    );
  } catch {
    return false;
  }
}

export async function persistTerminalWorkspacePrincipalRevocation({
  marker,
  persistMarker,
  readContext,
  readMarker,
  removeContext,
}: {
  marker: string;
  persistMarker: (marker: string) => Promise<void>;
  readContext: () => Promise<string | null>;
  readMarker: () => Promise<string | null>;
  removeContext: () => Promise<void>;
}): Promise<void> {
  await persistMarker(marker);
  if ((await readMarker()) !== marker) {
    throw new Error(
      "Workspace principal revocation could not be verified",
    );
  }
  await removeContext();
  if ((await readContext()) !== null) {
    throw new Error(
      "Workspace principal context remained after revocation",
    );
  }
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
