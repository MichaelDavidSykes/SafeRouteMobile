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
import {
  createOfflineOperationsPrincipalCleanupCoordinator,
  createOfflineOperationsPrincipalCleanupStorage,
  type OfflineOperationsPrincipalCleanupOutcome,
} from "./offlineOperationsPrincipalCleanupCore";
import type { SafeRouteOperationsState } from "./operationsTypes";
import { classifyOfflineCalendarContractStorage } from "../../testing/offlineCalendarCleanupContractEvidenceCore";

const OPERATIONS_CALENDAR_CACHE_KEY =
  "saferoute.offline.operations.calendar.v1";
const OPERATIONS_CALENDAR_PREFERENCE_KEY =
  "saferoute.offline.operations.calendar.preferences.v1";
const OPERATIONS_CALENDAR_PRINCIPAL_CLEANUP_KEY =
  "saferoute.offline.operations.calendar.principal-cleanup.v1";
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
const operationsPrincipalCleanupStorage =
  createOfflineOperationsPrincipalCleanupStorage({
    get: () =>
      SecureStore.getItemAsync(
        OPERATIONS_CALENDAR_PRINCIPAL_CLEANUP_KEY,
      ),
    remove: () =>
      SecureStore.deleteItemAsync(
        OPERATIONS_CALENDAR_PRINCIPAL_CLEANUP_KEY,
      ),
    set: (value) =>
      SecureStore.setItemAsync(
        OPERATIONS_CALENDAR_PRINCIPAL_CLEANUP_KEY,
        value,
        DEVICE_ONLY_SECURE_STORE_OPTIONS,
      ),
  });
const operationsPrincipalCleanup =
  createOfflineOperationsPrincipalCleanupCoordinator({
    activatePrincipal: operationsStorage.activatePrincipal,
    clearAll: operationsStorage.clearAll,
    clearPrincipal: operationsStorage.clearPrincipal,
    storage: operationsPrincipalCleanupStorage,
  });

export const clearOfflineOperationsWorkspace = operationsStorage.clearWorkspace;
export const removeOfflineOperationsWorkspaceCalendar =
  operationsStorage.clearWorkspace;
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
  const principalCleanup =
    await operationsPrincipalCleanup.recover();
  if (principalCleanup.status !== "clean") {
    return { snapshot: null, status: "unavailable" };
  }
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
  const principalCleanup =
    await operationsPrincipalCleanup.recover();
  if (principalCleanup.status !== "clean") {
    return { snapshot: null, status: "unavailable" };
  }
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

export function prepareOfflineOperationsPrincipalForFreshAuthentication(
  principalId: string,
): Promise<OfflineOperationsPrincipalCleanupOutcome> {
  return operationsPrincipalCleanup.prepareFreshAuthentication(
    principalId,
  );
}

export function purgeOfflineOperationsPrincipalAtTerminalBoundary(
  principalId: string,
  commitTerminalBoundary: () => Promise<void>,
): Promise<OfflineOperationsPrincipalCleanupOutcome> {
  return operationsPrincipalCleanup.purgeTerminal(
    principalId,
    commitTerminalBoundary,
  );
}

export function recoverOfflineOperationsPrincipalCleanup(
  activatePrincipalId: string | null = null,
  commitTerminalBoundary: (() => Promise<void>) | null = null,
): Promise<OfflineOperationsPrincipalCleanupOutcome> {
  return operationsPrincipalCleanup.recover(
    activatePrincipalId,
    commitTerminalBoundary,
  );
}

export async function ensureSignedOutOfflineOperationsCalendarRemoved(): Promise<boolean> {
  try {
    await operationsStorage.clearAll();
    return true;
  } catch {
    return false;
  }
}

export async function readOfflineOperationsCalendarContractState(
  principalId: string,
  workspaceId: string,
  preferenceWorkspaceId = workspaceId,
): Promise<{
  cleanup:
    | "absent"
    | "durable"
    | "nondurable"
    | "unreadable"
    | "unknown";
  payload: "absent" | "present" | "unknown";
  preference:
    | "cleanup-pending"
    | "disabled"
    | "enabled"
    | "unavailable"
    | "unverified";
  slot:
    | "empty"
    | "payload"
    | "principal-revoked"
    | "unreadable"
    | "unknown"
    | "workspace-revoked";
}> {
  let rawCalendar: string | null;
  let rawPreference: string | null | undefined;
  let cleanup:
    | "absent"
    | "durable"
    | "nondurable"
    | "unreadable"
    | "unknown" = "unknown";
  try {
    rawCalendar = await SecureStore.getItemAsync(
      OPERATIONS_CALENDAR_CACHE_KEY,
    );
    rawPreference = await SecureStore.getItemAsync(
      OPERATIONS_CALENDAR_PREFERENCE_KEY,
    );
  } catch {
    rawCalendar = null;
    rawPreference = undefined;
    return {
      cleanup,
      payload: "unknown",
      preference: "unavailable",
      slot: "unknown",
    };
  }
  try {
    const cleanupState =
      await operationsPrincipalCleanupStorage.getState();
    cleanup =
      cleanupState.status === "clean"
        ? "absent"
        : cleanupState.status === "corrupt"
          ? "unreadable"
          : cleanupState.pending.durable
            ? "durable"
            : "nondurable";
  } catch {
    cleanup = "unreadable";
  }
  const storage = classifyOfflineCalendarContractStorage({
    calendarRaw: rawCalendar,
    calendarWorkspaceId: workspaceId,
    preferenceRaw: rawPreference,
    preferenceWorkspaceId,
    principalId,
  });
  return {
    cleanup,
    ...storage,
  };
}

export function tryActivateOfflineOperationsPrincipal(
  principalId: string,
): Promise<boolean> {
  return recoverOfflineOperationsPrincipalCleanup(principalId).then(
    (result) => result.status === "clean",
  );
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
