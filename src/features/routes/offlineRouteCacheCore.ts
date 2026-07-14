import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SavedRouteSyncResult } from "./routeApiCore";

export const OFFLINE_ROUTE_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const OFFLINE_ROUTE_CACHE_MAX_ROUTES = 50;
const OFFLINE_ROUTE_CACHE_SCHEMA = 2;

export interface OfflineRouteCacheRecord {
  principalId: string;
  schema: number;
  storedAtMs: number;
  value: SavedRouteSyncResult;
}

export interface OfflineRouteCacheStorage {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  multiGet(keys: readonly string[]): Promise<readonly (readonly [string, string | null])[]>;
  multiRemove(keys: readonly string[]): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
}

export interface PurgeOfflineRouteWorkspaceStorageOptions {
  allListKey: string;
  detailKeyPrefix: string;
  listKeyPrefix: string;
  principalId: string;
  scopedListKey: string;
  storage: OfflineRouteCacheStorage;
  workspaceId: string;
}

export function createOfflineRouteCacheRecord(
  value: SavedRouteSyncResult,
  principalIdValue: string,
  nowMs = Date.now(),
): OfflineRouteCacheRecord {
  return {
    principalId: normalizePrincipalId(principalIdValue),
    schema: OFFLINE_ROUTE_CACHE_SCHEMA,
    storedAtMs: nowMs,
    value: {
      clients: value.clients.slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
      routes: value.routes.filter(hasUsableRoutePlan).slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
      selectedClientId: value.selectedClientId,
    },
  };
}

export function parseOfflineRouteCacheRecord(
  value: unknown,
  expectedPrincipalIdValue: string,
  nowMs = Date.now(),
): SavedRouteSyncResult | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Partial<OfflineRouteCacheRecord>;
  const expectedPrincipalId = normalizePrincipalId(expectedPrincipalIdValue);
  if (
    !expectedPrincipalId ||
    normalizePrincipalId(record.principalId) !== expectedPrincipalId ||
    record.schema !== OFFLINE_ROUTE_CACHE_SCHEMA ||
    !Number.isFinite(record.storedAtMs) ||
    (record.storedAtMs as number) > nowMs ||
    nowMs - (record.storedAtMs as number) > OFFLINE_ROUTE_CACHE_MAX_AGE_MS ||
    !record.value ||
    !Array.isArray(record.value.routes) ||
    !Array.isArray(record.value.clients)
  ) {
    return null;
  }
  return {
    clients: record.value.clients.slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
    routes: record.value.routes.filter(hasUsableRoutePlan).slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
    selectedClientId:
      typeof record.value.selectedClientId === "string"
        ? record.value.selectedClientId
        : null,
  };
}

export function removeWorkspaceFromOfflineRouteCache(
  value: SavedRouteSyncResult,
  workspaceId: string,
): SavedRouteSyncResult {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) {
    return {
      clients: value.clients.slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
      routes: value.routes.filter(hasUsableRoutePlan).slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
      selectedClientId: value.selectedClientId,
    };
  }

  return {
    clients: value.clients
      .filter((client) => client.id !== normalizedWorkspaceId)
      .slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
    routes: value.routes
      .filter((route) => route.clientId !== normalizedWorkspaceId)
      .filter(hasUsableRoutePlan)
      .slice(0, OFFLINE_ROUTE_CACHE_MAX_ROUTES),
    selectedClientId:
      value.selectedClientId === normalizedWorkspaceId
        ? null
        : value.selectedClientId,
  };
}

export function removeWorkspaceFromOfflineRouteCacheRecord(
  record: OfflineRouteCacheRecord,
  workspaceId: string,
): OfflineRouteCacheRecord {
  return createOfflineRouteCacheRecord(
    removeWorkspaceFromOfflineRouteCache(record.value, workspaceId),
    record.principalId,
    record.storedAtMs,
  );
}

/**
 * Removes one workspace and verifies the durable result before resolving.
 * Recovery callers keep their revocation fallback when any write or readback
 * fails, so a successful return is evidence that denied data is absent while
 * unrelated scoped/detail records remain byte-for-byte intact.
 */
