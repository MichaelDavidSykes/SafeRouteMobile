import type { LatLng } from 'react-native-maps';

import { haversineDistanceMeters } from '../live-map/routeGeometry';
import { normalizeRouteNavigationSteps } from '../live-map/routeGuidance';
import { mapMobileRiskOverlays } from '../routes/routeMapper';
import { normalizeMobileSupportFacilities } from '../live-map/supportFacilities';
import {
  type ProvisionalSafeRoutePreview,
  type SafeRouteRiskAvoidanceProof,
  type VerifiedSafeRouteAlternative,
  type VerifiedSafeRoutePreview
} from './guestRoadRouteProvider';
import type { SafeRouteTravelMode } from '../live-map/liveMapTypes';
import {
  hasEnabledSafeRoutePreference,
  safeRoutePreferencesMatchApiEvidence,
  toSafeRoutePreferencesApi,
  type SafeRouteRoutePreferences,
  type SafeRouteRoutePreferencesApi,
} from './routePreferences';

type SafeRouteVerifiedPreviewPayload = {
  accept_provisional_risk_coverage: true;
  client_id: string;
  include_alternatives: true;
  include_road_metadata: true;
  include_route_alerts: true;
  policy_version: typeof SAFE_ROUTE_POLICY_VERSION;
  preferences?: SafeRouteRoutePreferencesApi;
  target_alternative_count: 2;
  travel_mode: SafeRouteTravelMode;
  waypoints: Array<{
    elevation_m: null;
    lat: number;
    lon: number;
  }>;
};

type PublicSafeRouteVerifiedPreviewPayload = Omit<
  SafeRouteVerifiedPreviewPayload,
  'client_id' | 'include_road_metadata'
>;

export type SafeRoutePreviewRequestMode =
  | { accessToken: string; clientId: string; kind: 'workspace' }
  | { kind: 'public' }
  | { kind: 'invalid' };

const SAFE_ROUTE_STOP_MATCH_METERS = 1200;
const SAFE_ROUTE_FALLBACK_SPEED_METERS_PER_SECOND = 6.5;
export const SAFE_ROUTE_POLICY_VERSION = 'safe-route-v1' as const;

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
  clientId,
  stops,
  travelMode = 'drive',
  preferences,
}: {
  clientId: string;
  stops: LatLng[];
  travelMode?: SafeRouteTravelMode;
  preferences?: SafeRouteRoutePreferences;
}): SafeRouteVerifiedPreviewPayload {
  const payload: SafeRouteVerifiedPreviewPayload = {
    accept_provisional_risk_coverage: true,
    client_id: clientId.trim(),
    include_alternatives: true,
    include_road_metadata: true,
    include_route_alerts: true,
    policy_version: SAFE_ROUTE_POLICY_VERSION,
    target_alternative_count: 2,
    travel_mode: travelMode,
    waypoints: stops.map((stop) => ({
      elevation_m: null,
      lat: Number(stop.latitude.toFixed(6)),
      lon: Number(stop.longitude.toFixed(6))
    }))
  };
  if (preferences && hasEnabledSafeRoutePreference(preferences)) {
    payload.preferences = toSafeRoutePreferencesApi(preferences);
  }
  return payload;
}

export function buildPublicSafeRoutePreviewPayload({
  stops,
  travelMode = 'drive',
  preferences,
}: {
  stops: LatLng[];
  travelMode?: SafeRouteTravelMode;
  preferences?: SafeRouteRoutePreferences;
}): PublicSafeRouteVerifiedPreviewPayload {
  const workspacePayload = buildSafeRoutePreviewPayload({
    clientId: 'public-mobile',
    stops,
    travelMode,
    preferences,
  });

  return {
    accept_provisional_risk_coverage: true,
    ...(workspacePayload.preferences
      ? { preferences: workspacePayload.preferences }
      : {}),
    include_alternatives: true,
    include_route_alerts: true,
    policy_version: SAFE_ROUTE_POLICY_VERSION,
    target_alternative_count: 2,
    travel_mode: workspacePayload.travel_mode,
    waypoints: workspacePayload.waypoints
  };
}

