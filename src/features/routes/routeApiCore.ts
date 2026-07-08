import { ApiSessionExpiredError } from '../api/apiClientCore';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import { mapRouteDtoToSavedPlan, type MobileRouteListResponse, type MobileSafeRouteDto } from './routeMapper';

export interface SavedRouteSyncResult {
  clients: MobileRouteListResponse['clients'];
  routes: SavedSafeRoutePlan[];
}

export type RouteApiRequester = <T>(path: string, accessToken: string) => Promise<T>;

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
  const normalizedRouteId = String(routeId || '').trim();

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

export async function loadSavedRoutes(
  request: RouteApiRequester,
  accessToken: string,
  clientId?: string
): Promise<SavedRouteSyncResult> {
  const payload = await request<MobileRouteListResponse>(buildSavedRoutesPath(clientId), requireAccessToken(accessToken));

  return {
    clients: Array.isArray(payload.clients) ? payload.clients : [],
    routes: Array.isArray(payload.routes) ? payload.routes.map(mapRouteDtoToSavedPlan) : []
  };
}

export async function loadRouteDetail(
  request: RouteApiRequester,
  accessToken: string,
  routeId: string
): Promise<SavedSafeRoutePlan> {
  const payload = await request<MobileSafeRouteDto>(buildRouteDetailPath(routeId), requireAccessToken(accessToken));
  return mapRouteDtoToSavedPlan(payload);
}
