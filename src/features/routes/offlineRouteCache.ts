import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SavedRouteSyncResult } from "./routeApiCore";
import {
  createOfflineRouteCacheRecord,
  hasUsableRoutePlan,
  parseOfflineRouteCacheRecord,
  parseOfflineRouteCacheSnapshot,
  purgeAllOfflineRouteStorage,
  purgeOfflineRoutePrincipalStorage,
  purgeOfflineRouteWorkspaceStorage,
  type OfflineRouteCacheSnapshot,
} from "./offlineRouteCacheCore";
import { isOfflineWorkspacePrincipalRevoked } from "../workspaces/offlineWorkspaceCache";

const ROUTE_LIST_KEY_PREFIX = "saferoute.offline.routes.v2";
const ROUTE_DETAIL_KEY_PREFIX = "saferoute.offline.route.v2";
const pendingRouteCacheMutations = new Map<string, Promise<void>>();
let pendingGlobalRouteCacheMutation = Promise.resolve();

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
  await enqueueRouteCacheMutation(identity, async () => {
    if (await isOfflineWorkspacePrincipalRevoked(principalId)) {
      return;
    }
    await AsyncStorage.setItem(
      `${ROUTE_LIST_KEY_PREFIX}.${identity}.${clientKey(clientId)}`,
      JSON.stringify(createOfflineRouteCacheRecord(value, principalId)),
    );
  });
}

export async function loadOfflineRoutes(
  principalId: string,
  clientId?: string | null,
): Promise<SavedRouteSyncResult | null> {
  return (await loadOfflineRoutesSnapshot(principalId, clientId))?.value || null;
}

