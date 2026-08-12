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
import { SafeRoutePreviewRequestCache } from './safeRoutePreviewRequestCache';

export type SafeRouteRoadRoutePreviewOptions = GuestRoadRoutePreviewOptions & {
  accessToken?: string | null;
  cachePolicy?: 'default' | 'network-only';
  clientId?: string | null;
};

export const SAFE_ROUTE_PREVIEW_TIMEOUT_MS = 60_000;
const safeRoutePreviewRequestCache =
  new SafeRoutePreviewRequestCache<VerifiedSafeRoutePreview | null>();
const accessTokenScopes = new Map<string, string>();
let nextAccessTokenScope = 1;

export function invalidateSafeRoutePreviewCache(): void {
  safeRoutePreviewRequestCache.clear({ abortInFlight: true });
  accessTokenScopes.clear();
  nextAccessTokenScope = 1;
}

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

  const timeoutMs = options.timeoutMs ?? SAFE_ROUTE_PREVIEW_TIMEOUT_MS;
  if (requestMode.kind === 'workspace') {
    const payload = buildSafeRoutePreviewPayload({
      clientId: requestMode.clientId,
      stops: options.stops,
      travelMode,
      preferences: options.preferences,
    });
    const cacheKey = createSafeRoutePreviewCacheKey({
      credentialScope: accessTokenScope(requestMode.accessToken),
      kind: requestMode.kind,
      payload,
      timeoutMs,
    });
    return safeRoutePreviewRequestCache.getOrLoad(cacheKey, {
      load: async (signal) => {
        const response = await apiRequest<unknown>(
          '/convoy-routes/verified-route-preview',
          requestMode.accessToken,
          {
            body: JSON.stringify(payload),
            method: 'POST',
            signal,
            timeoutMs,
          },
        );
        return normalizeSafeRoutePreviewResponse(
          response,
          options.stops,
          travelMode,
          options.preferences,
        );
      },
      shouldCache: Boolean,
      signal: options.signal,
      useCachedResult: options.cachePolicy !== 'network-only',
    });
  }

  const payload = buildPublicSafeRoutePreviewPayload({
    stops: options.stops,
    travelMode,
    preferences: options.preferences,
  });
  const cacheKey = createSafeRoutePreviewCacheKey({
    kind: requestMode.kind,
    payload,
    timeoutMs,
  });
  return safeRoutePreviewRequestCache.getOrLoad(cacheKey, {
    load: async (signal) => {
      const response = await fetchWithTimeout(
        `${LUNARCHAIN_API_BASE}/mobile/safe-route/verified-route-preview`,
        {
          body: JSON.stringify(payload),
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          method: 'POST',
          signal,
          timeoutMs,
        },
      );
      const body = await parseJsonResponse(response);
      if (!response.ok) {
        throw new ApiRequestError(
          getApiErrorMessage(body, 'Unable to prepare a verified road route.'),
          response.status,
        );
      }
      return normalizeSafeRoutePreviewResponse(
        unwrapApiEnvelope<unknown>(body),
        options.stops,
        travelMode,
        options.preferences,
      );
    },
    shouldCache: Boolean,
    signal: options.signal,
    useCachedResult: options.cachePolicy !== 'network-only',
  });
}

function createSafeRoutePreviewCacheKey({
  credentialScope = 'public',
  kind,
  payload,
  timeoutMs,
}: {
  credentialScope?: string;
  kind: 'public' | 'workspace';
  payload: unknown;
  timeoutMs: number;
}): string {
  return JSON.stringify([kind, credentialScope, timeoutMs, payload]);
}

function accessTokenScope(accessToken: string): string {
  const existing = accessTokenScopes.get(accessToken);
  if (existing) {
    accessTokenScopes.delete(accessToken);
    accessTokenScopes.set(accessToken, existing);
    return existing;
  }
  const scope = `session-${nextAccessTokenScope}`;
  nextAccessTokenScope += 1;
  accessTokenScopes.set(accessToken, scope);
  while (accessTokenScopes.size > 12) {
    const oldestToken = accessTokenScopes.keys().next().value;
    if (typeof oldestToken !== 'string') {
      break;
    }
    accessTokenScopes.delete(oldestToken);
  }
  return scope;
}
