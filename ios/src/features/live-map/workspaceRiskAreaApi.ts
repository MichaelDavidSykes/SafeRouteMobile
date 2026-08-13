import { apiRequest } from '../api/apiClient';
import {
  buildWorkspaceRiskAreaPath,
  normalizeWorkspaceRiskAreas
} from './workspaceRiskAreaApiCore';
import type { RiskZone } from './liveMapTypes';
import { createWorkspaceRiskRequestCache } from './workspaceRiskRequestCacheCore';

let requestSequence = 0;
const requestCache = createWorkspaceRiskRequestCache<RiskZone[]>({
  clone: cloneRiskZones,
});

export interface WorkspaceRiskMemorySnapshot {
  fresh: boolean;
  zones: RiskZone[];
}

export async function fetchWorkspaceRiskAreas({
  accessToken,
  bypassCache = false,
  clientId,
  signal
}: {
  accessToken: string;
  bypassCache?: boolean;
  clientId: string;
  signal?: AbortSignal;
}): Promise<RiskZone[]> {
  const normalizedClientId = clientId.trim();
  const normalizedAccessToken = accessToken.trim();
  const snapshot = getWorkspaceRiskAreasMemorySnapshot({
    accessToken: normalizedAccessToken,
    clientId: normalizedClientId,
  });
  if (!bypassCache && snapshot?.fresh) {
    return snapshot.zones;
  }
  const requestNonce = bypassCache
    ? `${Date.now()}-${++requestSequence}`
    : null;
  const promise = requestCache.read({
    bypassCache,
    identity: normalizedAccessToken,
    key: normalizedClientId,
    load: async () => normalizeWorkspaceRiskAreas(await apiRequest<unknown>(
      buildWorkspaceRiskAreaPath(normalizedClientId, requestNonce),
      normalizedAccessToken,
      { timeoutMs: 9000 }
    ), normalizedClientId),
  });
  return awaitWithAbort(promise, signal);
}

export function getWorkspaceRiskAreasMemorySnapshot({
  accessToken,
  clientId,
  nowMs = Date.now(),
}: {
  accessToken: string;
  clientId: string;
  nowMs?: number;
}): WorkspaceRiskMemorySnapshot | null {
  const snapshot = requestCache.peek({
    identity: accessToken.trim(),
    key: clientId.trim(),
    nowMs,
  });
  return snapshot ? { fresh: snapshot.fresh, zones: snapshot.value } : null;
}

export function invalidateWorkspaceRiskAreaCache(clientId?: string | null): void {
  const normalizedClientId = String(clientId || '').trim();
  if (normalizedClientId) {
    requestCache.invalidate(normalizedClientId);
    return;
  }
  requestCache.invalidate();
}

function cloneRiskZones(zones: readonly RiskZone[]): RiskZone[] {
  return zones.map((zone) => ({
    ...zone,
    coordinate: { ...zone.coordinate },
    connectorCoordinates: zone.connectorCoordinates?.map((coordinate) => ({ ...coordinate })),
    polygonCoordinates: zone.polygonCoordinates?.map((coordinate) => ({ ...coordinate })),
    routeSegmentCoordinates: zone.routeSegmentCoordinates?.map((coordinate) => ({ ...coordinate })),
  }));
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(createAbortError());
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(createAbortError());
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}

function createAbortError(): Error {
  const error = new Error('Request aborted.');
  error.name = 'AbortError';
  return error;
}
