import type { Region } from 'react-native-maps';

import {
  ApiAuthorizationError,
  ApiRequestError,
  ApiSessionExpiredError,
  createApiResponseError,
  createNetworkRequestError,
  fetchWithTimeout,
  parseJsonResponse,
  type SafeRouteRequestOptions
} from '../api/apiClientCore';
import {
  AREA_RISK_RESEARCH_ENDPOINT_PATH,
  DEFAULT_AREA_RISK_PAGE_SIZE,
  MAX_AREA_RISK_PAGES,
  areaRiskQueryBoundsForRequest,
  areaRiskResponseBoundsMatchRequest,
  buildAreaRiskRequestHeaders,
  buildAreaRiskResearchPayload,
  buildAreaRiskViewportPath,
  canRequestAreaRiskResearch,
  mergeRiskZonesById,
  normalizeAreaRiskFeedPage,
  normalizeAreaRiskResearchState,
  regionToAreaRiskViewportRequests,
  type AreaRiskFeed,
  type AreaRiskFeedPage,
  type AreaRiskLoadIntent,
  type AreaRiskResearchState,
  type AreaRiskRetryableReadFailure,
  type AreaRiskViewportRequest,
  type AreaRiskViewportRequestOptions
} from './areaRiskApiCore';
import { classifyAreaRiskFeedAuthority } from './areaRiskAuthority';
import {
  aggregateAreaRiskSafetyFilters,
  areaRiskSafetyFiltersEqual,
  areaRiskSafetyWarning
} from './areaRiskSafetyFilter';

export type AreaRiskHttpRequester = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
) => Promise<Response>;

export interface AreaRiskFetchOptions {
  accessToken?: string | null;
  apiBase?: string;
  bypassCache?: boolean;
  intent?: AreaRiskLoadIntent;
  request?: AreaRiskHttpRequester;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AreaRiskRegionFetchOptions
  extends AreaRiskFetchOptions,
    AreaRiskViewportRequestOptions {}

class AreaRiskResearchEndpointUnavailableError extends Error {
  constructor() {
    super('The explicit area-risk research endpoint is unavailable.');
    this.name = 'AreaRiskResearchEndpointUnavailableError';
  }
}

export class AreaRiskRetryableReadError extends ApiRequestError {
  retryableReadFailure: AreaRiskRetryableReadFailure;

