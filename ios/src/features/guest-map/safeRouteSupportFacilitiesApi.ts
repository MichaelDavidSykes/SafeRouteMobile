import type { LatLng } from 'react-native-maps';

import { LUNARCHAIN_API_BASE } from '../../config/env';
import {
  apiRequest,
  createApiResponseError,
  createNetworkRequestError,
  fetchWithTimeout,
  parseJsonResponse,
  unwrapApiEnvelope,
} from '../api/apiClient';
import type { SupportFacility } from '../live-map/liveMapTypes';
import { normalizeMobileSupportFacilities } from '../live-map/supportFacilities';

const SUPPORT_CACHE_TTL_MS = 5 * 60_000;
const SUPPORT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_SUPPORT_CACHE_ENTRIES = 8;
const MAX_SUPPORT_ROUTE_COORDINATES = 512;

type SupportPreviewData = {
  facilities?: unknown;
  provider?: unknown;
};
type CachedSupport = {
  expiresAt: number;
  facilities: SupportFacility[];
};

const completedRequests = new Map<string, CachedSupport>();
const activeRequests = new Map<string, Promise<SupportFacility[]>>();

export async function fetchRouteSupportFacilities({
  accessToken,
  clientId,
  coordinates,
  signal,
}: {
  accessToken?: string | null;
  clientId?: string | null;
  coordinates: LatLng[];
  signal?: AbortSignal;
}): Promise<SupportFacility[]> {
  const sampledCoordinates = sampleSupportRouteCoordinates(coordinates);
  if (sampledCoordinates.length < 2) {
    return [];
  }
  const workspaceId = String(clientId || '').trim();
  const token = String(accessToken || '').trim();
  const scope = workspaceId && token ? `workspace:${workspaceId}` : 'public';
  const cacheKey = JSON.stringify([scope, sampledCoordinates]);
  const cached = completedRequests.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.facilities;
  }
  completedRequests.delete(cacheKey);

  let request = activeRequests.get(cacheKey);
  if (!request) {
    request = loadSupportFacilities({
      accessToken: token,
      clientId: workspaceId,
      coordinates: sampledCoordinates,
    }).then(({ cacheTtlMs, facilities }) => {
      completedRequests.set(cacheKey, {
        expiresAt: Date.now() + cacheTtlMs,
        facilities,
      });
      while (completedRequests.size > MAX_SUPPORT_CACHE_ENTRIES) {
        const oldestKey = completedRequests.keys().next().value;
        if (typeof oldestKey !== 'string') {
          break;
        }
        completedRequests.delete(oldestKey);
      }
      return facilities;
    }).finally(() => {
      activeRequests.delete(cacheKey);
    });
    activeRequests.set(cacheKey, request);
  }
  return awaitWithAbort(request, signal);
}

async function loadSupportFacilities({
  accessToken,
  clientId,
  coordinates,
}: {
  accessToken: string;
  clientId: string;
  coordinates: Array<{ lat: number; lon: number }>;
}): Promise<{ cacheTtlMs: number; facilities: SupportFacility[] }> {
  const body = JSON.stringify({
    ...(accessToken && clientId ? { client_id: clientId } : {}),
    coordinates,
  });
  let data: SupportPreviewData;
  if (accessToken && clientId) {
    data = await apiRequest<SupportPreviewData>(
      '/convoy-routes/support-preview',
      accessToken,
      { body, method: 'POST', timeoutMs: SUPPORT_REQUEST_TIMEOUT_MS },
    );
  } else {
    let response: Response;
    try {
      response = await fetchWithTimeout(
        `${LUNARCHAIN_API_BASE}/mobile/safe-route/support-preview`,
        {
          body,
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          method: 'POST',
          timeoutMs: SUPPORT_REQUEST_TIMEOUT_MS,
        },
      );
    } catch {
      throw createNetworkRequestError();
    }
    const responseBody = await parseJsonResponse(response);
    if (!response.ok) {
      throw createApiResponseError(response.status, responseBody);
    }
    data = unwrapApiEnvelope<SupportPreviewData>(responseBody);
  }
  return {
    cacheTtlMs: data.provider === 'configured' ? SUPPORT_CACHE_TTL_MS : 10_000,
    facilities: normalizeMobileSupportFacilities(data.facilities),
  };
}

function sampleSupportRouteCoordinates(
  coordinates: LatLng[],
): Array<{ lat: number; lon: number }> {
  const valid = coordinates.filter((coordinate) => (
    Number.isFinite(coordinate.latitude)
    && Number.isFinite(coordinate.longitude)
    && coordinate.latitude >= -90
    && coordinate.latitude <= 90
    && coordinate.longitude >= -180
    && coordinate.longitude <= 180
  ));
  if (valid.length <= MAX_SUPPORT_ROUTE_COORDINATES) {
    return valid.map(toApiCoordinate);
  }
  const sampled: Array<{ lat: number; lon: number }> = [];
  const lastIndex = valid.length - 1;
  for (let index = 0; index < MAX_SUPPORT_ROUTE_COORDINATES; index += 1) {
    const sourceIndex = Math.round(index * lastIndex / (MAX_SUPPORT_ROUTE_COORDINATES - 1));
    sampled.push(toApiCoordinate(valid[sourceIndex]));
  }
  return sampled;
}

function toApiCoordinate(coordinate: LatLng): { lat: number; lon: number } {
  return {
    lat: Number(coordinate.latitude.toFixed(6)),
    lon: Number(coordinate.longitude.toFixed(6)),
  };
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(new Error('Support request cancelled.'));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('Support request cancelled.'));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener('abort', abort);
    });
  });
}
