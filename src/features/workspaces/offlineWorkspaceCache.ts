import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import {
  createWorkspaceRecoveryRevocationRecord,
  createSerializedWorkspaceRecoveryExecutor,
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  parseOfflineWorkspaceCacheRecord,
  parseWorkspaceRecoveryRevocationRecord,
  persistWorkspaceRecoveryWithFallback,
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
  await writeWorkspaceRecord(
    `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(principalId)}`,
    JSON.stringify(createOfflineWorkspaceCacheRecord(context, principalId)),
  );
}

export async function persistOfflineWorkspaceRecovery(
  principalId: string,
  context: OfflineWorkspaceContext,
  purgeWorkspaceCaches: Array<() => Promise<void>>,
  {
    fallbackUnavailableWorkspaceIds = context.unavailableWorkspaceIds || [],
    requireFallback = false,
  }: {
    fallbackUnavailableWorkspaceIds?: Iterable<string>;
    requireFallback?: boolean;
  } = {},
): Promise<WorkspaceRecoveryPersistenceResult> {
  if (!principalId.trim()) {
    return "failed";
  }
  const revocationKey = recoveryRevocationKey(principalId);
  return executeWorkspaceRecovery(revocationKey, () =>
    persistWorkspaceRecoveryWithFallback({
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
        () => saveOfflineWorkspaceContext(principalId, context),
        ...purgeWorkspaceCaches,
      ],
      requireFallback,
    }),
  );
}

export async function loadOfflineWorkspaceContext(
  principalId: string,
): Promise<OfflineWorkspaceSnapshot | null> {
  if (!principalId.trim()) {
    return null;
  }
  return executeWorkspaceRecovery(recoveryRevocationKey(principalId), async () => {
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
      const raw = await AsyncStorage.getItem(
        `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(principalId)}`,
      );
      return raw
        ? parseOfflineWorkspaceCacheRecord(JSON.parse(raw), principalId)
        : null;
    } catch {
      return null;
    }
  });
}

function createRevokedWorkspaceSnapshot(
  principalId: string,
  unavailableWorkspaceIds: string[],
): OfflineWorkspaceSnapshot {
  return {
    activeWorkspaceId: null,
    principalId: principalId.trim(),
    unavailableWorkspaceIds,
    workspaces: [],
  };
}