  constructor(message: string, retryAfterSeconds: number) {
    super(message, 503);
    this.name = 'AreaRiskRetryableReadError';
    this.retryableReadFailure = {
      operation: 'read',
      retryAfterSeconds,
      statusCode: 503
    };
  }
}

export function getAreaRiskRetryableReadFailure(
  error: unknown
): AreaRiskRetryableReadFailure | null {
  return error instanceof AreaRiskRetryableReadError
    ? error.retryableReadFailure
    : null;
}

let readNonceCounter = 0;
const MAX_SUPPORTED_RETRY_AFTER_SECONDS = Math.floor(2_147_483_647 / 1000);
const INCOMPLETE_AREA_RISK_STATUSES = new Set([
  'error',
  'failed',
  'missing',
  'partial',
  'pending',
  'queued',
  'refreshing',
  'researching',
  'scheduled',
  'stale',
  'unavailable'
]);

export async function fetchAreaRiskViewport(
  viewportRequest: AreaRiskViewportRequest,
  options: AreaRiskFetchOptions = {}
): Promise<AreaRiskFeed> {
  const accessToken = String(options.accessToken ?? '').trim();
  const researchRequested = options.intent === 'research'
    && canRequestAreaRiskResearch(viewportRequest, accessToken);
  let research: AreaRiskResearchState | null = null;
  let researchError: string | null = null;

  if (researchRequested) {
    try {
      research = await requestAreaRiskResearch(viewportRequest, {
        ...options,
        accessToken
      });
    } catch (error) {
      if (error instanceof AreaRiskResearchEndpointUnavailableError) {
        const legacyFeed = await readAreaRiskPages(viewportRequest, {
          ...options,
          accessToken,
          bypassCache: true
        }, true);
        return {
          ...legacyFeed,
          legacyFallback: true,
          researchError:
            'The explicit research command is unavailable; SafeRoute used one legacy compatibility request.'
        };
      }
      if (isAccessBoundaryError(error)) {
        throw error;
      }
      researchError = describeAreaRiskError(
        error,
        'Risk research could not be requested. Existing coverage was loaded instead.'
      );
    }
  }

  try {
    const feed = await readAreaRiskPages(viewportRequest, {
      ...options,
      accessToken,
      bypassCache: options.bypassCache === true || researchRequested
    }, false);
    return {
      ...feed,
      research,
      researchError
    };
  } catch (error) {
    if (!researchRequested || isAccessBoundaryError(error)) {
      throw error;
    }
    return {
      coverageStatus: research?.coverageStatus ?? null,
      discardedUnsafeAreaCount: 0,
      fetchedAt: null,
      legacyFallback: false,
      localCityScaleRejectedCount: 0,
      localSpatialRejectedCount: 0,
      message: research?.pending
        ? 'Risk research is in progress, but existing coverage could not be read.'
        : 'Existing risk coverage could not be read after the research request.',
      pagesLoaded: 0,
      partial: false,
      providerStatus: research?.pending ? 'queued' : 'unavailable',
      readError: describeAreaRiskError(
        error,
        'Existing risk coverage could not be read.'
      ),
      retryableReadFailure: getAreaRiskRetryableReadFailure(error),
      research,
      researchError,
      safetyFilter: aggregateAreaRiskSafetyFilters([]),
      safetyWarning: null,
      seedStatus: research?.seedStatus ?? null,
      zones: []
    };
  }
}

export async function fetchAreaRiskForRegion(
  region: Region,
  options: AreaRiskRegionFetchOptions = {}
): Promise<AreaRiskFeed> {
  const requests = regionToAreaRiskViewportRequests(region, options);
  if (!requests.length) {
    return {
      coverageStatus: null,
      discardedUnsafeAreaCount: 0,
      fetchedAt: null,
      legacyFallback: false,
      localCityScaleRejectedCount: 0,
      localSpatialRejectedCount: 0,
      message: 'Zoom in to load risk areas for this map view.',
      pagesLoaded: 0,
      partial: false,
      providerStatus: null,
      readError: null,
      retryableReadFailure: null,
      research: null,
      researchError: null,
      safetyFilter: aggregateAreaRiskSafetyFilters([]),
      safetyWarning: null,
      seedStatus: null,
      zones: []
    };
  }

  const feeds = await Promise.all(requests.map((request) => fetchAreaRiskViewport(request, options)));
  const safetyFilter = aggregateAreaRiskSafetyFilters(
    feeds.map((feed) => feed.safetyFilter)
  );
  if (!safetyFilter.valid) {
    throw new ApiRequestError(
      'Risk coverage returned inconsistent safety-filter authority across map partitions.',
      502
    );
  }
  const localCityScaleRejectedCount = feeds.reduce(
    (total, feed) => total + feed.localCityScaleRejectedCount,
    0
  );
  const localSpatialRejectedCount = feeds.reduce(
    (total, feed) => total + feed.localSpatialRejectedCount,
    0
  );
  const discardedUnsafeAreaCount = safetyFilter.rejectedCount
    + localCityScaleRejectedCount
    + localSpatialRejectedCount;
  const safetyWarning = areaRiskSafetyWarning(discardedUnsafeAreaCount);
  const zones = mergeRiskZonesById(...feeds.map((feed) => feed.zones));
  const research = aggregateResearchState(feeds.map((feed) => feed.research));
  const readError = firstMessage(feeds.map((feed) => feed.readError));
  const retryableReadFailure = aggregateRetryableReadFailure(
    feeds.map((feed) => feed.retryableReadFailure)
  );
  const researchError = firstMessage(feeds.map((feed) => feed.researchError));
  const requireTenantResearch = Boolean(
    String(options.accessToken || '').trim()
    && String(options.clientId || '').trim()
  );
  const partial = feeds.some((feed) =>
    feed.partial
    || Boolean(feed.readError)
    || areaRiskFeedIsIncomplete(feed, requireTenantResearch)
  );
  return {
    coverageStatus: feeds.map((feed) => feed.coverageStatus).find(Boolean) ?? null,
    discardedUnsafeAreaCount,
    fetchedAt: feeds.map((feed) => feed.fetchedAt).find(Boolean) ?? null,
    legacyFallback: feeds.some((feed) => feed.legacyFallback),
    localCityScaleRejectedCount,
    localSpatialRejectedCount,
    message: zones.length
      ? `${zones.length} SafeRoute area-risk signal${zones.length === 1 ? '' : 's'} prepared.`
      : (safetyWarning
        ?? feeds.map((feed) => feed.message).find(Boolean)
        ?? 'No risk areas were returned.'),
    pagesLoaded: feeds.reduce((total, feed) => total + feed.pagesLoaded, 0),
    partial,
    providerStatus: feeds.map((feed) => feed.providerStatus).find(Boolean) ?? null,
    readError,
    retryableReadFailure,
    research,
    researchError,
    safetyFilter,
    safetyWarning,
    seedStatus: feeds.map((feed) => feed.seedStatus).find(Boolean) ?? research?.seedStatus ?? null,
    zones
  };
}

async function requestAreaRiskResearch(
  viewportRequest: AreaRiskViewportRequest,
  options: AreaRiskFetchOptions
): Promise<AreaRiskResearchState> {
  const accessToken = String(options.accessToken ?? '').trim();
  const headers = {
    ...buildAreaRiskRequestHeaders(accessToken),
    'Content-Type': 'application/json'
  };
  const response = await performAreaRiskRequest(
    `${requireAreaRiskApiBase(options)}${AREA_RISK_RESEARCH_ENDPOINT_PATH}`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify(buildAreaRiskResearchPayload(viewportRequest)),
      signal: options.signal,
      timeoutMs: options.timeoutMs
    },
    options.request
  );
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    if (isResearchEndpointUnavailable(response.status, body)) {
      throw new AreaRiskResearchEndpointUnavailableError();
    }
    throw createApiResponseError(
      response.status,
      body,
      'Unable to request risk research for this map view.'
    );
  }
  return normalizeAreaRiskResearchState(body);
}

