import {
  areaRiskViewportRequestKey,
  mergeRiskZonesById,
  type AreaRiskCacheKeyOptions,
  type AreaRiskViewportRequest
} from './areaRiskApiCore';
import type { RiskZone } from './liveMapTypes';

export const VIEWPORT_RISK_CACHE_TTL_MS = 10 * 60 * 1000;
export const VIEWPORT_RISK_CACHE_MAX_ENTRIES = 32;

export interface ViewportRiskCacheEntry {
  cachedAt: number;
  key: string;
  lastAccessedAt: number;
  request: AreaRiskViewportRequest;
  zones: RiskZone[];
}

export interface ViewportRiskCachePruneOptions {
  maxEntries?: number;
  now?: number;
  ttlMs?: number;
}

export type ViewportRiskCache = Map<string, ViewportRiskCacheEntry>;

export function resolveViewportRiskDisplayZones(
  retainedZones: readonly RiskZone[],
  nextViewportZones: readonly RiskZone[],
  replacementReady: boolean
): RiskZone[] {
  return replacementReady
    ? mergeRiskZonesById(nextViewportZones)
    : mergeRiskZonesById(retainedZones, nextViewportZones);
}

export function viewportRiskCacheKey(
  request: AreaRiskViewportRequest,
  options?: AreaRiskCacheKeyOptions
): string {
  return areaRiskViewportRequestKey(request, options);
}

export function isViewportRiskCacheEntryFresh(
  entry: Pick<ViewportRiskCacheEntry, 'cachedAt'>,
  now = Date.now(),
  ttlMs = VIEWPORT_RISK_CACHE_TTL_MS
): boolean {
  return Number.isFinite(entry.cachedAt) &&
    Number.isFinite(now) &&
    Number.isFinite(ttlMs) &&
    ttlMs > 0 &&
    entry.cachedAt <= now &&
    now - entry.cachedAt <= ttlMs;
}

export function getCachedViewportRiskZones(
  cache: ViewportRiskCache,
  request: AreaRiskViewportRequest,
  {
    now = Date.now(),
    ttlMs = VIEWPORT_RISK_CACHE_TTL_MS,
    ...keyOptions
  }: AreaRiskCacheKeyOptions & { now?: number; ttlMs?: number } = {}
): RiskZone[] | null {
  const key = viewportRiskCacheKey(request, keyOptions);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (!isViewportRiskCacheEntryFresh(entry, now, ttlMs)) {
    cache.delete(key);
    return null;
  }

  entry.lastAccessedAt = now;
  return cloneRiskZones(entry.zones);
}

export function cacheViewportRiskZones(
  cache: ViewportRiskCache,
  request: AreaRiskViewportRequest,
  zones: readonly RiskZone[],
  {
    now = Date.now(),
    ttlMs = VIEWPORT_RISK_CACHE_TTL_MS,
    maxEntries = VIEWPORT_RISK_CACHE_MAX_ENTRIES,
    ...keyOptions
  }: AreaRiskCacheKeyOptions & ViewportRiskCachePruneOptions = {}
): ViewportRiskCacheEntry {
  const key = viewportRiskCacheKey(request, keyOptions);
  const entry: ViewportRiskCacheEntry = {
    cachedAt: now,
    key,
    lastAccessedAt: now,
    request: cloneRequest(request),
    zones: cloneRiskZones(mergeRiskZonesById(zones))
  };
  cache.set(key, entry);
  pruneViewportRiskCache(cache, { maxEntries, now, ttlMs });
  return cloneEntry(entry);
}

export function collectFreshViewportRiskZones(
  cache: ViewportRiskCache,
  {
    now = Date.now(),
    ttlMs = VIEWPORT_RISK_CACHE_TTL_MS
  }: Pick<ViewportRiskCachePruneOptions, 'now' | 'ttlMs'> = {}
): RiskZone[] {
  pruneViewportRiskCache(cache, { now, ttlMs, maxEntries: VIEWPORT_RISK_CACHE_MAX_ENTRIES });
  return mergeRiskZonesById(...Array.from(cache.values()).map((entry) => entry.zones));
}

export function pruneViewportRiskCache(
  cache: ViewportRiskCache,
  {
    maxEntries = VIEWPORT_RISK_CACHE_MAX_ENTRIES,
    now = Date.now(),
    ttlMs = VIEWPORT_RISK_CACHE_TTL_MS
  }: ViewportRiskCachePruneOptions = {}
): ViewportRiskCache {
  for (const [key, entry] of cache.entries()) {
    if (!isViewportRiskCacheEntryFresh(entry, now, ttlMs)) {
      cache.delete(key);
    }
  }

  const safeLimit = Math.max(0, Math.trunc(Number.isFinite(maxEntries) ? maxEntries : VIEWPORT_RISK_CACHE_MAX_ENTRIES));
  if (cache.size > safeLimit) {
    const oldest = Array.from(cache.values()).sort((left, right) =>
      left.lastAccessedAt - right.lastAccessedAt || left.cachedAt - right.cachedAt
    );
    oldest.slice(0, cache.size - safeLimit).forEach((entry) => cache.delete(entry.key));
  }
  return cache;
}

function cloneEntry(entry: ViewportRiskCacheEntry): ViewportRiskCacheEntry {
  return {
    ...entry,
    request: cloneRequest(entry.request),
    zones: cloneRiskZones(entry.zones)
  };
}

function cloneRequest(request: AreaRiskViewportRequest): AreaRiskViewportRequest {
  return {
    ...request,
    countries: request.countries ? [...request.countries] : undefined
  };
}

function cloneRiskZones(zones: readonly RiskZone[]): RiskZone[] {
  return zones.map((zone) => ({
    ...zone,
    coordinate: { ...zone.coordinate },
    connectorCoordinates: zone.connectorCoordinates?.map((coordinate) => ({ ...coordinate })),
    polygonCoordinates: zone.polygonCoordinates?.map((coordinate) => ({ ...coordinate })),
    routeSegmentCoordinates: zone.routeSegmentCoordinates?.map((coordinate) => ({ ...coordinate }))
  }));
}
