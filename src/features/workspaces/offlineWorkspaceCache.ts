import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  createWorkspaceRecoveryRevocationRecord,
  createSerializedWorkspaceRecoveryExecutor,
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  parseOfflineWorkspaceCacheRecord,
  parseWorkspaceRecoveryRevocationRecord,
  persistLatestOfflineWorkspaceSelection,
  persistWorkspaceRecoveryWithFallback,
  type OfflineWorkspaceCacheFreshness,
  type OfflineWorkspaceContext,
  type OfflineWorkspaceSnapshot,
  type WorkspaceRecoveryPersistenceResult,
} from "./offlineWorkspaceCacheCore";

const WORKSPACE_CONTEXT_KEY_PREFIX = "saferoute.offline.workspaces.v2";
const WORKSPACE_RECOVERY_REVOCATION_KEY_PREFIX = "saferoute.workspace-revocation.v1";
const DEVICE_ONLY_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions =
  typeof SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY === "number"
    ? { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    : {};
const writeWorkspaceRecord = createSerializedWorkspaceRecordWriter(
  (key, value) => AsyncStorage.setItem(key, value),
);
const executeWorkspaceRecovery = createSerializedWorkspaceRecoveryExecutor();

function identityKey(principalId: string): string {
  return encodeURIComponent(principalId.trim());
}

function recoveryRevocationKey(principalId: string): string {
  const encodedPrincipalId = Array.from(principalId.trim())
    .map((character) => character.codePointAt(0)?.toString(16) || "")
    .join("-");
  return `${WORKSPACE_RECOVERY_REVOCATION_KEY_PREFIX}.${encodedPrincipalId}`;
}

export async function saveOfflineWorkspaceContext(
  principalId: string,
  context: OfflineWorkspaceContext,
): Promise<void> {
  if (!principalId.trim()) {
    return;
  }
  await executeWorkspaceRecovery(recoveryRevocationKey(principalId), async () => {
    const current = await loadOfflineWorkspaceRecordInternal(principalId);
    const freshness = freshnessForPreservedCatalog(current);
    if (!freshness) {
      return;
    }
    await saveOfflineWorkspaceContextInternal(
      principalId,
      context,
      freshness,
    );
  });
}

async function saveOfflineWorkspaceContextInternal(
  principalId: string,
  context: OfflineWorkspaceContext,
  freshness: OfflineWorkspaceCacheFreshness,
): Promise<void> {
  await writeWorkspaceRecord(
    `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(principalId)}`,
    JSON.stringify(
      createOfflineWorkspaceCacheRecord(
        context,
        principalId,
        Date.now(),
        freshness,
      ),
    ),
  );
}

export async function persistOfflineReviewWorkspaceSelection(
  principalId: string,
  workspaceId: string,
): Promise<OfflineWorkspaceSnapshot | null> {
  if (!principalId.trim() || !workspaceId.trim()) {
    return null;
  }
  return executeWorkspaceRecovery(recoveryRevocationKey(principalId), () =>
    persistLatestOfflineWorkspaceSelection({
      loadCurrent: () => loadOfflineWorkspaceContextInternal(principalId),
      persistContext: (context, freshness) =>
        saveOfflineWorkspaceContextInternal(principalId, context, freshness),
      principalId,
      workspaceId,
    }),
  );
}

export async function migrateOfflineWorkspaceCatalogFromRouteCache(
  principalId: string,
  context: OfflineWorkspaceContext,
  catalogStoredAtMs: number,
): Promise<OfflineWorkspaceSnapshot | null> {
  if (!principalId.trim() || !Number.isFinite(catalogStoredAtMs)) {
    return null;
  }
  try {
    return await executeWorkspaceRecovery(
      recoveryRevocationKey(principalId),
      async () => {
        const current = await loadOfflineWorkspaceRecordInternal(principalId);
        if (current) {
          return current;
        }

        const nowMs = Date.now();
        const freshness = {
          catalogStoredAtMs,
          retentionStoredAtMs: catalogStoredAtMs,
        };
        const record = createOfflineWorkspaceCacheRecord(
          context,
          principalId,
          nowMs,
          freshness,
        );
        const snapshot = parseOfflineWorkspaceCacheRecord(
          record,
          principalId,
          nowMs,
        );
        if (!snapshot) {
          return null;
        }
        await writeWorkspaceRecord(
          `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(principalId)}`,
          JSON.stringify(record),
        );
        return snapshot;
      },
    );
  } catch {
    // Legacy migration is opportunistic. Storage failure must not block the
    // validated legacy review snapshot or a current online catalog request.
    return null;
  }
}

export async function persistOfflineWorkspaceRecovery(
  principalId: string,
  context: OfflineWorkspaceContext,
  purgeWorkspaceCaches: Array<() => Promise<void>>,
  {
    fallbackUnavailableWorkspaceIds = context.unavailableWorkspaceIds || [],
    authoritativeCatalogStoredAtMs,
    requireFallback = false,
  }: {
    fallbackUnavailableWorkspaceIds?: Iterable<string>;
    authoritativeCatalogStoredAtMs?: number;
    requireFallback?: boolean;
  } = {},
): Promise<WorkspaceRecoveryPersistenceResult> {
  if (!principalId.trim()) {
    return "failed";
  }
  const revocationKey = recoveryRevocationKey(principalId);
  return executeWorkspaceRecovery(revocationKey, async () => {
    let freshness: OfflineWorkspaceCacheFreshness | null;
    if (Number.isFinite(authoritativeCatalogStoredAtMs)) {
      freshness = {
        catalogStoredAtMs: authoritativeCatalogStoredAtMs as number,
        retentionStoredAtMs: authoritativeCatalogStoredAtMs as number,
      };
    } else {
      let current: OfflineWorkspaceSnapshot | null = null;
      try {
        current = await loadOfflineWorkspaceRecordInternal(principalId);
      } catch {
        // Continue into fallback-first recovery. If catalog freshness cannot be
        // preserved, the primary write fails closed after durable revocation.
      }
      freshness = freshnessForPreservedCatalog(current);
    }
    return persistWorkspaceRecoveryWithFallback({
      clearFallback: () => SecureStore.deleteItemAsync(revocationKey),
      persistFallback: () => SecureStore.setItemAsync(
        revocationKey,
        createWorkspaceRecoveryRevocationRecord(
          principalId,
          fallbackUnavailableWorkspaceIds,
        ),
        DEVICE_ONLY_SECURE_STORE_OPTIONS,
      ),
      persistPrimary: [
        () => freshness
          ? saveOfflineWorkspaceContextInternal(principalId, context, freshness)
          : Promise.reject(
              new Error("Workspace catalog age cannot be preserved safely"),
            ),
        ...purgeWorkspaceCaches,
      ],
      requireFallback,
    });
  });
}

export async function loadOfflineWorkspaceContext(
  principalId: string,
): Promise<OfflineWorkspaceSnapshot | null> {
  if (!principalId.trim()) {
    return null;
  }
  return executeWorkspaceRecovery(
    recoveryRevocationKey(principalId),
    () => loadOfflineWorkspaceContextInternal(principalId),
  );
}

async function loadOfflineWorkspaceContextInternal(
  principalId: string,
): Promise<OfflineWorkspaceSnapshot | null> {
  let recoveryRevocation: string | null;
  try {
    recoveryRevocation = await SecureStore.getItemAsync(
      recoveryRevocationKey(principalId),
    );
  } catch {
    return createRevokedWorkspaceSnapshot(principalId, []);
  }
  if (recoveryRevocation !== null) {
    return createRevokedWorkspaceSnapshot(
      principalId,
      parseWorkspaceRecoveryRevocationRecord(
        recoveryRevocation,
        principalId,
      ) || [],
    );
  }

  try {
    return await loadOfflineWorkspaceRecordInternal(principalId);
  } catch {
    return null;
  }
}

async function loadOfflineWorkspaceRecordInternal(
  principalId: string,
): Promise<OfflineWorkspaceSnapshot | null> {
  const raw = await AsyncStorage.getItem(
    `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(principalId)}`,
  );
  return raw
    ? parseOfflineWorkspaceCacheRecord(JSON.parse(raw), principalId)
    : null;
}

function freshnessForPreservedCatalog(
  current: OfflineWorkspaceSnapshot | null,
): OfflineWorkspaceCacheFreshness | null {
  if (
    !current ||
    current.retentionStoredAtMs === null ||
    !Number.isFinite(current.retentionStoredAtMs)
  ) {
    return null;
  }
  return {
    catalogStoredAtMs: current.catalogStoredAtMs,
    retentionStoredAtMs: current.retentionStoredAtMs,
  };
}

function createRevokedWorkspaceSnapshot(
  principalId: string,
  unavailableWorkspaceIds: string[],
): OfflineWorkspaceSnapshot {
  return {
    activeWorkspaceId: null,
    catalogStoredAtMs: null,
    principalId: principalId.trim(),
    retentionStoredAtMs: null,
    unavailableWorkspaceIds,
    workspaces: [],
  };
}