async function readAreaRiskPages(
  viewportRequest: AreaRiskViewportRequest,
  options: AreaRiskFetchOptions,
  legacyEnsure: boolean
): Promise<AreaRiskFeed> {
  const pageSize = Math.max(
    1,
    Math.min(DEFAULT_AREA_RISK_PAGE_SIZE, viewportRequest.maxRecords)
  );
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  let pagesLoaded = 0;
  let aggregate: AreaRiskFeedPage | null = null;
  let partial = false;
  let readError: string | null = null;
  let retryableReadFailure: AreaRiskRetryableReadFailure | null = null;
  let localCityScaleRejectedCount = 0;
  let localSpatialRejectedCount = 0;

  while (pagesLoaded < MAX_AREA_RISK_PAGES) {
    let page: AreaRiskFeedPage;
    const remainingRecords = Math.max(
      1,
      viewportRequest.maxRecords - (aggregate?.zones.length ?? 0)
    );
    try {
      page = await readAreaRiskPage(viewportRequest, options, {
        cursor,
        legacyEnsure: legacyEnsure && pagesLoaded === 0,
        pageNumber: pagesLoaded,
        pageSize: Math.min(pageSize, remainingRecords)
      });
    } catch (error) {
      if (!aggregate || isAccessBoundaryError(error)) {
        throw error;
      }
      partial = true;
      readError = describeAreaRiskError(
        error,
        'Some risk coverage pages could not be loaded.'
      );
      retryableReadFailure = getAreaRiskRetryableReadFailure(error);
      break;
    }

    pagesLoaded += 1;
    const pageOverflow =
      (aggregate?.zones.length ?? 0) + page.zones.length > viewportRequest.maxRecords;
    if (aggregate === null) {
      aggregate = page;
      localCityScaleRejectedCount = page.localCityScaleRejectedCount;
      localSpatialRejectedCount = page.localSpatialRejectedCount;
    } else {
      const previousPage: AreaRiskFeedPage = aggregate;
      if (
        !previousPage.semanticAuthority
        || !page.semanticAuthority
        || previousPage.semanticAuthority.paginationSignature
          !== page.semanticAuthority.paginationSignature
      ) {
        throw new ApiRequestError(
          'Risk coverage changed provider or privacy authority between pages.',
          502
        );
      }
      if (!areaRiskSafetyFiltersEqual(previousPage.safetyFilter, page.safetyFilter)) {
        throw new ApiRequestError(
          'Risk coverage changed safety-filter authority between pages.',
          502
        );
      }
      localCityScaleRejectedCount += page.localCityScaleRejectedCount;
      localSpatialRejectedCount += page.localSpatialRejectedCount;
      const discardedUnsafeAreaCount = previousPage.safetyFilter.rejectedCount
        + localCityScaleRejectedCount
        + localSpatialRejectedCount;
      const zones = mergeRiskZonesById(previousPage.zones, page.zones)
        .slice(0, viewportRequest.maxRecords);
      const safetyWarning = areaRiskSafetyWarning(discardedUnsafeAreaCount);
      aggregate = {
        ...previousPage,
        coverageStatus: page.coverageStatus ?? previousPage.coverageStatus,
        fetchedAt: page.fetchedAt ?? previousPage.fetchedAt,
        hasMore: page.hasMore,
        message: zones.length
          ? `${zones.length} SafeRoute area-risk signal${zones.length === 1 ? '' : 's'} prepared.`
          : (safetyWarning || page.message || previousPage.message),
        nextCursor: page.nextCursor,
        providerStatus: page.providerStatus ?? previousPage.providerStatus,
        discardedUnsafeAreaCount,
        localCityScaleRejectedCount,
        localSpatialRejectedCount,
        partial: previousPage.partial || page.partial || discardedUnsafeAreaCount > 0,
        safetyWarning,
        seedStatus: page.seedStatus ?? previousPage.seedStatus,
        zones
      };
    }
    partial = partial || page.partial;

    if (legacyEnsure) {
      partial = partial || page.hasMore || pageOverflow;
      if (partial) {
        readError =
          'Legacy compatibility research returned only its first page; strict continuation requires the current SafeRoute API.';
      }
      break;
    }
    if (!page.hasMore || aggregate.zones.length >= viewportRequest.maxRecords) {
      partial = partial || pageOverflow
        || (page.hasMore && aggregate.zones.length >= viewportRequest.maxRecords);
      break;
    }
    if (!page.nextCursor) {
      partial = true;
      readError = 'Risk coverage did not provide a continuation cursor.';
      break;
    }
    if (seenCursors.has(page.nextCursor)) {
      partial = true;
      readError = 'Risk coverage returned a repeated page cursor.';
      break;
    }
    seenCursors.add(page.nextCursor);
    cursor = page.nextCursor;
  }

  if (!aggregate) {
    throw new ApiRequestError('No risk coverage response was received.', 0);
  }
  if (aggregate.hasMore && pagesLoaded >= MAX_AREA_RISK_PAGES) {
    partial = true;
    readError = readError ?? 'Risk coverage reached the safe page limit.';
  }

  return {
    coverageStatus: aggregate.coverageStatus,
    discardedUnsafeAreaCount: aggregate.safetyFilter.rejectedCount
      + localCityScaleRejectedCount
      + localSpatialRejectedCount,
    fetchedAt: aggregate.fetchedAt,
    legacyFallback: false,
    localCityScaleRejectedCount,
    localSpatialRejectedCount,
    message: aggregate.message,
    pagesLoaded,
    partial,
    providerStatus: aggregate.providerStatus,
    readError,
    retryableReadFailure,
    research: null,
    researchError: null,
    safetyFilter: aggregate.safetyFilter,
    safetyWarning: areaRiskSafetyWarning(
      aggregate.safetyFilter.rejectedCount
        + localCityScaleRejectedCount
        + localSpatialRejectedCount
    ),
    seedStatus: aggregate.seedStatus,
    zones: aggregate.zones
  };
}

