import { LUNARCHAIN_API_BASE } from '../../config/env';
import {
  ApiRequestError,
  apiRequest,
  fetchWithTimeout,
  getApiErrorMessage,
  parseJsonResponse,
  unwrapApiEnvelope
} from '../api/apiClient';
import type {
  GuestRoadRoutePreviewOptions,
  VerifiedSafeRoutePreview
} from './guestRoadRouteProvider';
import {
  buildPublicSafeRoutePreviewPayload,
  buildSafeRoutePreviewPayload,
  normalizeSafeRoutePreviewResponse,
  resolveSafeRoutePreviewRequestMode
} from './safeRouteRoadRouteProviderCore';

export type SafeRouteRoadRoutePreviewOptions = GuestRoadRoutePreviewOptions & {
  accessToken?: string | null;
  clientId?: string | null;
};

export const SAFE_ROUTE_PREVIEW_TIMEOUT_MS = 60_000;

export async function fetchSafeRouteRoadRoutePreview(
  options: SafeRouteRoadRoutePreviewOptions
): Promise<VerifiedSafeRoutePreview | null> {
  const travelMode = options.travelMode ?? 'drive';
  if (travelMode === 'transit') {
    throw new ApiRequestError(
      'Verified transit routing is not supported by the configured route provider.',
      400
    );
  }
  const requestMode = resolveSafeRoutePreviewRequestMode(options);

  if (requestMode.kind === 'invalid') {
    throw new ApiRequestError(
      'Choose an active SafeRoute workspace before planning this route.',
      400
    );
  }

  if (requestMode.kind === 'workspace') {
    const response = await apiRequest<unknown>(
      '/convoy-routes/verified-route-preview',
      requestMode.accessToken,
      {
        body: JSON.stringify(buildSafeRoutePreviewPayload({
          clientId: requestMode.clientId,
          stops: options.stops,
          travelMode,
          preferences: options.preferences,
        })),
        method: 'POST',
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? SAFE_ROUTE_PREVIEW_TIMEOUT_MS
      }
    );
    return normalizeSafeRoutePreviewResponse(
      response,
      options.stops,
      travelMode,
      options.preferences,
    );
  }

  const response = await fetchWithTimeout(
    `${LUNARCHAIN_API_BASE}/mobile/safe-route/verified-route-preview`,
    {
      body: JSON.stringify(buildPublicSafeRoutePreviewPayload({
        stops: options.stops,
        travelMode,
        preferences: options.preferences,
      })),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      method: 'POST',
      signal: options.signal,
      timeoutMs: options.timeoutMs ?? SAFE_ROUTE_PREVIEW_TIMEOUT_MS
    }
  );
  const body = await parseJsonResponse(response);
  if (!response.ok) {
    throw new ApiRequestError(
      getApiErrorMessage(body, 'Unable to prepare a verified road route.'),
      response.status
    );
  }
  return normalizeSafeRoutePreviewResponse(
    unwrapApiEnvelope<unknown>(body),
    options.stops,
    travelMode,
    options.preferences,
  );
}