export async function purgeOfflineRouteWorkspaceStorage({
  allListKey,
  detailKeyPrefix,
  listKeyPrefix,
  principalId,
  scopedListKey,
  storage,
  workspaceId,
}: PurgeOfflineRouteWorkspaceStorageOptions): Promise<void> {
  const normalizedPrincipalId = principalId.trim();
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedPrincipalId || !normalizedWorkspaceId) {
    return;
  }

  const [allListRaw, allKeys] = await Promise.all([
    storage.getItem(allListKey),
    storage.getAllKeys(),
  ]);
  const detailKeys = allKeys.filter((key) => key.startsWith(detailKeyPrefix));
  const otherScopedListKeys = allKeys.filter(
    (key) =>
      key.startsWith(listKeyPrefix) &&
      key !== allListKey &&
      key !== scopedListKey,
  );
  const [detailRecords, otherScopedListRecords] = await Promise.all([
    detailKeys.length ? storage.multiGet(detailKeys) : Promise.resolve([]),
    otherScopedListKeys.length
      ? storage.multiGet(otherScopedListKeys)
      : Promise.resolve([]),
  ]);
  const keysToRemove = new Set([scopedListKey]);
  const retainedDetailRecords = new Map<string, string | null>();
  const expectedOtherScopedListRecords = new Map<string, string | null>();
  const otherScopedListWrites = new Map<string, string>();

  for (const [key, raw] of detailRecords) {
    const cached = parseStoredOfflineRouteCacheRecord(raw, normalizedPrincipalId);
    if (
      !cached ||
      cached.value.routes.some((route) => route.clientId === normalizedWorkspaceId)
    ) {
      keysToRemove.add(key);
    } else {
      retainedDetailRecords.set(key, raw);
    }
  }

  for (const [key, raw] of otherScopedListRecords) {
    const cached = parseStoredOfflineRouteCacheRecord(raw, normalizedPrincipalId);
    if (!cached) {
      keysToRemove.add(key);
      continue;
    }
    const pruned = removeWorkspaceFromOfflineRouteCacheRecord(
      cached,
      normalizedWorkspaceId,
    );
    if (!pruned.value.clients.length && !pruned.value.routes.length) {
      keysToRemove.add(key);
      continue;
    }
    const serialized = sameOfflineRouteCacheRecord(cached, pruned)
      ? raw
      : JSON.stringify(pruned);
    if (serialized === null) {
      keysToRemove.add(key);
      continue;
    }
    expectedOtherScopedListRecords.set(key, serialized);
    if (serialized !== raw) {
      otherScopedListWrites.set(key, serialized);
    }
  }

  const allListRecord = parseStoredOfflineRouteCacheRecord(
    allListRaw,
    normalizedPrincipalId,
  );
  const nextAllListRecord = allListRecord
    ? removeWorkspaceFromOfflineRouteCacheRecord(allListRecord, normalizedWorkspaceId)
    : null;
  const retainAllList = Boolean(
    nextAllListRecord &&
      (nextAllListRecord.value.clients.length || nextAllListRecord.value.routes.length),
  );
  if (!retainAllList) {
    keysToRemove.add(allListKey);
  }

  await Promise.all([
    retainAllList && nextAllListRecord
      ? storage.setItem(allListKey, JSON.stringify(nextAllListRecord))
      : Promise.resolve(),
    ...Array.from(otherScopedListWrites, ([key, value]) =>
      storage.setItem(key, value)),
    storage.multiRemove(Array.from(keysToRemove)),
  ]);

  await verifyOfflineRouteWorkspaceStorage({
    allListKey,
    detailKeyPrefix,
    expectedAllListRecord: retainAllList ? nextAllListRecord : null,
    expectedOtherScopedListRecords,
    expectedRetainedDetailRecords: retainedDetailRecords,
    listKeyPrefix,
    principalId: normalizedPrincipalId,
    scopedListKey,
    storage,
    workspaceId: normalizedWorkspaceId,
  });
}

function parseStoredOfflineRouteCacheRecord(
  raw: string | null,
  principalId: string,
): OfflineRouteCacheRecord | null {
  if (!raw) {
    return null;
  }
  try {
    const record = JSON.parse(raw) as Partial<OfflineRouteCacheRecord>;
    const storedAtMs = typeof record.storedAtMs === "number" && Number.isFinite(record.storedAtMs)
      ? record.storedAtMs
      : Date.now();
    const value = parseOfflineRouteCacheRecord(record, principalId, storedAtMs);
    return value
      ? {
          schema: Number(record.schema),
          principalId,
          storedAtMs,
          value,
        }
      : null;
  } catch {
    return null;
  }
}