export function normalizeProvisionalSafeRoutePreviewResponse(
  payload: unknown,
  requestedStops: LatLng[],
  requestedTravelMode: SafeRouteTravelMode = 'drive',
  requestedPreferences?: SafeRouteRoutePreferences,
): ProvisionalSafeRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const responseTravelMode = record.travel_mode ?? record.travelMode;
  const provider = record.provider === 'tomtom' || record.provider === 'osrm'
    ? record.provider
    : null;
  const riskAvoidance = record.risk_avoidance ?? record.riskAvoidance;
  const riskAvoidanceRecord = riskAvoidance && typeof riskAvoidance === 'object'
    && !Array.isArray(riskAvoidance)
    ? riskAvoidance as Record<string, unknown>
    : null;
  const rawRiskAreas = record.risk_areas ?? record.riskAreas;
  if (
    record.policy_version !== SAFE_ROUTE_POLICY_VERSION
    && record.policyVersion !== SAFE_ROUTE_POLICY_VERSION
  ) {
    return null;
  }
  if (
    !provider
    || record.snapped !== true
    || !riskAvoidanceRecord
    || (riskAvoidanceRecord.policy_version ?? riskAvoidanceRecord.policyVersion)
      !== SAFE_ROUTE_POLICY_VERSION
    || riskAvoidanceRecord.status !== 'pending'
    || (riskAvoidanceRecord.coverage_status ?? riskAvoidanceRecord.coverageStatus) !== 'pending'
    || (riskAvoidanceRecord.ignored_area_count ?? riskAvoidanceRecord.ignoredAreaCount) !== 0
    || record.constraints_applied !== false
    || !Array.isArray(rawRiskAreas)
    || rawRiskAreas.length !== 0
    || (typeof responseTravelMode === 'string' && responseTravelMode !== requestedTravelMode)
    || (requestedTravelMode !== 'drive' && responseTravelMode !== requestedTravelMode)
  ) {
    return null;
  }
  if (
    requestedPreferences
    && !safeRoutePreferencesMatchApiEvidence(
      requestedPreferences,
      record.route_preferences ?? record.routePreferences,
    )
  ) {
    return null;
  }

  const coordinates = normalizeProviderCoordinates(record.coordinates);
  const stops = requestedStops.filter(isValidCoordinate);
  if (
    coordinates.length < 2
    || stops.length < 2
    || !routeCoversStopsInOrder(coordinates, stops)
  ) {
    return null;
  }
  const measuredDistance = measureRouteDistance(coordinates);
  const distanceMeters = normalizePositiveNumber(
    record.distance_meters ?? record.distanceMeters ?? record.distance,
  ) ?? measuredDistance;
  const durationSeconds = normalizePositiveNumber(
    record.duration_seconds ?? record.durationSeconds ?? record.duration,
  ) ?? (distanceMeters > 0
    ? distanceMeters / SAFE_ROUTE_FALLBACK_SPEED_METERS_PER_SECOND
    : null);

  return {
    coordinates,
    distanceMeters,
    durationSeconds,
    guidanceSteps: [],
    provider,
    riskAvoidance: {
      coverageStatus: 'pending',
      ignoredAreaCount: 0,
      policyVersion: SAFE_ROUTE_POLICY_VERSION,
      status: 'pending',
    },
    riskZones: [],
    snapped: true,
    verificationState: 'pending',
  };
}

export function normalizeSafeRoutePreviewResponse(
  payload: unknown,
  requestedStops: LatLng[],
  requestedTravelMode: SafeRouteTravelMode = 'drive',
  requestedPreferences?: SafeRouteRoutePreferences,
): VerifiedSafeRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  if (
    (record.policy_version ?? record.policyVersion) !==
    SAFE_ROUTE_POLICY_VERSION
  ) {
    return null;
  }
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
  const rawRiskAreas = record.risk_areas ?? record.riskAreas;
  const riskAvoidance = normalizeRiskAvoidanceProof(
    record.risk_avoidance ?? record.riskAvoidance,
    record,
    Array.isArray(rawRiskAreas) ? rawRiskAreas.length : 0,
  );
  if (!riskAvoidance) {
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

  const coordinates = normalizeProviderCoordinates(record.coordinates);
  const stops = requestedStops.filter(isValidCoordinate);
  if (
    coordinates.length < 2 ||
    stops.length < 2 ||
    !routeCoversStopsInOrder(coordinates, stops)
  ) {
    return null;
  }
  const measuredDistance = measureRouteDistance(coordinates);
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
      primaryCoordinates: coordinates,
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
    coordinates,
    distanceMeters,
    durationSeconds,
    provider,
    riskAvoidance,
    riskZones: mapMobileRiskOverlays(
      record.risk_areas ?? record.riskAreas
    ),
    snapped: true,
    guidanceSteps: normalizeRouteNavigationSteps(
      record.guidance_steps ?? record.guidanceSteps
    ),
    routeAlerts: mapMobileRiskOverlays(
      record.route_alerts ?? record.routeAlerts
    ),
    supportFacilities: normalizeMobileSupportFacilities(
      record.support_facilities ?? record.supportFacilities,
    ),
  };
}

