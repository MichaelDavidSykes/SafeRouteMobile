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
  normalizeSafeRoutePreviewResponse
} from './safeRouteRoadRouteProviderCore';

export type SafeRouteRoadRoutePreviewOptions = GuestRoadRoutePreviewOptions & {
  accessToken?: string | null;
  clientId?: string | null;
};

const SAFE_ROUTE_PREVIEW_TIMEOUT_MS = 8000;

export async function fetchSafeRouteRoadRoutePreview(
  options: SafeRouteRoadRoutePreviewOptions
): Promise<GuestRoadRoutePreview | null> {
  const accessToken = String(options.accessToken || '').trim();
  const clientId = String(options.clientId || '').trim();
  const avoidRectangles = options.avoidRectangles || [];

  if (accessToken && clientId) {
    const response = await apiRequest<unknown>(
      '/convoy-routes/route-preview',
      accessToken,
      {
        body: JSON.stringify(buildSafeRoutePreviewPayload({
          avoidRectangles,
          clientId,
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
    if (normalized || avoidRectangles.length) {
      return normalized;
    }
  }


  if (!accessToken || !clientId) {
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
