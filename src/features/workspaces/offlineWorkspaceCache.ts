import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  parseOfflineWorkspaceCacheRecord,
  persistOrClearWorkspaceRecovery,
  type OfflineWorkspaceContext,
  type OfflineWorkspaceSnapshot,
  type WorkspaceRecoveryPersistenceResult,
} from "./offlineWorkspaceCacheCore";

const WORKSPACE_CONTEXT_KEY_PREFIX = "saferoute.offline.workspaces.v2";
const CLEAR_WORKSPACE_CONTEXT_SENTINEL = "";
const writeWorkspaceRecord = createSerializedWorkspaceRecordWriter(
  (key, value) => value === CLEAR_WORKSPACE_CONTEXT_SENTINEL
    ? AsyncStorage.removeItem(key)
    : AsyncStorage.setItem(key, value),
);

function identityKey(principalId: string): string {
  return encodeURIComponent(principalId.trim());
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

export async function saveOfflineWorkspaceContextFailClosed(
  principalId: string,
  context: OfflineWorkspaceContext,
): Promise<WorkspaceRecoveryPersistenceResult> {
  if (!principalId.trim()) {
    return "failed";
  }
  const key = `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(principalId)}`;
  const serializedContext = JSON.stringify(
    createOfflineWorkspaceCacheRecord(context, principalId),
  );
  return persistOrClearWorkspaceRecovery({
    clear: () => writeWorkspaceRecord(key, CLEAR_WORKSPACE_CONTEXT_SENTINEL),
    persist: () => writeWorkspaceRecord(key, serializedContext),
  });
}

export async function loadOfflineWorkspaceContext(
  principalId: string,
): Promise<OfflineWorkspaceSnapshot | null> {
  if (!principalId.trim()) {
    return null;
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
}