async function readAreaRiskPage(
  viewportRequest: AreaRiskViewportRequest,
  options: AreaRiskFetchOptions,
  {
    cursor,
    legacyEnsure,
    pageNumber,
    pageSize
  }: {
    cursor: string | null;
    legacyEnsure: boolean;
    pageNumber: number;
    pageSize: number;
  }
): Promise<AreaRiskFeedPage> {
  const accessToken = String(options.accessToken ?? '').trim();
  const nonce = options.bypassCache
    ? `${Date.now().toString(36)}-${(++readNonceCounter).toString(36)}-${pageNumber}`
    : null;
  const path = buildAreaRiskViewportPath(viewportRequest, {
    authenticated: Boolean(accessToken),
    bypassCacheNonce: nonce,
    cursor,
    pageSize,
    strictRead: !legacyEnsure
  });
  const response = await performAreaRiskRequest(
    `${requireAreaRiskApiBase(options)}${path}`,
    {
      headers: buildAreaRiskRequestHeaders(accessToken),
      signal: options.signal,
      timeoutMs: options.timeoutMs
    },
    options.request
  );
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    const retryAfterSeconds = getRetryableReadUnavailableDelay(response, body);
    if (retryAfterSeconds !== null) {
      const responseError = createApiResponseError(
        response.status,
        body,
        'Risk coverage is temporarily unavailable.'
      );
      throw new AreaRiskRetryableReadError(
        responseError.message,
        retryAfterSeconds
      );
    }
    throw createApiResponseError(
      response.status,
      body,
      'Unable to load risk areas for this map view.'
    );
  }
  if (!areaRiskResponseBoundsMatchRequest(body, viewportRequest)) {
    throw new ApiRequestError(
      'Risk coverage returned bounds that do not match the requested map view.',
      502
    );
  }
  const queryBounds = areaRiskQueryBoundsForRequest(viewportRequest);
  if (viewportRequest.scope !== 'global' && !queryBounds) {
    throw new ApiRequestError(
      'Risk coverage request bounds could not be verified after serialization.',
      502
    );
  }
  const semanticAuthority = classifyAreaRiskFeedAuthority(body, {
    clientId: viewportRequest.clientId,
    legacyFallback: legacyEnsure
  });
  if (semanticAuthority.state === 'failed') {
    throw new ApiRequestError(
      semanticAuthority.error || 'Risk coverage returned incompatible authority.',
      502
    );
  }
  const page = normalizeAreaRiskFeedPage(body, queryBounds);
  page.semanticAuthority = semanticAuthority;
  page.partial = page.partial || semanticAuthority.state === 'partial';
  const providerStatus = String(page.providerStatus || '').trim().toLowerCase();
  if (
    (page.safetyFilter.present && !page.safetyFilter.valid)
    || (
      providerStatus === 'partial'
      && (!page.safetyFilter.valid || page.safetyFilter.rejectedCount <= 0)
    )
  ) {
    throw new ApiRequestError(
      'Risk coverage returned incompatible safety-filter authority.',
      502
    );
  }
  return page;
}

