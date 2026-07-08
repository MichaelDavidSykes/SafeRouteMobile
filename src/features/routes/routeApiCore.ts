import { ApiSessionExpiredError } from '../api/apiClientCore';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import {
  mapRouteDtoToSavedPlan,
  normalizeMobileClients,
  type MobileRouteListResponse,
  type MobileSafeRouteDto
} from './routeMapper';

export interface SavedRouteSyncResult {
  clients: MobileRouteListResponse['clients'];
  routes: SavedSafeRoutePlan[];
}

export type RouteApiRequester = <T>(path: string, accessToken: string) => Promise<T>;

const MALFORMED_ROUTE_DETAIL_MESSAGE = 'Saved route details were unavailable. Retry.';

function normalizeRouteId(routeId: unknown): string {
  if (routeId === null || routeId === undefined) {
    return '';
  }

  return String(routeId).trim();
}

export function buildSavedRoutesPath(clientId?: string): string {
  const searchParams = new URLSearchParams();
  const normalizedClientId = String(clientId || '').trim();

  if (normalizedClientId) {
    searchParams.set('client_id', normalizedClientId);
  }

  const queryString = searchParams.toString();
  return `/mobile/safe-route/routes${queryString ? `?${queryString}` : ''}`;
}

export function buildRouteDetailPath(routeId: string): string {
  const normalizedRouteId = normalizeRouteId(routeId);

  if (!normalizedRouteId) {
    throw new Error('A route id is required before loading SafeRoute details.');
  }

  return `/mobile/safe-route/routes/${encodeURIComponent(normalizedRouteId)}`;
}

function requireAccessToken(accessToken: string): string {
  const normalizedAccessToken = String(accessToken || '').trim();

  if (!normalizedAccessToken) {
    throw new ApiSessionExpiredError('Sign in again before loading saved SafeRoute data.');
  }

  return normalizedAccessToken;
}

function hasUsableRouteId(route: unknown): route is MobileSafeRouteDto {
  if (!isRoutePayloadObject(route)) {
    return false;
  }

  return Boolean(normalizeRouteId((route as { id?: unknown }).id));
}

function isRoutePayloadObject(payload: unknown): payload is Record<string, unknown> {
  return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload));
}

function normalizeRouteListPayload(payload: unknown): Partial<MobileRouteListResponse> {
  return isRoutePayloadObject(payload) ? payload as Partial<MobileRouteListResponse> : {};
}

function requireRouteDetailPayload(payload: unknown): MobileSafeRouteDto {
  if (!isRoutePayloadObject(payload)) {
    throw new Error(MALFORMED_ROUTE_DETAIL_MESSAGE);
  }

  return payload as unknown as MobileSafeRouteDto;
}

function withRequestedRouteIdFallback(
  route: MobileSafeRouteDto,
  requestedRouteId: string
): MobileSafeRouteDto {
  const normalizedPayloadId = normalizeRouteId(route.id);

  if (normalizedPayloadId) {
    return {
      ...route,
      id: normalizedPayloadId
    };
  }

  return {
    ...route,
    id: requestedRouteId
  };
}

export async function loadSavedRoutes(
  request: RouteApiRequester,
  accessToken: string,
  clientId?: string
): Promise<SavedRouteSyncResult> {
  const payload = normalizeRouteListPayload(
    await request<unknown>(buildSavedRoutesPath(clientId), requireAccessToken(accessToken))
  );

  return {
    clients: normalizeMobileClients(payload.clients),
    routes: Array.isArray(payload.routes)
      ? payload.routes.filter(hasUsableRouteId).map(mapRouteDtoToSavedPlan)
      : []
  };
}

export async function loadRouteDetail(
  request: RouteApiRequester,
  accessToken: string,
  routeId: string
): Promise<SavedSafeRoutePlan> {
  const normalizedRouteId = normalizeRouteId(routeId);
  const payload = requireRouteDetailPayload(
    await request<unknown>(
      buildRouteDetailPath(normalizedRouteId),
      requireAccessToken(accessToken)
    )
  );
  return mapRouteDtoToSavedPlan(withRequestedRouteIdFallback(payload, normalizedRouteId));
}