async function verifyOfflineRouteWorkspaceStorage({
  allListKey,
  detailKeyPrefix,
  expectedAllListRecord,
  expectedOtherScopedListRecords,
  expectedRetainedDetailRecords,
  listKeyPrefix,
  principalId,
  scopedListKey,
  storage,
  workspaceId,
}: {
  allListKey: string;
  detailKeyPrefix: string;
  expectedAllListRecord: OfflineRouteCacheRecord | null;
  expectedOtherScopedListRecords: Map<string, string | null>;
  expectedRetainedDetailRecords: Map<string, string | null>;
  listKeyPrefix: string;
  principalId: string;
  scopedListKey: string;
  storage: OfflineRouteCacheStorage;
  workspaceId: string;
}): Promise<void> {
  const [scopedListRaw, allListRaw, allKeys] = await Promise.all([
    storage.getItem(scopedListKey),
    storage.getItem(allListKey),
    storage.getAllKeys(),
  ]);
  if (scopedListRaw !== null) {
    throw new Error("Denied workspace scoped route cache remained after purge.");
  }

  const actualAllListRecord = parseStoredOfflineRouteCacheRecord(allListRaw, principalId);
  if (
    !sameOfflineRouteCacheRecord(actualAllListRecord, expectedAllListRecord)
  ) {
    throw new Error("Mixed route cache readback did not match the verified survivor set.");
  }

  const detailKeys = allKeys.filter((key) => key.startsWith(detailKeyPrefix));
  const detailRecords = detailKeys.length ? await storage.multiGet(detailKeys) : [];
  for (const [key, raw] of detailRecords) {
    const cached = parseStoredOfflineRouteCacheRecord(raw, principalId);
    if (cached?.value.routes.some((route) => route.clientId === workspaceId)) {
      throw new Error("Denied workspace route detail remained after purge.");
    }
    if (
      expectedRetainedDetailRecords.has(key) &&
      expectedRetainedDetailRecords.get(key) !== raw
    ) {
      throw new Error("Survivor route detail changed during workspace purge.");
    }
  }
  if (
    detailRecords.length !== expectedRetainedDetailRecords.size ||
    detailRecords.some(([key]) => !expectedRetainedDetailRecords.has(key))
  ) {
    throw new Error("Route detail readback did not match the verified survivor set.");
  }

  const actualOtherScopedListKeys = allKeys.filter(
    (key) =>
      key.startsWith(listKeyPrefix) &&
      key !== allListKey &&
      key !== scopedListKey,
  );
  if (
    actualOtherScopedListKeys.length !== expectedOtherScopedListRecords.size ||
    actualOtherScopedListKeys.some((key) => !expectedOtherScopedListRecords.has(key))
  ) {
    throw new Error("Scoped route cache readback did not match the verified survivor set.");
  }
  const actualOtherScopedListRecords = new Map(
    actualOtherScopedListKeys.length
      ? await storage.multiGet(actualOtherScopedListKeys)
      : [],
  );
  for (const [key, raw] of expectedOtherScopedListRecords) {
    if (actualOtherScopedListRecords.get(key) !== raw) {
      throw new Error("Survivor scoped route cache changed during workspace purge.");
    }
    const cached = parseStoredOfflineRouteCacheRecord(raw, principalId);
    if (
      !cached ||
      cached.value.clients.some((client) => client.id === workspaceId) ||
      cached.value.routes.some((route) => route.clientId === workspaceId)
    ) {
      throw new Error("Denied workspace data remained in another scoped route cache.");
    }
  }
}

function sameOfflineRouteCacheRecord(
  first: OfflineRouteCacheRecord | null,
  second: OfflineRouteCacheRecord | null,
): boolean {
  if (!first || !second) {
    return first === second;
  }
  return first.schema === second.schema &&
    first.principalId === second.principalId &&
    first.storedAtMs === second.storedAtMs &&
    JSON.stringify(first.value) === JSON.stringify(second.value);
}

function normalizePrincipalId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function hasUsableRoutePlan(value: unknown): value is SavedSafeRoutePlan {
  if (!value || typeof value !== "object") {
    return false;
  }
  const plan = value as Partial<SavedSafeRoutePlan>;
  return Boolean(
    typeof plan.id === "string" &&
      plan.id.trim() &&
      plan.route &&
      Array.isArray(plan.route.coordinates) &&
      plan.route.coordinates.length >= 2 &&
      plan.route.coordinates.every(
        (coordinate) =>
          Number.isFinite(coordinate?.latitude) &&
          Number.isFinite(coordinate?.longitude),
      ) &&
      Array.isArray(plan.checkpoints) &&
      Array.isArray(plan.riskZones),
  );
}