function normalizeCompleteRouteAlternatives(
  value: unknown,
  {
    primaryCoordinates,
    requestedStops,
    requestedTravelMode,
    responseTravelMode,
    routePreferencesEvidence,
    requestedPreferences,
  }: {
    primaryCoordinates: LatLng[];
    requestedStops: LatLng[];
    requestedTravelMode: SafeRouteTravelMode;
    responseTravelMode: unknown;
    routePreferencesEvidence: unknown;
    requestedPreferences?: SafeRouteRoutePreferences;
  },
): VerifiedSafeRouteAlternative[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const signatures = new Set([routeCoordinateSignature(primaryCoordinates)]);
  const alternatives: VerifiedSafeRouteAlternative[] = [];
  for (const item of value.slice(0, 2)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const normalized = normalizeSafeRoutePreviewResponse(
      {
        ...record,
        alternatives: undefined,
        route_preferences: routePreferencesEvidence,
        travel_mode: responseTravelMode ?? requestedTravelMode,
      },
      requestedStops,
      requestedTravelMode,
      requestedPreferences,
    );
    if (!normalized) {
      continue;
    }
    const distanceMeters = normalized.distanceMeters;
    const durationSeconds = normalized.durationSeconds;
    if (distanceMeters === null || durationSeconds === null) {
      continue;
    }
    const signature = routeCoordinateSignature(normalized.coordinates);
    if (!signature || signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);
    alternatives.push({
      coordinates: normalized.coordinates,
      distanceMeters,
      durationSeconds,
      guidanceSteps: normalized.guidanceSteps ?? [],
      provider: normalized.provider,
      riskAvoidance: normalized.riskAvoidance,
      riskZones: normalized.riskZones,
      routeAlerts: normalized.routeAlerts ?? [],
      supportFacilities: normalized.supportFacilities,
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

function normalizeRiskAvoidanceProof(
  value: unknown,
  route: Record<string, unknown>,
  riskAreaCount: number,
): SafeRouteRiskAvoidanceProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const policyVersion = record.policy_version ?? record.policyVersion;
  const coverageStatus = record.coverage_status ?? record.coverageStatus;
  const ignoredAreaCount = record.ignored_area_count ?? record.ignoredAreaCount;
  const status = record.status;
  const crossedAreaCount = normalizeNonNegativeInteger(
    record.crossed_area_count ?? record.crossedAreaCount,
  ) ?? 0;
  const criticalCrossedAreaCount = normalizeNonNegativeInteger(
    record.critical_crossed_area_count ?? record.criticalCrossedAreaCount,
  ) ?? 0;
  const riskExposureMeters = normalizeNonNegativeNumber(
    record.risk_exposure_meters ?? record.riskExposureMeters,
  ) ?? 0;

  if (
    policyVersion !== SAFE_ROUTE_POLICY_VERSION ||
    (status !== 'verified' && status !== 'not-required' && status !== 'best-effort') ||
    (coverageStatus !== 'complete' && coverageStatus !== 'current-empty') ||
    ignoredAreaCount !== 0 ||
    criticalCrossedAreaCount > crossedAreaCount ||
    crossedAreaCount > riskAreaCount
  ) {
    return null;
  }

  const bestEffortRiskCrossing =
    route.best_effort_risk_crossing ?? route.bestEffortRiskCrossing;
  const constraintsApplied =
    route.constraints_applied ?? route.constraintsApplied;
  const constraintsSatisfied =
    route.constraints_satisfied ?? route.constraintsSatisfied;
  const routeCrossedAreaCount = normalizeNonNegativeInteger(
    route.crossed_avoid_area_count ?? route.crossedAvoidAreaCount,
  );
  const routeCriticalCrossedAreaCount = normalizeNonNegativeInteger(
    route.critical_crossed_avoid_area_count ?? route.criticalCrossedAvoidAreaCount,
  ) ?? 0;
  const routeRiskExposureMeters = normalizeNonNegativeNumber(
    route.risk_exposure_meters ?? route.riskExposureMeters,
  ) ?? 0;
  if (status === 'best-effort') {
    if (
      bestEffortRiskCrossing !== true ||
      constraintsApplied !== true ||
      constraintsSatisfied !== false ||
      crossedAreaCount <= 0 ||
      routeCrossedAreaCount !== crossedAreaCount ||
      routeCriticalCrossedAreaCount !== criticalCrossedAreaCount ||
      routeRiskExposureMeters !== riskExposureMeters
    ) {
      return null;
    }
  } else if (
    bestEffortRiskCrossing === true ||
    crossedAreaCount !== 0 ||
    criticalCrossedAreaCount !== 0 ||
    riskExposureMeters !== 0
  ) {
    return null;
  }

  return {
    coverageStatus,
    criticalCrossedAreaCount,
    crossedAreaCount,
    ignoredAreaCount,
    policyVersion,
    riskExposureMeters,
    status,
  };
}

function normalizeNonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function normalizeNonNegativeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function normalizeProviderCoordinates(value: unknown): LatLng[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const coordinates: LatLng[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    const latitude = record.latitude ?? record.lat;
    const longitude = record.longitude ?? record.lon ?? record.lng;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return [];
    }
    const coordinate = {
      latitude,
      longitude,
    };
    if (!isValidCoordinate(coordinate)) {
      return [];
    }
    coordinates.push(coordinate);
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
