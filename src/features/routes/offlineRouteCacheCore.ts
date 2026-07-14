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
