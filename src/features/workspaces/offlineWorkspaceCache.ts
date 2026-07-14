import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  createSerializedWorkspaceRecordWriter,
  createOfflineWorkspaceCacheRecord,
  parseOfflineWorkspaceCacheRecord,
  type OfflineWorkspaceContext,
} from "./offlineWorkspaceCacheCore";

const WORKSPACE_CONTEXT_KEY_PREFIX = "saferoute.offline.workspaces.v1";
const writeWorkspaceRecord = createSerializedWorkspaceRecordWriter(
  (key, value) => AsyncStorage.setItem(key, value),
);

function identityKey(userEmail: string): string {
  return encodeURIComponent(userEmail.trim().toLowerCase());
}

export async function saveOfflineWorkspaceContext(
  userEmail: string,
  context: OfflineWorkspaceContext,
): Promise<void> {
  if (!userEmail.trim()) {
    return;
  }
  await writeWorkspaceRecord(
    `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(userEmail)}`,
    JSON.stringify(createOfflineWorkspaceCacheRecord(context)),
  );
}

export async function loadOfflineWorkspaceContext(
  userEmail: string,
): Promise<OfflineWorkspaceContext | null> {
  if (!userEmail.trim()) {
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(
      `${WORKSPACE_CONTEXT_KEY_PREFIX}.${identityKey(userEmail)}`,
    );
    return raw ? parseOfflineWorkspaceCacheRecord(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}
