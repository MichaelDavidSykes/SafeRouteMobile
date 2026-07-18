import * as SecureStore from "expo-secure-store";

import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { OfflineOperationsSnapshot } from "./offlineOperationsCacheCore";
import {
  createOfflineOperationsStorage,
  tryActivateOfflineOperationsScope,
} from "./offlineOperationsStorageCore";
import {
  createOfflineOperationsPreferenceStorage,
  OfflineOperationsPreferenceCapacityError,
  recoverOfflineOperationsPreferenceCleanup,
} from "./offlineOperationsPreferenceStorageCore";
import type { SafeRouteOperationsState } from "./operationsTypes";

const OPERATIONS_CALENDAR_CACHE_KEY =
  "saferoute.offline.operations.calendar.v1";
const OPERATIONS_CALENDAR_PREFERENCE_KEY =
  "saferoute.offline.operations.calendar.preferences.v1";
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
const operationsPreferenceStorage = createOfflineOperationsPreferenceStorage({
  get: () => SecureStore.getItemAsync(OPERATIONS_CALENDAR_PREFERENCE_KEY),
  remove: () =>
    SecureStore.deleteItemAsync(OPERATIONS_CALENDAR_PREFERENCE_KEY),
  set: (value) =>
    SecureStore.setItemAsync(
      OPERATIONS_CALENDAR_PREFERENCE_KEY,
      value,
      DEVICE_ONLY_SECURE_STORE_OPTIONS,
    ),
});

export const clearOfflineOperationsWorkspace = operationsStorage.clearWorkspace;
export const removeOfflineOperationsWorkspaceCalendar =
  operationsStorage.clearWorkspace;
export const clearOfflineOperationsPrincipal = operationsStorage.clearPrincipal;
export const activateOfflineOperationsPrincipal =
  operationsStorage.activatePrincipal;
export const activateOfflineOperationsWorkspace =
  operationsStorage.activateWorkspace;

export async function getOfflineOperationsCalendarSavingPreference(
  principalId: string,
  workspaceId: string,
) {
  return recoverOfflineOperationsCalendarCleanup(principalId, workspaceId);
}

async function recoverOfflineOperationsCalendarCleanup(
  principalId: string,
  workspaceId: string,
) {
  return recoverOfflineOperationsPreferenceCleanup(
    operationsPreferenceStorage,
    principalId,
    workspaceId,
    () => operationsStorage.clearWorkspace(principalId, workspaceId),
  );
}

function blockedPreferenceResult(
  preference:
    | "cleanup-pending"
    | "disabled"
    | "enabled"
    | "unavailable"
    | "unverified",
): "cleanup-retry" | "disabled" | "unavailable" | null {
  if (preference === "enabled") {
    return null;
  }
  if (preference === "cleanup-pending") {
    return "cleanup-retry";
  }
  return preference === "disabled" ? "disabled" : "unavailable";
}

export async function loadOfflineOperationsSnapshotIfAllowed(
  principalId: string,
  workspaceId: string,
  nowMs = Date.now(),
): Promise<{
  snapshot: OfflineOperationsSnapshot | null;
  status: "allowed" | "cleanup-retry" | "disabled" | "unavailable";
}> {
  const blocked = blockedPreferenceResult(
    await recoverOfflineOperationsCalendarCleanup(principalId, workspaceId),
  );
  if (blocked) {
    return { snapshot: null, status: blocked };
  }
  const result = await operationsPreferenceStorage.runIfAllowed(
    principalId,
    workspaceId,
    () => operationsStorage.load(principalId, workspaceId, nowMs),
  );
  if (result.status !== "completed") {
    return {
      snapshot: null,
      status:
        result.status === "cleanup-pending"
          ? "cleanup-retry"
          : result.status,
    };
  }
  return { snapshot: result.value, status: "allowed" };
}

export async function saveOfflineOperationsSnapshotIfAllowed(
  principalId: string,
  workspaceId: string,
  value: {
    operationsState: SafeRouteOperationsState;
    routes: SavedSafeRoutePlan[];
  },
  nowMs = Date.now(),
): Promise<{
  snapshot: OfflineOperationsSnapshot | null;
  status: "allowed" | "cleanup-retry" | "disabled" | "unavailable";
}> {
  const blocked = blockedPreferenceResult(
    await recoverOfflineOperationsCalendarCleanup(principalId, workspaceId),
  );
  if (blocked) {
    return { snapshot: null, status: blocked };
  }
  const result = await operationsPreferenceStorage.runIfAllowed(
    principalId,
    workspaceId,
    async () => {
      await operationsStorage.activateWorkspace(principalId, workspaceId);
      return operationsStorage.save(principalId, workspaceId, value, nowMs);
    },
  );
  if (result.status !== "completed") {
    return {
      snapshot: null,
      status:
        result.status === "cleanup-pending"
          ? "cleanup-retry"
          : result.status,
    };
  }
  return { snapshot: result.value, status: "allowed" };
}

export async function disableOfflineOperationsCalendarSaving(
  principalId: string,
  workspaceId: string,
): Promise<"capacity" | "disabled" | "cleanup-retry"> {
  try {
    await operationsPreferenceStorage.disable(principalId, workspaceId);
  } catch (error) {
    if (error instanceof OfflineOperationsPreferenceCapacityError) {
      return "capacity";
    }
    throw error;
  }
  try {
    await operationsStorage.clearWorkspace(principalId, workspaceId);
  } catch {
    return "cleanup-retry";
  }
  try {
    await operationsPreferenceStorage.completeCleanup(
      principalId,
      workspaceId,
    );
    return "disabled";
  } catch {
    return "cleanup-retry";
  }
}

export async function enableOfflineOperationsCalendarSaving(
  principalId: string,
  workspaceId: string,
): Promise<void> {
  await operationsPreferenceStorage.enable(principalId, workspaceId);
}

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
