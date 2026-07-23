import type { LatLng } from 'react-native-maps';

import { haversineDistanceMeters } from '../live-map/routeGeometry';
import { normalizeRouteNavigationSteps } from '../live-map/routeGuidance';
import { mapMobileRiskOverlays } from '../routes/routeMapper';
import {
  type GuestRoadRouteAlternative,
  type GuestRoadRoutePreview,
  type GuestRouteAvoidRectangle
} from './guestRoadRouteProvider';
import type { SafeRouteTravelMode } from '../live-map/liveMapTypes';
import {
  normalizeRouteAvoidRectangles,
  routeIntersectsAvoidRectangles
} from './routeAvoidanceGeometry';
import {
  hasEnabledSafeRoutePreference,
  safeRoutePreferencesMatchApiEvidence,
  toSafeRoutePreferencesApi,
  type SafeRouteRoutePreferences,
  type SafeRouteRoutePreferencesApi,
} from './routePreferences';

type SafeRouteRoutePreviewPayload = {
  avoid_rectangles?: Array<{
    label?: string | null;
    max_lat: number;
    max_lon: number;
    min_lat: number;
    min_lon: number;
  }>;
  client_id: string;
  include_alternatives: true;
  include_road_metadata: true;
  include_route_alerts: true;
  preferences?: SafeRouteRoutePreferencesApi;
  target_alternative_count: 3;
  travel_mode?: SafeRouteTravelMode;
  waypoints: Array<{
    elevation_m: null;
    lat: number;
    lon: number;
  }>;
};

export type SafeRoutePreviewRequestMode =
  | { accessToken: string; clientId: string; kind: 'workspace' }
  | { kind: 'public' }
  | { kind: 'invalid' };

const SAFE_ROUTE_STOP_MATCH_METERS = 1200;
const SAFE_ROUTE_FALLBACK_SPEED_METERS_PER_SECOND = 6.5;

export function resolveSafeRoutePreviewRequestMode({
  accessToken,
  clientId
}: {
  accessToken?: string | null;
  clientId?: string | null;
}): SafeRoutePreviewRequestMode {
  const normalizedAccessToken = String(accessToken || '').trim();
  const normalizedClientId = String(clientId || '').trim();

  if (normalizedAccessToken && normalizedClientId) {
    return {
      accessToken: normalizedAccessToken,
      clientId: normalizedClientId,
      kind: 'workspace'
    };
  }
  if (!normalizedAccessToken) {
    return { kind: 'public' };
  }
  return { kind: 'invalid' };
}

export function buildSafeRoutePreviewPayload({
  avoidRectangles,
  clientId,
  stops,
  travelMode = 'drive',
  preferences,
}: {
  avoidRectangles: GuestRouteAvoidRectangle[];
  clientId: string;
  stops: LatLng[];
  travelMode?: SafeRouteTravelMode;
  preferences?: SafeRouteRoutePreferences;
}): SafeRouteRoutePreviewPayload {
  const payload: SafeRouteRoutePreviewPayload = {
    client_id: clientId.trim(),
    include_alternatives: true,
    include_road_metadata: true,
    include_route_alerts: true,
    target_alternative_count: 3,
    waypoints: stops.map((stop) => ({
      elevation_m: null,
      lat: Number(stop.latitude.toFixed(6)),
      lon: Number(stop.longitude.toFixed(6))
    }))
  };
  if (travelMode !== 'drive') {
    payload.travel_mode = travelMode;
  }
  if (preferences && hasEnabledSafeRoutePreference(preferences)) {
    payload.preferences = toSafeRoutePreferencesApi(preferences);
  }
  const normalizedAvoidRectangles = normalizeRouteAvoidRectangles(avoidRectangles);
  if (normalizedAvoidRectangles.length) {
    payload.avoid_rectangles = normalizedAvoidRectangles.map((rectangle) => ({
      ...(rectangle.label?.trim() ? { label: rectangle.label.trim().slice(0, 140) } : {}),
      max_lat: Number(rectangle.maxLatitude.toFixed(6)),
      max_lon: Number(rectangle.maxLongitude.toFixed(6)),
      min_lat: Number(rectangle.minLatitude.toFixed(6)),
      min_lon: Number(rectangle.minLongitude.toFixed(6))
    }));
  }
  return payload;
}

