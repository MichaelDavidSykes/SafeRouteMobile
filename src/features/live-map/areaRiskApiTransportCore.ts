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
  type AreaRiskViewportRequest,
  type AreaRiskViewportRequestOptions
} from './areaRiskApiCore';

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

let readNonceCounter = 0;
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
      fetchedAt: null,
      legacyFallback: false,
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
      research,
      researchError,
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
      fetchedAt: null,
      legacyFallback: false,
      message: 'Zoom in to load risk areas for this map view.',
      pagesLoaded: 0,
      partial: false,
      providerStatus: null,
      readError: null,
      research: null,
      researchError: null,
      seedStatus: null,
      zones: []
    };
  }

  const feeds = await Promise.all(requests.map((request) => fetchAreaRiskViewport(request, options)));
  const zones = mergeRiskZonesById(...feeds.map((feed) => feed.zones));
  const research = aggregateResearchState(feeds.map((feed) => feed.research));
  const readError = firstMessage(feeds.map((feed) => feed.readError));
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
    fetchedAt: feeds.map((feed) => feed.fetchedAt).find(Boolean) ?? null,
    legacyFallback: feeds.some((feed) => feed.legacyFallback),
    message: zones.length
      ? `${zones.length} SafeRoute area-risk signal${zones.length === 1 ? '' : 's'} prepared.`
      : (feeds.map((feed) => feed.message).find(Boolean) ?? 'No risk areas were returned.'),
    pagesLoaded: feeds.reduce((total, feed) => total + feed.pagesLoaded, 0),
    partial,
    providerStatus: feeds.map((feed) => feed.providerStatus).find(Boolean) ?? null,
    readError,
    research,
    researchError,
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
      break;
    }

    pagesLoaded += 1;
    const pageOverflow =
      (aggregate?.zones.length ?? 0) + page.zones.length > viewportRequest.maxRecords;
    if (aggregate === null) {
      aggregate = page;
    } else {
      const previousPage: AreaRiskFeedPage = aggregate;
      aggregate = {
        ...previousPage,
        coverageStatus: page.coverageStatus ?? previousPage.coverageStatus,
        fetchedAt: page.fetchedAt ?? previousPage.fetchedAt,
        hasMore: page.hasMore,
        message: page.message || previousPage.message,
        nextCursor: page.nextCursor,
        providerStatus: page.providerStatus ?? previousPage.providerStatus,
        seedStatus: page.seedStatus ?? previousPage.seedStatus,
        zones: mergeRiskZonesById(previousPage.zones, page.zones)
          .slice(0, viewportRequest.maxRecords)
      };
    }

    if (legacyEnsure) {
      partial = page.hasMore || pageOverflow;
      if (partial) {
        readError =
          'Legacy compatibility research returned only its first page; strict continuation requires the current SafeRoute API.';
      }
      break;
    }
    if (!page.hasMore || aggregate.zones.length >= viewportRequest.maxRecords) {
      partial = pageOverflow
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
    fetchedAt: aggregate.fetchedAt,
    legacyFallback: false,
    message: aggregate.message,
    pagesLoaded,
    partial,
    providerStatus: aggregate.providerStatus,
    readError,
    research: null,
    researchError: null,
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
  return normalizeAreaRiskFeedPage(body);
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
