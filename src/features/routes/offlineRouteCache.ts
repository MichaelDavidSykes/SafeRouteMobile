import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SavedSafeRoutePlan } from "../live-map/liveMapTypes";
import type { SavedRouteSyncResult } from "./routeApiCore";
import {
  createOfflineRouteCacheRecord,
  hasUsableRoutePlan,
  parseOfflineRouteCacheRecord,
} from "./offlineRouteCacheCore";

const ROUTE_LIST_KEY_PREFIX = "saferoute.offline.routes.v1";
const ROUTE_DETAIL_KEY_PREFIX = "saferoute.offline.route.v1";

function identityKey(userEmail: string): string {
  return encodeURIComponent(userEmail.trim().toLowerCase());
}

function clientKey(clientId?: string | null): string {
  return encodeURIComponent(String(clientId || "all").trim() || "all");
}

export async function saveOfflineRoutes(
  userEmail: string,
  clientId: string | null | undefined,
  value: SavedRouteSyncResult,
): Promise<void> {
  if (!userEmail.trim()) return;
  await AsyncStorage.setItem(
    `${ROUTE_LIST_KEY_PREFIX}.${identityKey(userEmail)}.${clientKey(clientId)}`,
    JSON.stringify(createOfflineRouteCacheRecord(value)),
  );
}

export async function loadOfflineRoutes(
  userEmail: string,
  clientId?: string | null,
): Promise<SavedRouteSyncResult | null> {
  if (!userEmail.trim()) return null;
  try {
    const raw = await AsyncStorage.getItem(
      `${ROUTE_LIST_KEY_PREFIX}.${identityKey(userEmail)}.${clientKey(clientId)}`,
    );
    return raw ? parseOfflineRouteCacheRecord(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function saveOfflineRouteDetail(
  userEmail: string,
  route: SavedSafeRoutePlan,
): Promise<void> {
  if (!userEmail.trim() || !hasUsableRoutePlan(route)) return;
  await AsyncStorage.setItem(
    `${ROUTE_DETAIL_KEY_PREFIX}.${identityKey(userEmail)}.${encodeURIComponent(route.id)}`,
    JSON.stringify(createOfflineRouteCacheRecord({
      clients: [],
      routes: [route],
      selectedClientId: route.clientId || null,
    })),
  );
}

export async function loadOfflineRouteDetail(
  userEmail: string,
  routeId: string,
): Promise<SavedSafeRoutePlan | null> {
  if (!userEmail.trim() || !routeId.trim()) return null;
  try {
    const raw = await AsyncStorage.getItem(
      `${ROUTE_DETAIL_KEY_PREFIX}.${identityKey(userEmail)}.${encodeURIComponent(routeId)}`,
    );
    const cached = raw ? parseOfflineRouteCacheRecord(JSON.parse(raw)) : null;
    return cached?.routes.find((route) => route.id === routeId) || null;
  } catch {
    return null;
  }
}
