import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SavedRouteSyncResult } from "./routeApiCore";
import {
  createOfflineRouteCacheRecord,
  hasUsableRoutePlan,
  parseOfflineRouteCacheRecord,
  removeWorkspaceFromOfflineRouteCacheRecord,
  type OfflineRouteCacheRecord,
} from "./offlineRouteCacheCore";

const ROUTE_LIST_KEY_PREFIX = "saferoute.offline.routes.v2";
const ROUTE_DETAIL_KEY_PREFIX = "saferoute.offline.route.v2";
const pendingRouteCacheMutations = new Map<string, Promise<void>>();

function identityKey(principalId: string): string {
  return encodeURIComponent(principalId.trim());
}

function clientKey(clientId?: string | null): string {
  return encodeURIComponent(String(clientId || "all").trim() || "all");
}

export async function saveOfflineRoutes(
  principalId: string,
  clientId: string | null | undefined,
  value: SavedRouteSyncResult,
): Promise<void> {
  if (!principalId.trim()) return;
  const identity = identityKey(principalId);
  await enqueueRouteCacheMutation(identity, () =>
    AsyncStorage.setItem(
      `${ROUTE_LIST_KEY_PREFIX}.${identity}.${clientKey(clientId)}`,
      JSON.stringify(createOfflineRouteCacheRecord(value, principalId)),
    ),
  );
}

export async function loadOfflineRoutes(
  principalId: string,
  clientId?: string | null,
): Promise<SavedRouteSyncResult | null> {
  if (!principalId.trim()) return null;
  try {
    const raw = await AsyncStorage.getItem(
      `${ROUTE_LIST_KEY_PREFIX}.${identityKey(principalId)}.${clientKey(clientId)}`,
    );
    return raw
      ? parseOfflineRouteCacheRecord(JSON.parse(raw), principalId)
      : null;
  } catch {
    return null;
  }
}

export async function saveOfflineRouteDetail(
  principalId: string,
  route: SavedSafeRoutePlan,
): Promise<void> {
  if (!principalId.trim() || !hasUsableRoutePlan(route)) return;
  const identity = identityKey(principalId);
  await enqueueRouteCacheMutation(identity, () =>
    AsyncStorage.setItem(
      `${ROUTE_DETAIL_KEY_PREFIX}.${identity}.${encodeURIComponent(route.id)}`,
      JSON.stringify(createOfflineRouteCacheRecord({
        clients: [],
        routes: [route],
        selectedClientId: route.clientId || null,
      }, principalId)),
    ),
  );
}

export async function loadOfflineRouteDetail(
  principalId: string,
  routeId: string,
): Promise<SavedSafeRoutePlan | null> {
  if (!principalId.trim() || !routeId.trim()) return null;
  try {
    const raw = await AsyncStorage.getItem(
      `${ROUTE_DETAIL_KEY_PREFIX}.${identityKey(principalId)}.${encodeURIComponent(routeId)}`,
    );
    const cached = raw
      ? parseOfflineRouteCacheRecord(JSON.parse(raw), principalId)
      : null;
    return cached?.routes.find((route) => route.id === routeId) || null;
  } catch {
    return null;
  }
}

export async function clearOfflineRouteWorkspace(
  principalId: string,
  workspaceId: string,
): Promise<void> {
  const normalizedPrincipalId = principalId.trim();
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedPrincipalId || !normalizedWorkspaceId) return;

  const identity = identityKey(normalizedPrincipalId);
  await enqueueRouteCacheMutation(identity, async () => {
    const scopedListKey = `${ROUTE_LIST_KEY_PREFIX}.${identity}.${clientKey(normalizedWorkspaceId)}`;
    const allListKey = `${ROUTE_LIST_KEY_PREFIX}.${identity}.${clientKey(null)}`;
    const detailKeyPrefix = `${ROUTE_DETAIL_KEY_PREFIX}.${identity}.`;
    await AsyncStorage.removeItem(scopedListKey);
    const [allListRaw, allKeys] = await Promise.all([
      AsyncStorage.getItem(allListKey),
      AsyncStorage.getAllKeys(),
    ]);
    const detailKeys = allKeys.filter((key) => key.startsWith(detailKeyPrefix));
    const detailRecords = detailKeys.length
      ? await AsyncStorage.multiGet(detailKeys)
      : [];
    const keysToRemove = new Set([scopedListKey]);

    for (const [key, raw] of detailRecords) {
      const cached = parseStoredRouteRecord(raw, normalizedPrincipalId);
      if (cached?.value.routes.some((route) => route.clientId === normalizedWorkspaceId)) {
        keysToRemove.add(key);
      }
    }

    const allListRecord = parseStoredRouteRecord(allListRaw, normalizedPrincipalId);
    const nextAllListRecord = allListRecord
      ? removeWorkspaceFromOfflineRouteCacheRecord(allListRecord, normalizedWorkspaceId)
      : null;
    if (
      !nextAllListRecord ||
      (!nextAllListRecord.value.clients.length && !nextAllListRecord.value.routes.length)
    ) {
      keysToRemove.add(allListKey);
    }

    await Promise.all([
      nextAllListRecord &&
      (nextAllListRecord.value.clients.length || nextAllListRecord.value.routes.length)
        ? AsyncStorage.setItem(
            allListKey,
            JSON.stringify(nextAllListRecord),
          )
        : Promise.resolve(),
      AsyncStorage.multiRemove(Array.from(keysToRemove)),
    ]);
  });
}

function parseStoredRouteRecord(
  raw: string | null,
  principalId: string,
): OfflineRouteCacheRecord | null {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Partial<OfflineRouteCacheRecord>;
    const storedAtMs = typeof record?.storedAtMs === "number" && Number.isFinite(record.storedAtMs)
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

async function enqueueRouteCacheMutation(
  identity: string,
  mutation: () => Promise<void>,
): Promise<void> {
  const previousMutation = pendingRouteCacheMutations.get(identity) || Promise.resolve();
  const currentMutation = previousMutation
    .catch(() => undefined)
    .then(mutation);
  pendingRouteCacheMutations.set(identity, currentMutation);

  try {
    await currentMutation;
  } finally {
    if (pendingRouteCacheMutations.get(identity) === currentMutation) {
      pendingRouteCacheMutations.delete(identity);
    }
  }
}
