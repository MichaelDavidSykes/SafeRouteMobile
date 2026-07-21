import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  createTerminalWorkspacePrincipalRevocationRecord,
  createWorkspaceRecoveryRevocationRecord,
  createSerializedWorkspaceMutationCoordinator,
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  isTerminalWorkspacePrincipalRevocationRecord,
  parseOfflineWorkspaceCacheRecord,
  parseWorkspaceRecoveryRevocationRecord,
  persistLatestOfflineWorkspaceSelection,
  reconcileLatestOfflineWorkspaceSelection,
  persistTerminalWorkspacePrincipalRevocation,
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
const workspaceMutations = createSerializedWorkspaceMutationCoordinator();
const executeWorkspaceRecovery = workspaceMutations.enqueueScoped;
const terminalRevokedPrincipalIds = new Set<string>();
let allWorkspaceContextsRevoked = false;

function identityKey(principalId: string): string {
  return encodeURIComponent(principalId.trim());
}

function recoveryRevocationKey(principalId: string): string {
  const encodedPrincipalId = Array.from(principalId.trim())
    .map((character) => character.codePointAt(0)?.toString(16) || "")
    .join("-");
  return `${WORKSPACE_RECOVERY_REVOCATION_KEY_PREFIX}.${encodedPrincipalId}`;
}

function workspaceContextKey(principalId: string): string {
  return `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(principalId)}`;
}

