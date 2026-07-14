import { LUNARCHAIN_API_BASE, SAFEROUTE_PREVIEW_MODE_ENABLED } from '../../config/env';
import {
  ApiRequestError,
  apiRequest,
  fetchWithTimeout,
  getApiErrorMessage,
  parseJsonResponse,
  unwrapApiEnvelope
} from '../api/apiClient';
import {
  fetchGuestRoadRoutePreview,
  type GuestRoadRoutePreview,
  type GuestRoadRoutePreviewOptions
} from './guestRoadRouteProvider';
import {
  buildSafeRoutePreviewPayload,
  normalizeSafeRoutePreviewResponse,
  resolveSafeRoutePreviewRequestMode
} from './safeRouteRoadRouteProviderCore';

export type SafeRouteRoadRoutePreviewOptions = GuestRoadRoutePreviewOptions & {
  accessToken?: string | null;
  clientId?: string | null;
};

const SAFE_ROUTE_PREVIEW_TIMEOUT_MS = 8000;

export async function fetchSafeRouteRoadRoutePreview(
  options: SafeRouteRoadRoutePreviewOptions
): Promise<GuestRoadRoutePreview | null> {
  const requestMode = resolveSafeRoutePreviewRequestMode(options);
  const avoidRectangles = options.avoidRectangles || [];

  if (requestMode.kind === 'invalid') {
    throw new ApiRequestError(
      'Choose an active SafeRoute workspace before planning this route.',
      400
    );
  }

  if (requestMode.kind === 'workspace') {
    const response = await apiRequest<unknown>(
      '/convoy-routes/route-preview',
      requestMode.accessToken,
      {
        body: JSON.stringify(buildSafeRoutePreviewPayload({
          avoidRectangles,
          clientId: requestMode.clientId,
          stops: options.stops
        })),
        method: 'POST',
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? SAFE_ROUTE_PREVIEW_TIMEOUT_MS
      }
    );
    const normalized = normalizeSafeRoutePreviewResponse(
      response,
      options.stops,
      avoidRectangles.length
    );
    return normalized;
  }

  if (requestMode.kind === 'public') {
    try {
      const authenticatedPayload = buildSafeRoutePreviewPayload({
        avoidRectangles,
        clientId: 'public-mobile',
        stops: options.stops
      });
      const { client_id: _clientId, ...publicPayload } = authenticatedPayload;
      const response = await fetchWithTimeout(
        `${LUNARCHAIN_API_BASE}/mobile/safe-route/route-preview`,
        {
          body: JSON.stringify(publicPayload),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          method: 'POST',
          signal: options.signal,
          timeoutMs: options.timeoutMs ?? SAFE_ROUTE_PREVIEW_TIMEOUT_MS
        }
      );
      const body = await parseJsonResponse(response);
      if (!response.ok) {
        throw new ApiRequestError(
          getApiErrorMessage(body, 'Unable to prepare a road route.'),
          response.status
        );
      }
      const normalized = normalizeSafeRoutePreviewResponse(
        unwrapApiEnvelope<unknown>(body),
        options.stops,
        avoidRectangles.length
      );
      if (normalized || avoidRectangles.length || !SAFEROUTE_PREVIEW_MODE_ENABLED) {
        return normalized;
      }
    } catch {
      if (avoidRectangles.length || !SAFEROUTE_PREVIEW_MODE_ENABLED) {
        return null;
      }
    }
  }

  return fetchGuestRoadRoutePreview({
    avoidRectangles,
    request: options.request,
    signal: options.signal,
    stops: options.stops,
    timeoutMs: options.timeoutMs
  });
}