function aggregateRetryableReadFailure(
  failures: Array<AreaRiskRetryableReadFailure | null | undefined>
): AreaRiskRetryableReadFailure | null {
  const available = failures.filter(
    (failure): failure is AreaRiskRetryableReadFailure => Boolean(failure)
  );
  if (!available.length) {
    return null;
  }
  return {
    operation: 'read',
    retryAfterSeconds: Math.max(
      ...available.map((failure) => failure.retryAfterSeconds)
    ),
    statusCode: 503
  };
}

function getRetryableReadUnavailableDelay(
  response: Response,
  body: unknown
): number | null {
  if (response.status !== 503 || getAreaRiskFailureOperation(body) !== 'read') {
    return null;
  }
  const retryValues = [
    parseRetryAfterSeconds(response.headers.get('Retry-After')),
    getBodyRetryAfterSeconds(body)
  ].filter((value): value is number => value !== null);
  return retryValues.length ? Math.max(...retryValues) : null;
}

function getAreaRiskFailureOperation(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return '';
  }
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return '';
  }
  return String((detail as { operation?: unknown }).operation || '')
    .trim()
    .toLowerCase();
}

function getBodyRetryAfterSeconds(body: unknown): number | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null;
  }
  const detail = (body as { detail?: unknown }).detail;
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    return null;
  }
  return normalizeRetryAfterSeconds(
    (detail as { retryAfterSeconds?: unknown; retry_after_seconds?: unknown })
      .retryAfterSeconds
      ?? (detail as { retry_after_seconds?: unknown }).retry_after_seconds
  );
}

export function parseRetryAfterSeconds(
  value: string | null | undefined,
  nowMs = Date.now()
): number | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const numeric = normalizeRetryAfterSeconds(normalized);
  if (numeric !== null) {
    return numeric;
  }
  if (!/[A-Za-z]/.test(normalized)) {
    return null;
  }
  const deadlineMs = Date.parse(normalized);
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(nowMs)) {
    return null;
  }
  const retryAfterSeconds = Math.max(0, Math.ceil((deadlineMs - nowMs) / 1000));
  return retryAfterSeconds <= MAX_SUPPORTED_RETRY_AFTER_SECONDS
    ? retryAfterSeconds
    : null;
}