export async function loadOfflineRoutesSnapshot(
  principalId: string,
  clientId?: string | null,
): Promise<OfflineRouteCacheSnapshot | null> {
  if (!principalId.trim()) return null;
  const identity = identityKey(principalId);
  await waitForPendingRouteCacheMutation(identity);
  if (await isOfflineWorkspacePrincipalRevoked(principalId)) {
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(
      `${ROUTE_LIST_KEY_PREFIX}.${identity}.${clientKey(clientId)}`,
    );
    return raw
      ? parseOfflineRouteCacheSnapshot(JSON.parse(raw), principalId)
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
  await enqueueRouteCacheMutation(identity, async () => {
    if (await isOfflineWorkspacePrincipalRevoked(principalId)) {
      return;
    }
    await AsyncStorage.setItem(
      `${ROUTE_DETAIL_KEY_PREFIX}.${identity}.${encodeURIComponent(route.id)}`,
      JSON.stringify(createOfflineRouteCacheRecord({
        clients: [],
        routes: [route],
        selectedClientId: route.clientId || null,
      }, principalId)),
    );
  });
}

export async function loadOfflineRouteDetail(
  principalId: string,
  routeId: string,
): Promise<SavedSafeRoutePlan | null> {
  if (!principalId.trim() || !routeId.trim()) return null;
  const identity = identityKey(principalId);
  await waitForPendingRouteCacheMutation(identity);
  if (await isOfflineWorkspacePrincipalRevoked(principalId)) {
    return null;
  }
  try {
    const raw = await AsyncStorage.getItem(
      `${ROUTE_DETAIL_KEY_PREFIX}.${identity}.${encodeURIComponent(routeId)}`,
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
  await enqueueRouteCacheMutation(identity, () => {
    const scopedListKey = `${ROUTE_LIST_KEY_PREFIX}.${identity}.${clientKey(normalizedWorkspaceId)}`;
    const allListKey = `${ROUTE_LIST_KEY_PREFIX}.${identity}.${clientKey(null)}`;
    const detailKeyPrefix = `${ROUTE_DETAIL_KEY_PREFIX}.${identity}.`;
    return purgeOfflineRouteWorkspaceStorage({
      allListKey,
      detailKeyPrefix,
      listKeyPrefix: `${ROUTE_LIST_KEY_PREFIX}.${identity}.`,
      principalId: normalizedPrincipalId,
      scopedListKey,
      storage: AsyncStorage,
      workspaceId: normalizedWorkspaceId,
    });
  });
}

export async function clearOfflineRoutePrincipal(
  principalId: string,
): Promise<void> {
  const normalizedPrincipalId = principalId.trim();
  if (!normalizedPrincipalId) {
    return;
  }
  const identity = identityKey(normalizedPrincipalId);
  await enqueueRouteCacheMutation(identity, () =>
    purgeOfflineRoutePrincipalStorage({
      detailKeyPrefix: `${ROUTE_DETAIL_KEY_PREFIX}.${identity}.`,
      listKeyPrefix: `${ROUTE_LIST_KEY_PREFIX}.${identity}.`,
      principalId: normalizedPrincipalId,
      storage: AsyncStorage,
    }),
  );
}

export async function clearAllOfflineRouteCaches(): Promise<void> {
  await enqueueGlobalRouteCacheMutation(() =>
    purgeAllOfflineRouteStorage(AsyncStorage, [
      `${ROUTE_LIST_KEY_PREFIX}.`,
      `${ROUTE_DETAIL_KEY_PREFIX}.`,
    ]),
  );
}

export async function readOfflineRoutePrincipalContractState(
  principalId: string,
  expectedRouteId: string | null = null,
): Promise<"present" | "purged" | "unknown"> {
  const normalizedPrincipalId = principalId.trim();
  if (!normalizedPrincipalId) {
    return "unknown";
  }
  const identity = identityKey(normalizedPrincipalId);
  await waitForPendingRouteCacheMutation(identity);
  try {
    const listPrefix = `${ROUTE_LIST_KEY_PREFIX}.${identity}.`;
    const detailPrefix = `${ROUTE_DETAIL_KEY_PREFIX}.${identity}.`;
    const keys = (await AsyncStorage.getAllKeys()).filter(
      (key) =>
        key.startsWith(listPrefix) ||
        key.startsWith(detailPrefix),
    );
    const records = keys.length
      ? await AsyncStorage.multiGet(keys)
      : [];
    let exactDetailFound = false;
    let exactListFound = false;
    let expectedDetailFound = expectedRouteId === null;
    let expectedListFound = expectedRouteId === null;
    for (const [key, raw] of records) {
      if (raw === null) {
        continue;
      }
      const parsed = JSON.parse(raw) as { principalId?: unknown };
      const storedPrincipalId =
        typeof parsed.principalId === "string"
          ? parsed.principalId.trim()
          : "";
      if (!storedPrincipalId) {
        return "unknown";
      }
      if (storedPrincipalId === normalizedPrincipalId) {
        const snapshot = parseOfflineRouteCacheSnapshot(
          parsed,
          normalizedPrincipalId,
        );
        if (!snapshot) {
          return "unknown";
        }
        if (key.startsWith(listPrefix)) {
          exactListFound = true;
          if (
            expectedRouteId !== null &&
            snapshot.value.routes.some(
              (route) => route.id === expectedRouteId,
            )
          ) {
            expectedListFound = true;
          }
        }
        if (key.startsWith(detailPrefix)) {
          exactDetailFound = true;
          if (
            expectedRouteId !== null &&
            key ===
              `${detailPrefix}${encodeURIComponent(expectedRouteId)}` &&
            snapshot.value.routes.some(
              (route) => route.id === expectedRouteId,
            )
          ) {
            expectedDetailFound = true;
          }
        }
      }
    }
    if (!exactListFound && !exactDetailFound) {
      return "purged";
    }
    return exactListFound &&
      exactDetailFound &&
      expectedListFound &&
      expectedDetailFound
      ? "present"
      : "unknown";
  } catch {
    return "unknown";
  }
}

async function enqueueRouteCacheMutation(
  identity: string,
  mutation: () => Promise<void>,
): Promise<void> {
  const previousMutation = pendingRouteCacheMutations.get(identity) || Promise.resolve();
  const currentMutation = Promise.all([
    previousMutation.catch(() => undefined),
    pendingGlobalRouteCacheMutation.catch(() => undefined),
  ])
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

async function enqueueGlobalRouteCacheMutation(
  mutation: () => Promise<void>,
): Promise<void> {
  const currentMutation = Promise.all([
    pendingGlobalRouteCacheMutation.catch(() => undefined),
    ...Array.from(
      pendingRouteCacheMutations.values(),
      (pending) => pending.catch(() => undefined),
    ),
  ]).then(mutation);
  pendingGlobalRouteCacheMutation = currentMutation.then(
    () => undefined,
    () => undefined,
  );
  await currentMutation;
}

async function waitForPendingRouteCacheMutation(identity: string): Promise<void> {
  await Promise.all([
    pendingGlobalRouteCacheMutation.catch(() => undefined),
    pendingRouteCacheMutations.get(identity)?.catch(() => undefined),
  ]);
}
