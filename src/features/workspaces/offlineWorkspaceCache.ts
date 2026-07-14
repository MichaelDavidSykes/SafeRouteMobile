import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  parseOfflineWorkspaceCacheRecord,
  type OfflineWorkspaceContext,
  type OfflineWorkspaceSnapshot,
} from "./offlineWorkspaceCacheCore";

const WORKSPACE_CONTEXT_KEY_PREFIX = "saferoute.offline.workspaces.v2";
const writeWorkspaceRecord = createSerializedWorkspaceRecordWriter(
  (key, value) => AsyncStorage.setItem(key, value),
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
