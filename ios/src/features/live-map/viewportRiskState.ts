import {
  areaRiskItemIntersectsBounds,
  areaRiskViewportRequestKey,
  mergeRiskZonesById,
  type AreaRiskCacheKeyOptions,
  type AreaRiskFeed,
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
export type ViewportRiskCoverageState =
  | 'idle'
  | 'loading'
  | 'cached'
  | 'pending'
  | 'current'
  | 'current-empty'
  | 'cooldown'
  | 'unavailable'
  | 'missing'
  | 'partial'
  | 'pending-timeout'
  | 'stale'
  | 'failed';

export interface ViewportRiskCoverageOutcomeInput {
  allRequestsFailed: boolean;
  cooldownRequestCount: number;
  cooldownRetryAfterSeconds: number;
  currentEmptyResearchCount: number;
  failedRequestCount: number;
  missingRequestCount: number;
  partialRequestCount: number;
  pendingRequestCount: number;
  readFailureCount: number;
  researchAvailable: boolean;
  researchFailureCount: number;
  researchRequested: boolean;
  safetyRejectedRequestCount: number;
  statusFailureCount: number;
  unavailableRequestCount: number;
  unavailableRetryAfterSeconds: number;
  visibleZoneCount: number;
}

export interface ViewportRiskCoverageOutcome {
  coverageState: ViewportRiskCoverageState;
  errorMessage: string;
  statusMessage: string;
}

export interface ViewportRiskUnavailableRecovery {
  blockedUntilMs: number;
  scheduleDelayMs: number | null;
}

const PENDING_RESEARCH_STATUSES = new Set([
  'pending',
  'queued',
  'refreshing',
  'researching',
  'scheduled'
]);
const FAILED_RESEARCH_STATUSES = new Set([
  'error',
  'failed',
  'partial',
  'stale',
  'unavailable'
]);

export function isAreaRiskFeedPending(
  feed: Pick<
    AreaRiskFeed,
    'coverageStatus' | 'providerStatus' | 'research' | 'seedStatus'
  >
): boolean {
  return feed.research?.pending === true
    || PENDING_RESEARCH_STATUSES.has(String(feed.coverageStatus || '').trim().toLowerCase())
    || PENDING_RESEARCH_STATUSES.has(String(feed.providerStatus || '').trim().toLowerCase())
    || PENDING_RESEARCH_STATUSES.has(String(feed.seedStatus || '').trim().toLowerCase());
}

export function isAreaRiskFeedFailed(
  feed: Pick<AreaRiskFeed, 'coverageStatus' | 'providerStatus' | 'seedStatus'>
    & Partial<Pick<AreaRiskFeed, 'safetyFilter'>>
): boolean {
  const providerStatus = String(feed.providerStatus || '').trim().toLowerCase();
  if (
    providerStatus === 'partial'
    && (
      !feed.safetyFilter?.valid
      || feed.safetyFilter.rejectedCount <= 0
    )
  ) {
    return true;
  }
  return FAILED_RESEARCH_STATUSES.has(
    String(feed.coverageStatus || '').trim().toLowerCase()
  ) || (
    providerStatus !== 'partial'
    && FAILED_RESEARCH_STATUSES.has(providerStatus)
  ) || FAILED_RESEARCH_STATUSES.has(
    String(feed.seedStatus || '').trim().toLowerCase()
  );
}

export function isAreaRiskFeedMissing(
  feed: Pick<
    AreaRiskFeed,
    'coverageStatus' | 'providerStatus' | 'seedStatus' | 'zones'
  >,
  { requireTenantResearch = false }: { requireTenantResearch?: boolean } = {}
): boolean {
  const coverageStatus = String(feed.coverageStatus || '').trim().toLowerCase();
  const seedStatus = String(feed.seedStatus || '').trim().toLowerCase();
  if (coverageStatus === 'missing') {
    return true;
  }
  const seedWasNotRequested = !seedStatus || seedStatus === 'not-requested';
  return requireTenantResearch && seedWasNotRequested;
}

export function canCacheViewportRiskFeed(
  feed: Pick<
    AreaRiskFeed,
    | 'coverageStatus'
    | 'partial'
    | 'providerStatus'
    | 'readError'
    | 'research'
    | 'seedStatus'
    | 'zones'
  >,
  options: { requireTenantResearch?: boolean } = {}
): boolean {
  return !feed.partial
    && !feed.readError
    && !isAreaRiskFeedPending(feed)
    && !isAreaRiskFeedFailed(feed)
    && !isAreaRiskFeedMissing(feed, options);
}

export function resolveViewportRiskCoverageOutcome({
  allRequestsFailed,
  cooldownRequestCount,
  cooldownRetryAfterSeconds,
  currentEmptyResearchCount,
  failedRequestCount,
  missingRequestCount,
  partialRequestCount,
  pendingRequestCount,
  readFailureCount,
  researchAvailable,
  researchFailureCount,
  researchRequested,
  safetyRejectedRequestCount,
  statusFailureCount,
  unavailableRequestCount,
  unavailableRetryAfterSeconds,
  visibleZoneCount
}: ViewportRiskCoverageOutcomeInput): ViewportRiskCoverageOutcome {
  if (unavailableRequestCount > 0) {
    const retryCopy = unavailableRetryAfterSeconds > 0
      ? ` Retry is available in about ${unavailableRetryAfterSeconds} sec.`
      : ' Retry is available shortly.';
    return {
      coverageState: 'unavailable',
      errorMessage: `Risk coverage is temporarily unavailable.${retryCopy}`,
      statusMessage: visibleZoneCount > 0
        ? 'Current-view risks remain visible while SafeRoute waits for the service.'
        : (pendingRequestCount > 0
          ? 'Risk research remains in progress while coverage reads recover.'
          : 'SafeRoute is waiting to retry risk coverage.')
    };
  }
  if (cooldownRequestCount > 0) {
    return {
      coverageState: 'cooldown',
      errorMessage: '',
      statusMessage:
        `Risk research is cooling down. Try again in about ${
          cooldownRetryAfterSeconds >= 60
            ? `${Math.ceil(cooldownRetryAfterSeconds / 60)} min`
            : `${cooldownRetryAfterSeconds} sec`
        }.`
    };
  }
  if (pendingRequestCount > 0) {
    return {
      coverageState: readFailureCount > 0 ? 'partial' : 'pending',
      errorMessage: readFailureCount > 0
        ? 'Risk research is active, but some existing coverage could not be read.'
        : '',
      statusMessage: visibleZoneCount > 0
        ? 'Researching updated risk coverage. Existing risks remain visible.'
        : 'Researching risk coverage…'
    };
  }
  if (allRequestsFailed) {
    return {
      coverageState: visibleZoneCount > 0 ? 'stale' : 'failed',
      errorMessage: 'Risk areas could not be updated. Move the map or retry.',
      statusMessage: visibleZoneCount > 0
        ? 'Previously loaded risks remain visible.'
        : ''
    };
  }
  if (safetyRejectedRequestCount > 0) {
    return {
      coverageState: 'partial',
      errorMessage: '',
      statusMessage: visibleZoneCount > 0
        ? 'SafeRoute excluded city-scale or unverifiable risk areas. Bounded local risks remain visible.'
        : 'SafeRoute excluded city-scale or unverifiable risk areas; none were shown.'
    };
  }
  if (
    failedRequestCount > 0
    || partialRequestCount > 0
    || readFailureCount > 0
    || researchFailureCount > 0
    || statusFailureCount > 0
  ) {
    return {
      coverageState: visibleZoneCount > 0 ? 'partial' : 'failed',
      errorMessage: visibleZoneCount > 0
        ? 'Some risk coverage could not be updated. Existing results remain visible.'
        : 'Risk coverage could not be completed. Retry when convenient.',
      statusMessage: ''
    };
  }
  if (missingRequestCount > 0) {
    return {
      coverageState: 'missing',
      errorMessage: '',
      statusMessage: visibleZoneCount > 0
        ? 'Some risk coverage has not been researched for this map view.'
        : 'No researched risk coverage is available for this map view.'
    };
  }
  if (visibleZoneCount === 0) {
    return {
      coverageState: 'current-empty',
      errorMessage: '',
      statusMessage: currentEmptyResearchCount > 0
        ? 'Research complete. No current risk areas were found.'
        : (researchAvailable
          ? 'No researched risks are available here. Use Research risks.'
          : 'No current risk areas in this map view.')
    };
  }
  return {
    coverageState: 'current',
    errorMessage: '',
    statusMessage: researchRequested
      ? 'Risk research checked this map view.'
      : ''
  };
}

export function resolveViewportRiskDisplayZones(
  retainedZones: readonly RiskZone[],
  nextViewportZones: readonly RiskZone[],
  replacementReady: boolean
): RiskZone[] {
  return replacementReady
    ? mergeRiskZonesById(nextViewportZones)
    : mergeRiskZonesById(retainedZones, nextViewportZones);
}

export function resolveCompletedViewportRiskZones(
  cachedZones: readonly RiskZone[],
  receivedZones: readonly RiskZone[],
  bypassCache: boolean
): RiskZone[] {
  return bypassCache
    ? mergeRiskZonesById(receivedZones)
    : mergeRiskZonesById(cachedZones, receivedZones);
}

export function resolveUnavailableViewportRiskZones(
  retainedZones: readonly RiskZone[],
  contextChanged: boolean
): RiskZone[] {
  return contextChanged ? [] : mergeRiskZonesById(retainedZones);
}

export function resolveViewportRiskUnavailableRecovery({
  attempts,
  context,
  currentContext,
  maxAutoRetries,
  maxAutoRetryMs,
  nowMs,
  retryAfterSeconds
}: {
  attempts: number;
  context: string;
  currentContext: string;
  maxAutoRetries: number;
  maxAutoRetryMs: number;
  nowMs: number;
  retryAfterSeconds: number;
}): ViewportRiskUnavailableRecovery {
  const delayMs = Math.max(0, retryAfterSeconds * 1000);
  const boundedNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    blockedUntilMs: boundedNowMs + delayMs,
    scheduleDelayMs:
      context === currentContext
      && attempts < maxAutoRetries
      && delayMs <= maxAutoRetryMs
        ? delayMs
        : null
  };
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

export function collectFreshViewportRiskZonesForRequests(
  cache: ViewportRiskCache,
  requests: readonly AreaRiskViewportRequest[],
  {
    limit = VIEWPORT_RISK_CACHE_MAX_ENTRIES * 10,
    now = Date.now(),
    ttlMs = VIEWPORT_RISK_CACHE_TTL_MS
  }: Pick<ViewportRiskCachePruneOptions, 'now' | 'ttlMs'> & {
    limit?: number;
  } = {}
): RiskZone[] {
  pruneViewportRiskCache(cache, {
    maxEntries: VIEWPORT_RISK_CACHE_MAX_ENTRIES,
    now,
    ttlMs
  });
  if (!requests.length) {
    return [];
  }

  const matchingZones: RiskZone[][] = [];
  for (const entry of cache.values()) {
    const visibleZones = entry.zones.filter((zone) =>
      requests.some((request) =>
        areaRiskItemIntersectsBounds({
          ...zone,
          coordinates:
            zone.polygonCoordinates?.length
              ? zone.polygonCoordinates
              : zone.routeSegmentCoordinates
        }, {
          south: request.minLat,
          west: request.minLon,
          north: request.maxLat,
          east: request.maxLon
        })
      )
    );
    if (visibleZones.length) {
      entry.lastAccessedAt = now;
      matchingZones.push(visibleZones);
    }
  }

  const safeLimit = Math.max(
    0,
    Math.trunc(Number.isFinite(limit) ? limit : VIEWPORT_RISK_CACHE_MAX_ENTRIES * 10)
  );
  return mergeRiskZonesById(...matchingZones).slice(0, safeLimit);
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