export async function saveOfflineWorkspaceContext(
  principalId: string,
  context: OfflineWorkspaceContext,
): Promise<void> {
  if (!principalId.trim()) {
    return;
  }
  await executeWorkspaceRecovery(recoveryRevocationKey(principalId), async () => {
    if (await hasBlockingWorkspaceRevocation(principalId)) {
      return;
    }
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
    workspaceContextKey(principalId),
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
  return executeWorkspaceRecovery(recoveryRevocationKey(principalId), async () => {
    if (await hasBlockingWorkspaceRevocation(principalId)) {
      return null;
    }
    return persistLatestOfflineWorkspaceSelection({
      loadCurrent: () => loadOfflineWorkspaceContextInternal(principalId),
      persistContext: (context, freshness) =>
        saveOfflineWorkspaceContextInternal(principalId, context, freshness),
      principalId,
      workspaceId,
    });
  });
}

export async function reconcileOfflineReviewWorkspaceSelection(
  principalId: string,
  context: OfflineWorkspaceContext,
): Promise<WorkspaceRecoveryPersistenceResult> {
  if (!principalId.trim()) {
    return "failed";
  }
  const revocationKey = recoveryRevocationKey(principalId);
  return executeWorkspaceRecovery(revocationKey, async () => {
    if (await hasBlockingWorkspaceRevocation(principalId)) {
      return "revoked";
    }
    return reconcileLatestOfflineWorkspaceSelection({
      clearFallback: () => SecureStore.deleteItemAsync(revocationKey),
      context,
      loadCurrent: () => loadOfflineWorkspaceRecordInternal(principalId),
      persistContext: (nextContext, freshness) =>
        saveOfflineWorkspaceContextInternal(
          principalId,
          nextContext,
          freshness,
        ),
      persistFallback: () => SecureStore.setItemAsync(
        revocationKey,
        createWorkspaceRecoveryRevocationRecord(
          principalId,
          context.unavailableWorkspaceIds || [],
        ),
        DEVICE_ONLY_SECURE_STORE_OPTIONS,
      ),
      principalId,
    });
  });
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
        if (await hasBlockingWorkspaceRevocation(principalId)) {
          return null;
        }
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
          workspaceContextKey(principalId),
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
    let existingRevocation: string | null;
    try {
      existingRevocation = await SecureStore.getItemAsync(revocationKey);
    } catch {
      return "revoked";
    }
    if (
      allWorkspaceContextsRevoked ||
      terminalRevokedPrincipalIds.has(principalId.trim()) ||
      (
        existingRevocation !== null &&
        (
          isTerminalWorkspacePrincipalRevocationRecord(
            existingRevocation,
            principalId,
          ) ||
          parseWorkspaceRecoveryRevocationRecord(
            existingRevocation,
            principalId,
          ) === null
        )
      )
    ) {
      return "revoked";
    }
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
  if (
    allWorkspaceContextsRevoked ||
    terminalRevokedPrincipalIds.has(principalId.trim())
  ) {
    return createRevokedWorkspaceSnapshot(principalId, []);
  }
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
    workspaceContextKey(principalId),
  );
  return raw
    ? parseOfflineWorkspaceCacheRecord(JSON.parse(raw), principalId)
    : null;
}

export async function isOfflineWorkspacePrincipalRevoked(
  principalId: string,
): Promise<boolean> {
  if (!principalId.trim()) {
    return true;
  }
  return hasBlockingWorkspaceRevocation(principalId);
}

export async function clearOfflineWorkspacePrincipal(
  principalId: string,
): Promise<void> {
  const normalizedPrincipalId = principalId.trim();
  if (!normalizedPrincipalId) {
    return;
  }
  terminalRevokedPrincipalIds.add(normalizedPrincipalId);
  const revocationKey = recoveryRevocationKey(normalizedPrincipalId);
  await executeWorkspaceRecovery(revocationKey, async () => {
    const marker = createTerminalWorkspacePrincipalRevocationRecord(
      normalizedPrincipalId,
    );
    const contextKey = workspaceContextKey(normalizedPrincipalId);
    await persistTerminalWorkspacePrincipalRevocation({
      marker,
      persistMarker: (value) =>
        SecureStore.setItemAsync(
          revocationKey,
          value,
          DEVICE_ONLY_SECURE_STORE_OPTIONS,
        ),
      readContext: () => AsyncStorage.getItem(contextKey),
      readMarker: () => SecureStore.getItemAsync(revocationKey),
      removeContext: () => AsyncStorage.removeItem(contextKey),
    });
  });
}

export async function activateOfflineWorkspacePrincipal(
  principalId: string,
  verifyRelatedCachesAbsent: () => Promise<void> = async () => undefined,
): Promise<void> {
  const normalizedPrincipalId = principalId.trim();
  if (!normalizedPrincipalId) {
    throw new Error("Workspace principal identity is invalid");
  }
  const revocationKey = recoveryRevocationKey(normalizedPrincipalId);
  await executeWorkspaceRecovery(revocationKey, async () => {
    let raw: string | null;
    try {
      raw = await SecureStore.getItemAsync(revocationKey);
    } catch {
      throw new Error("Workspace principal revocation is unavailable");
    }
    const terminalProcessRevoked =
      terminalRevokedPrincipalIds.has(normalizedPrincipalId);
    const globallyProcessRevoked = allWorkspaceContextsRevoked;
    const processRevoked =
      terminalProcessRevoked || globallyProcessRevoked;
    if (
      raw !== null &&
      !isTerminalWorkspacePrincipalRevocationRecord(
        raw,
        normalizedPrincipalId,
      )
    ) {
      const unavailableWorkspaceIds =
        parseWorkspaceRecoveryRevocationRecord(
          raw,
          normalizedPrincipalId,
        );
      if (
        unavailableWorkspaceIds !== null &&
        !terminalProcessRevoked
      ) {
        if (globallyProcessRevoked) {
          if (
            (await AsyncStorage.getItem(
              workspaceContextKey(normalizedPrincipalId),
            )) !== null
          ) {
            throw new Error(
              "Workspace principal context must be absent before activation",
            );
          }
          await verifyRelatedCachesAbsent();
          allWorkspaceContextsRevoked = false;
        }
        return;
      }
      throw new Error("Workspace principal revocation is invalid");
    }
    if (raw === null && !processRevoked) {
      return;
    }
    if (raw === null && globallyProcessRevoked) {
      const marker =
        createTerminalWorkspacePrincipalRevocationRecord(
          normalizedPrincipalId,
        );
      await persistTerminalWorkspacePrincipalRevocation({
        marker,
        persistMarker: (value) =>
          SecureStore.setItemAsync(
            revocationKey,
            value,
            DEVICE_ONLY_SECURE_STORE_OPTIONS,
          ),
        readContext: () =>
          AsyncStorage.getItem(
            workspaceContextKey(normalizedPrincipalId),
          ),
        readMarker: () => SecureStore.getItemAsync(revocationKey),
        removeContext: () =>
          AsyncStorage.removeItem(
            workspaceContextKey(normalizedPrincipalId),
          ),
      });
      terminalRevokedPrincipalIds.add(normalizedPrincipalId);
      raw = marker;
    }
    if (
      (await AsyncStorage.getItem(
        workspaceContextKey(normalizedPrincipalId),
      )) !== null
    ) {
      throw new Error(
        "Workspace principal context must be absent before activation",
      );
    }
    await verifyRelatedCachesAbsent();
    if (raw !== null) {
      await SecureStore.deleteItemAsync(revocationKey);
      if ((await SecureStore.getItemAsync(revocationKey)) !== null) {
        throw new Error(
          "Workspace principal activation could not be verified",
        );
      }
    }
    terminalRevokedPrincipalIds.delete(normalizedPrincipalId);
    allWorkspaceContextsRevoked = false;
  });
}

export async function clearAllOfflineWorkspaceContexts(): Promise<void> {
  allWorkspaceContextsRevoked = true;
  await workspaceMutations.enqueueGlobal(async () => {
    const keys = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(`${WORKSPACE_CONTEXT_KEY_PREFIX}.`),
    );
    if (keys.length) {
      await AsyncStorage.multiRemove(keys);
    }
    const remaining = (await AsyncStorage.getAllKeys()).filter((key) =>
      key.startsWith(`${WORKSPACE_CONTEXT_KEY_PREFIX}.`),
    );
    if (remaining.length) {
      throw new Error(
        "Workspace principal contexts remained after global revocation",
      );
    }
  });
}