export function buildPublicSafeRoutePreviewPayload({
  avoidRectangles,
  stops,
  travelMode = 'drive',
  preferences,
}: {
  avoidRectangles: GuestRouteAvoidRectangle[];
  stops: LatLng[];
  travelMode?: SafeRouteTravelMode;
  preferences?: SafeRouteRoutePreferences;
}) {
  const workspacePayload = buildSafeRoutePreviewPayload({
    avoidRectangles,
    clientId: 'public-mobile',
    stops,
    travelMode,
    preferences,
  });

  return {
    ...(workspacePayload.avoid_rectangles
      ? { avoid_rectangles: workspacePayload.avoid_rectangles }
      : {}),
    ...(workspacePayload.travel_mode
      ? { travel_mode: workspacePayload.travel_mode }
      : {}),
    ...(workspacePayload.preferences
      ? { preferences: workspacePayload.preferences }
      : {}),
    include_alternatives: true,
    target_alternative_count: 3,
    waypoints: workspacePayload.waypoints
  };
}

export function normalizeSafeRoutePreviewResponse(
  payload: unknown,
  requestedStops: LatLng[],
  requestedAvoidRectangles: readonly GuestRouteAvoidRectangle[] = [],
  requestedTravelMode: SafeRouteTravelMode = 'drive',
  requestedPreferences?: SafeRouteRoutePreferences,
): GuestRoadRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const responseTravelMode = record.travel_mode ?? record.travelMode;
  if (
    (typeof responseTravelMode === 'string' &&
      responseTravelMode !== requestedTravelMode) ||
    (requestedTravelMode !== 'drive' && responseTravelMode !== requestedTravelMode)
  ) {
    return null;
  }
  const provider = record.provider === 'tomtom' || record.provider === 'osrm'
    ? record.provider
    : null;
  if (!provider || record.snapped !== true) {
    return null;
  }
  if (
    requestedPreferences &&
    !safeRoutePreferencesMatchApiEvidence(
      requestedPreferences,
      record.route_preferences ?? record.routePreferences,
    )
  ) {
    return null;
  }

  const avoidRectangles = normalizeRouteAvoidRectangles(requestedAvoidRectangles);
  if (avoidRectangles.length) {
    const appliedAvoidAreaCount = normalizeNonNegativeNumber(
      record.avoid_area_count ?? record.avoidAreaCount
    );
    const ignoredAvoidAreaCount = normalizeNonNegativeNumber(
      record.ignored_avoid_area_count ?? record.ignoredAvoidAreaCount
    );
    const constraintsApplied = record.constraints_applied ?? record.constraintsApplied;
    const constraintsSatisfied = record.constraints_satisfied ?? record.constraintsSatisfied;
    if (
      constraintsApplied !== true ||
      constraintsSatisfied !== true ||
      appliedAvoidAreaCount !== avoidRectangles.length ||
      ignoredAvoidAreaCount !== 0
    ) {
      return null;
    }
  }

  const coordinates = normalizeProviderCoordinates(record.coordinates);
  const stops = requestedStops.filter(isValidCoordinate);
  if (
    coordinates.length < 2 ||
    stops.length < 2 ||
    !routeCoversStopsInOrder(coordinates, stops)
  ) {
    return null;
  }
  const withEndpointConnectors = preserveEndpointConnectors(coordinates, stops);
  if (routeIntersectsAvoidRectangles(withEndpointConnectors, avoidRectangles)) {
    return null;
  }
  const measuredDistance = measureRouteDistance(withEndpointConnectors);
  const distanceMeters = normalizePositiveNumber(
    record.distance_meters ?? record.distanceMeters ?? record.distance
  ) ?? measuredDistance;
  const durationSeconds = normalizePositiveNumber(
    record.duration_seconds ?? record.durationSeconds ?? record.duration
  ) ?? (distanceMeters > 0
    ? distanceMeters / SAFE_ROUTE_FALLBACK_SPEED_METERS_PER_SECOND
    : null);
  const alternatives = normalizeCompleteRouteAlternatives(
    record.alternatives,
    {
      primaryCoordinates: withEndpointConnectors,
      requestedAvoidRectangles: avoidRectangles,
      requestedStops: stops,
      requestedTravelMode,
      responseTravelMode,
      routePreferencesEvidence:
        record.route_preferences ?? record.routePreferences,
      requestedPreferences,
    },
  );

  return {
    alternatives,
    coordinates: withEndpointConnectors,
    distanceMeters,
    durationSeconds,
    provider,
    snapped: true,
    guidanceSteps: normalizeRouteNavigationSteps(
      record.guidance_steps ?? record.guidanceSteps
    ),
    routeAlerts: mapMobileRiskOverlays(
      record.route_alerts ?? record.routeAlerts
    )
  };
}

