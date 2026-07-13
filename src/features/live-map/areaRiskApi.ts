import { LUNARCHAIN_API_BASE } from '../../config/env';
import {
  ApiAuthorizationError,
  ApiRequestError,
  ApiSessionExpiredError,
  createNetworkRequestError,
  fetchWithTimeout,
  getApiAuthorizationMessage,
  getApiErrorMessage,
  getApiSessionExpiredMessage,
  type SafeRouteRequestOptions
} from '../api/apiClientCore';
import {
  buildAreaRiskRequestHeaders,
  buildAreaRiskViewportPath,
  mergeRiskZonesById,
  normalizeAreaRiskFeed,
  regionToAreaRiskViewportRequests,
  type AreaRiskFeed,
  type AreaRiskViewportRequest,
  type AreaRiskViewportRequestOptions
} from './areaRiskApiCore';
import type { Region } from 'react-native-maps';

export type AreaRiskHttpRequester = (
  input: Parameters<typeof fetch>[0],
  init?: RequestInit
) => Promise<Response>;

export interface AreaRiskFetchOptions {
  accessToken?: string | null;
  request?: AreaRiskHttpRequester;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface AreaRiskRegionFetchOptions
  extends AreaRiskFetchOptions,
    AreaRiskViewportRequestOptions {}

export async function fetchAreaRiskViewport(
  viewportRequest: AreaRiskViewportRequest,
  options: AreaRiskFetchOptions = {}
): Promise<AreaRiskFeed> {
  const accessToken = String(options.accessToken ?? '').trim();
  const path = buildAreaRiskViewportPath(viewportRequest, {
    authenticated: Boolean(accessToken)
  });
  const headers = buildAreaRiskRequestHeaders(accessToken);

  let response: Response;
  try {
    response = options.request
      ? await options.request(`${LUNARCHAIN_API_BASE}${path}`, {
          headers,
          signal: options.signal
        })
      : await fetchWithTimeout(`${LUNARCHAIN_API_BASE}${path}`, {
          headers,
          signal: options.signal,
          timeoutMs: options.timeoutMs
        } satisfies SafeRouteRequestOptions);
  } catch {
    throw createNetworkRequestError();
  }

  const body = await parseJsonResponse(response);
  if (response.status === 401) {
    throw new ApiSessionExpiredError(getApiSessionExpiredMessage(body));
  }
  if (response.status === 403) {
    throw new ApiAuthorizationError(getApiAuthorizationMessage(body));
  }
  if (!response.ok) {
    throw new ApiRequestError(
      getApiErrorMessage(body, 'Unable to load risk areas for this map view.'),
      response.status
    );
  }
  return normalizeAreaRiskFeed(body);
}

export async function fetchAreaRiskForRegion(
  region: Region,
  options: AreaRiskRegionFetchOptions = {}
): Promise<AreaRiskFeed> {
  const requests = regionToAreaRiskViewportRequests(region, options);
  if (!requests.length) {
    return {
      fetchedAt: null,
      message: 'Zoom in to load risk areas for this map view.',
      providerStatus: null,
      zones: []
    };
  }

  const feeds = await Promise.all(requests.map((request) => fetchAreaRiskViewport(request, options)));
  const zones = mergeRiskZonesById(...feeds.map((feed) => feed.zones));
  return {
    fetchedAt: feeds.map((feed) => feed.fetchedAt).find(Boolean) ?? null,
    message: zones.length
      ? `${zones.length} SafeRoute area-risk signal${zones.length === 1 ? '' : 's'} prepared.`
      : (feeds.map((feed) => feed.message).find(Boolean) ?? 'No risk areas were returned.'),
    providerStatus: feeds.map((feed) => feed.providerStatus).find(Boolean) ?? null,
    zones
  };
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
