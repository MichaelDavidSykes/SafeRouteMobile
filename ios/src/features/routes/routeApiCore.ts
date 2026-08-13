import { ApiSessionExpiredError } from '../api/apiClientCore';
import type { SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import {
  mapRouteDtoToSavedPlan,
  mapRouteDtoToSavedSummaryPlan,
  normalizeMobileClients,
  type MobileRouteListResponse,
  type MobileSafeRouteDto
} from './routeMapper';

export interface SavedRouteSyncResult {
  clients: MobileRouteListResponse['clients'];
  pagination?: SavedRouteListPagination;
  routes: SavedSafeRoutePlan[];
  selectedClientId: string | null;
}

export interface SavedRouteListPagination {
  hasMore: boolean;
  nextOffset: number | null;
  offset: number;
  pageSize: number;
}

export interface SavedRouteListOptions {
  limit?: number;
  offset?: number;
}

export type RouteApiRequester = <T>(path: string, accessToken: string) => Promise<T>;

const MALFORMED_ROUTE_DETAIL_MESSAGE = 'Saved route details were unavailable. Retry.';
const MALFORMED_WORKSPACE_CATALOG_MESSAGE = 'Workspace access could not be verified. Retry.';
export const SAVED_ROUTE_LIST_PAGE_SIZE = 50;

function normalizeRouteId(routeId: unknown): string {
  if (routeId === null || routeId === undefined) {
    return '';
  }

  return String(routeId).trim();
}

export function buildSavedRoutesPath(
  clientId?: string,
  { limit = SAVED_ROUTE_LIST_PAGE_SIZE, offset = 0 }: SavedRouteListOptions = {},
): string {
  const searchParams = new URLSearchParams();
  const normalizedClientId = String(clientId || '').trim();
  const pageSize = Math.max(1, Math.min(SAVED_ROUTE_LIST_PAGE_SIZE, Math.floor(limit) || SAVED_ROUTE_LIST_PAGE_SIZE));
  const pageOffset = Math.max(0, Math.floor(offset) || 0);
  searchParams.set('limit', String(pageSize));
  searchParams.set('view', 'summary');

  if (normalizedClientId) {
    searchParams.set('client_id', normalizedClientId);
  }
  if (pageOffset) {
    searchParams.set('offset', String(pageOffset));
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

function hasAuthoritativeWorkspaceCatalog(clients: unknown): boolean {
  if (!Array.isArray(clients)) {
    return false;
  }

  if (!clients.every((client) => {
    if (!isRoutePayloadObject(client)) {
      return false;
    }
    const id = (client as { id?: unknown }).id;
    return typeof id === 'string' && Boolean(id.trim());
  })) {
    return false;
  }

  const normalizedClients = normalizeMobileClients(clients);
  return normalizedClients.length === clients.length;
}

function normalizeOptionalClientId(clientId: unknown): string | null {
  const normalizedClientId = typeof clientId === 'string' ? clientId.trim() : '';

  return normalizedClientId || null;
}

function normalizePagination(value: unknown): SavedRouteListPagination {
  const record = isRoutePayloadObject(value) ? value : {};
  const pageSize = normalizeBoundedInteger(record.page_size, SAVED_ROUTE_LIST_PAGE_SIZE, 1, SAVED_ROUTE_LIST_PAGE_SIZE);
  const offset = normalizeBoundedInteger(record.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const nextOffset = normalizeBoundedInteger(record.next_offset, -1, 0, Number.MAX_SAFE_INTEGER);
  const hasMore = record.has_more === true && nextOffset >= 0 && nextOffset > offset;
  return {
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    offset,
    pageSize,
  };
}

function normalizeBoundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const numeric = typeof value === 'number' ? value : Number.NaN;
  return Number.isSafeInteger(numeric) && numeric >= minimum && numeric <= maximum
    ? numeric
    : fallback;
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
  clientId?: string,
  options: SavedRouteListOptions = {},
): Promise<SavedRouteSyncResult> {
  const payload = normalizeRouteListPayload(
    await request<unknown>(buildSavedRoutesPath(clientId, options), requireAccessToken(accessToken))
  );
  const requestedClientId = String(clientId || '').trim();

  if (!requestedClientId && !hasAuthoritativeWorkspaceCatalog(payload.clients)) {
    throw new Error(MALFORMED_WORKSPACE_CATALOG_MESSAGE);
  }

  return {
    clients: normalizeMobileClients(payload.clients),
    pagination: normalizePagination(payload.pagination),
    routes: Array.isArray(payload.routes)
      ? payload.routes
          .filter(hasUsableRouteId)
          .slice(0, SAVED_ROUTE_LIST_PAGE_SIZE)
          .map(mapRouteDtoToSavedSummaryPlan)
      : [],
    selectedClientId: normalizeOptionalClientId(payload.selected_client_id)
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