function normalizeRetryAfterSeconds(value: unknown): number | null {
  const numeric = typeof value === 'number'
    ? value
    : (typeof value === 'string' && /^\d+$/.test(value.trim())
      ? Number(value.trim())
      : Number.NaN);
  return Number.isSafeInteger(numeric)
    && numeric >= 0
    && numeric <= MAX_SUPPORTED_RETRY_AFTER_SECONDS
    ? numeric
    : null;
}

async function performAreaRiskRequest(
  input: Parameters<typeof fetch>[0],
  options: SafeRouteRequestOptions,
  requester?: AreaRiskHttpRequester
): Promise<Response> {
  try {
    return requester
      ? await requester(input, options)
      : await fetchWithTimeout(input, options);
  } catch (error) {
    if (
      error instanceof ApiRequestError
      || error instanceof ApiSessionExpiredError
      || error instanceof ApiAuthorizationError
    ) {
      throw error;
    }
    throw createNetworkRequestError();
  }
}

function aggregateResearchState(
  states: Array<AreaRiskResearchState | null>
): AreaRiskResearchState | null {
  const available = states.filter((state): state is AreaRiskResearchState => state !== null);
  if (!available.length) {
    return null;
  }
  const pending = available.some((state) => state.pending);
  const status = pending
    ? (available.map((state) => state.status).find((value) =>
        value === 'researching' || value === 'scheduled' || value === 'queued'
      ) ?? 'queued')
    : (available.map((state) => state.status).find(Boolean) ?? null);
  const retryValues = available
    .map((state) => state.retryAfterSeconds)
    .filter((value): value is number => value !== null);
  return {
    accepted: available.every((state) => state.accepted),
    coalesced: available.some((state) => state.coalesced),
    coverageStatus: available.map((state) => state.coverageStatus).find(Boolean) ?? null,
    pending,
    queued: available.some((state) => state.queued),
    retryAfterSeconds: retryValues.length ? Math.max(...retryValues) : null,
    seedId: available.map((state) => state.seedId).find(Boolean) ?? null,
    seedStatus: available.map((state) => state.seedStatus).find(Boolean) ?? null,
    status
  };
}

function isResearchEndpointUnavailable(status: number, body: unknown): boolean {
  if (status === 405) {
    return true;
  }
  if (status !== 404 || !body || typeof body !== 'object' || Array.isArray(body)) {
    return false;
  }
  const detail = (body as { detail?: unknown }).detail;
  return typeof detail === 'string' && detail.trim().toLowerCase() === 'not found';
}

function isAccessBoundaryError(error: unknown): boolean {
  return error instanceof ApiSessionExpiredError
    || error instanceof ApiAuthorizationError
    || (error instanceof ApiRequestError && error.statusCode === 404);
}

function describeAreaRiskError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function firstMessage(values: Array<string | null>): string | null {
  return values.find((value): value is string => Boolean(value)) ?? null;
}

function areaRiskFeedIsIncomplete(
  feed: AreaRiskFeed,
  requireTenantResearch: boolean
): boolean {
  const coverageStatus = String(feed.coverageStatus || '').trim().toLowerCase();
  const providerStatus = String(feed.providerStatus || '').trim().toLowerCase();
  const seedStatus = String(feed.seedStatus || '').trim().toLowerCase();
  if (
    feed.research?.pending
    || INCOMPLETE_AREA_RISK_STATUSES.has(coverageStatus)
    || INCOMPLETE_AREA_RISK_STATUSES.has(providerStatus)
    || INCOMPLETE_AREA_RISK_STATUSES.has(seedStatus)
  ) {
    return true;
  }
  const seedWasNotRequested = !seedStatus || seedStatus === 'not-requested';
  return requireTenantResearch && seedWasNotRequested;
}

function requireAreaRiskApiBase(options: AreaRiskFetchOptions): string {
  const apiBase = String(options.apiBase ?? '').trim().replace(/\/+$/, '');
  if (!apiBase) {
    throw new ApiRequestError('The SafeRoute API base URL is unavailable.', 0);
  }
  return apiBase;
}