function normalizeCompleteRouteAlternatives(
  value: unknown,
  {
    primaryCoordinates,
    requestedAvoidRectangles,
    requestedStops,
    requestedTravelMode,
    responseTravelMode,
    routePreferencesEvidence,
    requestedPreferences,
  }: {
    primaryCoordinates: LatLng[];
    requestedAvoidRectangles: GuestRouteAvoidRectangle[];
    requestedStops: LatLng[];
    requestedTravelMode: SafeRouteTravelMode;
    responseTravelMode: unknown;
    routePreferencesEvidence: unknown;
    requestedPreferences?: SafeRouteRoutePreferences;
  },
): GuestRoadRouteAlternative[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const signatures = new Set([routeCoordinateSignature(primaryCoordinates)]);
  const alternatives: GuestRoadRouteAlternative[] = [];
  for (const item of value.slice(0, 3)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const explicitDistance = normalizePositiveNumber(
      record.distance_meters ?? record.distanceMeters ?? record.distance,
    );
    const explicitDuration = normalizePositiveNumber(
      record.duration_seconds ?? record.durationSeconds ?? record.duration,
    );
    const guidanceSteps = normalizeRouteNavigationSteps(
      record.guidance_steps ?? record.guidanceSteps,
    );
    if (
      explicitDistance === null ||
      explicitDuration === null ||
      !guidanceSteps.length
    ) {
      continue;
    }
    const normalized = normalizeSafeRoutePreviewResponse(
      {
        ...record,
        alternatives: undefined,
        route_preferences: routePreferencesEvidence,
        travel_mode: responseTravelMode ?? requestedTravelMode,
      },
      requestedStops,
      requestedAvoidRectangles,
      requestedTravelMode,
      requestedPreferences,
    );
    if (!normalized) {
      continue;
    }
    const signature = routeCoordinateSignature(normalized.coordinates);
    if (!signature || signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);
    alternatives.push({
      coordinates: normalized.coordinates,
      distanceMeters: explicitDistance,
      durationSeconds: explicitDuration,
      guidanceSteps,
      provider: normalized.provider,
      snapped: true,
    });
  }
  return alternatives;
}

function routeCoordinateSignature(coordinates: LatLng[]): string {
  return coordinates
    .map((coordinate) => (
      `${coordinate.latitude.toFixed(5)},${coordinate.longitude.toFixed(5)}`
    ))
    .join('|');
}

function normalizeProviderCoordinates(value: unknown): LatLng[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const coordinates: LatLng[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const coordinate = {
      latitude: Number(record.latitude ?? record.lat),
      longitude: Number(record.longitude ?? record.lon ?? record.lng)
    };
    if (!isValidCoordinate(coordinate)) {
      continue;
    }
    const rounded = {
      latitude: Number(coordinate.latitude.toFixed(6)),
      longitude: Number(coordinate.longitude.toFixed(6))
    };
    const previous = coordinates.at(-1);
    if (!previous || haversineDistanceMeters(previous, rounded) >= 1) {
      coordinates.push(rounded);
    }
  }
  return coordinates;
}

function routeCoversStopsInOrder(route: LatLng[], stops: LatLng[]): boolean {
  let minimumIndex = 0;
  for (const stop of stops) {
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestIndex = -1;
    for (let index = minimumIndex; index < route.length; index += 1) {
      const distance = haversineDistanceMeters(route[index], stop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    if (nearestIndex < 0 || nearestDistance > SAFE_ROUTE_STOP_MATCH_METERS) {
      return false;
    }
    minimumIndex = nearestIndex;
  }
  return true;
}

function preserveEndpointConnectors(route: LatLng[], stops: LatLng[]): LatLng[] {
  const coordinates = [...route];
  const origin = stops[0];
  const destination = stops.at(-1);
  if (origin && haversineDistanceMeters(origin, coordinates[0]) > 2) {
    coordinates.unshift(origin);
  }
  if (
    destination &&
    haversineDistanceMeters(destination, coordinates.at(-1) as LatLng) > 2
  ) {
    coordinates.push(destination);
  }
  return coordinates;
}

function measureRouteDistance(route: LatLng[]): number {
  return route.slice(1).reduce(
    (distance, coordinate, index) =>
      distance + haversineDistanceMeters(route[index], coordinate),
    0
  );
}

function normalizePositiveNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function isValidCoordinate(coordinate?: LatLng | null): coordinate is LatLng {
  return Boolean(
    coordinate &&
      Number.isFinite(coordinate.latitude) &&
      Number.isFinite(coordinate.longitude) &&
      coordinate.latitude >= -90 &&
      coordinate.latitude <= 90 &&
      coordinate.longitude >= -180 &&
      coordinate.longitude <= 180
  );
}
