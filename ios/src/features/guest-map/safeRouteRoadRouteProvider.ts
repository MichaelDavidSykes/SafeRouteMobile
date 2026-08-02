import { LUNARCHAIN_API_BASE } from '../../config/env';
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
  type GuestRoadRouteAlternative,
  type GuestRoadRoutePreview,
  type GuestRoadRoutePreviewOptions
} from './guestRoadRouteProvider';
import {
  buildSafeRoutePreviewPayload,
  buildPublicSafeRoutePreviewPayload,
  normalizeSafeRoutePreviewResponse,
  resolveSafeRoutePreviewRequestMode
} from './safeRouteRoadRouteProviderCore';
import { normalizeRouteAvoidRectangles } from './routeAvoidanceGeometry';
import { hasEnabledSafeRoutePreference } from './routePreferences';

export type SafeRouteRoadRoutePreviewOptions = GuestRoadRoutePreviewOptions & {
  accessToken?: string | null;
  clientId?: string | null;
};

const SAFE_ROUTE_PREVIEW_TIMEOUT_MS = 8000;
const SAFE_ROUTE_TARGET_ALTERNATIVE_COUNT = 2;

export async function fetchSafeRouteRoadRoutePreview(
  options: SafeRouteRoadRoutePreviewOptions
): Promise<GuestRoadRoutePreview | null> {
  const travelMode = options.travelMode ?? 'drive';
  const requestMode = travelMode === 'drive'
    ? resolveSafeRoutePreviewRequestMode(options)
    : { kind: 'public' as const };
  const avoidRectangles = normalizeRouteAvoidRectangles(options.avoidRectangles || []);
  const preferencesRequested = Boolean(
    options.preferences && hasEnabledSafeRoutePreference(options.preferences)
  );

  if (requestMode.kind === 'invalid') {
    throw new ApiRequestError(
      'Choose an active SafeRoute workspace before planning this route.',
      400
    );
  }

  const profileFallbackPromise = preferencesRequested
    ? null
    : fetchGuestRoadRoutePreview({
        avoidRectangles,
        request: options.request,
        signal: options.signal,
        stops: options.stops,
        timeoutMs: options.timeoutMs,
        travelMode,
      });

  if (requestMode.kind === 'workspace') {
    const response = await apiRequest<unknown>(
      '/convoy-routes/route-preview',
      requestMode.accessToken,
      {
        body: JSON.stringify(buildSafeRoutePreviewPayload({
          avoidRectangles,
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
    const normalized = normalizeSafeRoutePreviewResponse(
      response,
      options.stops,
      avoidRectangles,
      travelMode,
      options.preferences,
    );
    if (!normalized) {
      return profileFallbackPromise;
    }
    return completeSafeRouteAlternatives(
      normalized,
      awaitProfileFallbackWhenNeeded(normalized, profileFallbackPromise),
    );
  }

  if (requestMode.kind === 'public') {
    const fetchPublicPreview = async () => {
      const publicPayload = buildPublicSafeRoutePreviewPayload({
        avoidRectangles,
        stops: options.stops,
        travelMode,
        preferences: options.preferences,
      });
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
        avoidRectangles,
        travelMode,
        options.preferences,
      );
      return normalized;
    };

    try {
      const normalized = await fetchPublicPreview();
      if (normalized) {
        return completeSafeRouteAlternatives(
          normalized,
          awaitProfileFallbackWhenNeeded(normalized, profileFallbackPromise),
        );
      }
    } catch {}

    return profileFallbackPromise;
  }

  return profileFallbackPromise;
}

async function awaitProfileFallbackWhenNeeded(
  primary: GuestRoadRoutePreview,
  fallbackPromise: Promise<GuestRoadRoutePreview | null> | null,
): Promise<GuestRoadRoutePreview | null> {
  if (
    !fallbackPromise ||
    (primary.alternatives?.length ?? 0) >=
      SAFE_ROUTE_TARGET_ALTERNATIVE_COUNT
  ) {
    return null;
  }
  return fallbackPromise;
}

function completeSafeRouteAlternatives(
  primary: GuestRoadRoutePreview,
  supplementPromise: Promise<GuestRoadRoutePreview | null>,
): Promise<GuestRoadRoutePreview>;
function completeSafeRouteAlternatives(
  primary: GuestRoadRoutePreview,
  supplement: GuestRoadRoutePreview | null,
): GuestRoadRoutePreview;
function completeSafeRouteAlternatives(
  primary: GuestRoadRoutePreview,
  supplement:
    | GuestRoadRoutePreview
    | null
    | Promise<GuestRoadRoutePreview | null>,
): GuestRoadRoutePreview | Promise<GuestRoadRoutePreview> {
  if (supplement instanceof Promise) {
    return supplement.then((resolved) =>
      completeSafeRouteAlternatives(primary, resolved),
    );
  }
  if (
    !supplement ||
    (primary.alternatives?.length ?? 0) >=
      SAFE_ROUTE_TARGET_ALTERNATIVE_COUNT
  ) {
    return primary;
  }

  const seen = new Set([safeRouteGeometrySignature(primary.coordinates)]);
  const alternatives: GuestRoadRouteAlternative[] = [];
  const candidates = [
    ...(primary.alternatives || []),
    toSafeRouteAlternative(supplement),
    ...(supplement.alternatives || []),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const signature = safeRouteGeometrySignature(candidate.coordinates);
    if (!signature || seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    alternatives.push(candidate);
    if (alternatives.length >= SAFE_ROUTE_TARGET_ALTERNATIVE_COUNT) {
      break;
    }
  }

  return {
    ...primary,
    alternatives,
  };
}

function toSafeRouteAlternative(
  preview: GuestRoadRoutePreview,
): GuestRoadRouteAlternative | null {
  if (
    preview.distanceMeters === null ||
    preview.durationSeconds === null
  ) {
    return null;
  }
  return {
    coordinates: preview.coordinates,
    distanceMeters: preview.distanceMeters,
    durationSeconds: preview.durationSeconds,
    guidanceSteps: preview.guidanceSteps || [],
    provider: preview.provider,
    snapped: true,
  };
}

function safeRouteGeometrySignature(
  coordinates: GuestRoadRoutePreview['coordinates'],
): string {
  if (coordinates.length < 2) {
    return '';
  }
  const sampleCount = Math.min(24, coordinates.length);
  return Array.from({ length: sampleCount }, (_, index) => {
    const coordinateIndex = Math.round(
      index * (coordinates.length - 1) / Math.max(1, sampleCount - 1),
    );
    const coordinate = coordinates[coordinateIndex];
    return `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`;
  }).join('|');
}