export async function readOfflineWorkspacePrincipalContractState(
  principalId: string,
  expected: {
    activeWorkspaceId: string;
    workspaceIds: string[];
  } | null = null,
): Promise<"persisted" | "revoked" | "unknown"> {
  const normalizedPrincipalId = principalId.trim();
  if (!normalizedPrincipalId) {
    return "unknown";
  }
  await workspaceMutations.waitForScoped(
    recoveryRevocationKey(normalizedPrincipalId),
  );
  try {
    const [revocation, context] = await Promise.all([
      SecureStore.getItemAsync(
        recoveryRevocationKey(normalizedPrincipalId),
      ),
      AsyncStorage.getItem(
        workspaceContextKey(normalizedPrincipalId),
      ),
    ]);
    if (revocation !== null) {
      return context === null &&
        isTerminalWorkspacePrincipalRevocationRecord(
          revocation,
          normalizedPrincipalId,
        )
        ? "revoked"
        : "unknown";
    }
    if (context === null) {
      return "unknown";
    }
    const snapshot = parseOfflineWorkspaceCacheRecord(
      JSON.parse(context),
      normalizedPrincipalId,
    );
    if (!snapshot) {
      return "unknown";
    }
    if (expected) {
      const expectedWorkspaceIds = Array.from(
        new Set(
          expected.workspaceIds.map((workspaceId) => workspaceId.trim()),
        ),
      ).filter(Boolean).sort();
      const actualWorkspaceIds = snapshot.workspaces
        .map((workspace) => workspace.id)
        .sort();
      if (
        snapshot.activeWorkspaceId !== expected.activeWorkspaceId.trim() ||
        actualWorkspaceIds.length !== expectedWorkspaceIds.length ||
        actualWorkspaceIds.some(
          (workspaceId, index) =>
            workspaceId !== expectedWorkspaceIds[index],
        )
      ) {
        return "unknown";
      }
    }
    return "persisted";
  } catch {
    return "unknown";
  }
}

async function hasBlockingWorkspaceRevocation(
  principalId: string,
): Promise<boolean> {
  const normalizedPrincipalId = principalId.trim();
  if (
    !normalizedPrincipalId ||
    allWorkspaceContextsRevoked ||
    terminalRevokedPrincipalIds.has(normalizedPrincipalId)
  ) {
    return true;
  }
  try {
    return (
      await SecureStore.getItemAsync(
        recoveryRevocationKey(normalizedPrincipalId),
      )
    ) !== null;
  } catch {
    return true;
  }
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
