import * as SecureStore from "expo-secure-store";

import {
  createOfflineOperationsStorage,
  tryActivateOfflineOperationsScope,
} from "./offlineOperationsStorageCore";

const OPERATIONS_CALENDAR_CACHE_KEY =
  "saferoute.offline.operations.calendar.v1";
const DEVICE_ONLY_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions =
  typeof SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY === "number"
    ? { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }
    : {};

const operationsStorage = createOfflineOperationsStorage({
  get: () => SecureStore.getItemAsync(OPERATIONS_CALENDAR_CACHE_KEY),
  remove: () => SecureStore.deleteItemAsync(OPERATIONS_CALENDAR_CACHE_KEY),
  set: (value) =>
    SecureStore.setItemAsync(
      OPERATIONS_CALENDAR_CACHE_KEY,
      value,
      DEVICE_ONLY_SECURE_STORE_OPTIONS,
    ),
});

export const saveOfflineOperationsSnapshot = operationsStorage.save;
export const loadOfflineOperationsSnapshot = operationsStorage.load;
export const clearOfflineOperationsWorkspace = operationsStorage.clearWorkspace;
export const clearOfflineOperationsPrincipal = operationsStorage.clearPrincipal;
export const activateOfflineOperationsPrincipal =
  operationsStorage.activatePrincipal;
export const activateOfflineOperationsWorkspace =
  operationsStorage.activateWorkspace;

export function tryActivateOfflineOperationsPrincipal(
  principalId: string,
  activate: (principalId: string) => Promise<void> =
    activateOfflineOperationsPrincipal,
): Promise<boolean> {
  return tryActivateOfflineOperationsScope(() => activate(principalId));
}

export function tryActivateOfflineOperationsWorkspace(
  principalId: string,
  workspaceId: string,
  activate: (principalId: string, workspaceId: string) => Promise<void> =
    activateOfflineOperationsWorkspace,
): Promise<boolean> {
  return tryActivateOfflineOperationsScope(() =>
    activate(principalId, workspaceId),
  );
}
