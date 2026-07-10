import type { SavedSafeRoutePlan } from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import { haversineDistanceMeters } from "./routeGeometry";
import {
  isReliableLocationSampleRecent,
  normalizeReliableLocationSample,
  type ReliableLocationSample,
} from "./locationSignal";

export const ACTIVE_NAVIGATION_SESSION_VERSION = 1;
export const ACTIVE_NAVIGATION_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const ACTIVE_NAVIGATION_SESSION_MAX_PAYLOAD_BYTES = 2_000_000;
const ACTIVE_NAVIGATION_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_ROUTE_COORDINATES = 20_000;
const MAX_RISK_ZONES = 5_000;
const MAX_CHECKPOINTS = 100;

export type PersistedNavigationLifecycle = Extract<
  NavigationLifecycle,
  "navigating" | "off-route" | "paused"
>;

export interface ActiveNavigationSession {
  backgroundTrackingEnabled: boolean;
  followModeEnabled: boolean;
  lastLocation: ReliableLocationSample | null;
  navigationState: PersistedNavigationLifecycle;
  progressFloorMeters: number;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  savedAtMs: number;
  version: typeof ACTIVE_NAVIGATION_SESSION_VERSION;
}

export interface CreateActiveNavigationSessionOptions {
  backgroundTrackingEnabled?: boolean;
  followModeEnabled: boolean;
  lastLocation?: ReliableLocationSample | null;
  navigationState: PersistedNavigationLifecycle;
  progressFloorMeters: number;
  routeContext: "guest" | "saved";
  routePlan: SavedSafeRoutePlan;
  savedAtMs?: number;
}

export function isPersistedNavigationLifecycle(
  value: NavigationLifecycle,
): value is PersistedNavigationLifecycle {
  return (
    value === "navigating" || value === "off-route" || value === "paused"
  );
}

export function createActiveNavigationSession({
  backgroundTrackingEnabled = false,
  followModeEnabled,
  lastLocation = null,
  navigationState,
  progressFloorMeters,
  routeContext,
  routePlan,
  savedAtMs = Date.now(),
}: CreateActiveNavigationSessionOptions): ActiveNavigationSession {
  return {
    backgroundTrackingEnabled,
    followModeEnabled,
    lastLocation: lastLocation ? { ...lastLocation } : null,
    navigationState,
    progressFloorMeters: normalizeProgressFloorForRoute(
      progressFloorMeters,
      routePlan,
    ),
    routeContext,
    routePlan,
    savedAtMs,
    version: ACTIVE_NAVIGATION_SESSION_VERSION,
  };
}

export function serializeActiveNavigationSession(
  session: ActiveNavigationSession,
): string | null {
  try {
    const serialized = JSON.stringify(session);
    return utf8ByteLength(serialized) <= ACTIVE_NAVIGATION_SESSION_MAX_PAYLOAD_BYTES
      ? serialized
      : null;
  } catch {
    return null;
  }
}

export function normalizeActiveNavigationSession(
  value: unknown,
  nowMs = Date.now(),
): ActiveNavigationSession | null {
  const parsed = parseActiveNavigationSessionValue(value);
  if (!isRecord(parsed) || parsed.version !== ACTIVE_NAVIGATION_SESSION_VERSION) {
    return null;
  }

  const savedAtMs = Number(parsed.savedAtMs);
  if (
    !Number.isFinite(savedAtMs) ||
    savedAtMs <= 0 ||
    savedAtMs > nowMs + ACTIVE_NAVIGATION_FUTURE_TOLERANCE_MS ||
    nowMs - savedAtMs > ACTIVE_NAVIGATION_SESSION_MAX_AGE_MS
  ) {
    return null;
  }

  const navigationState = parsed.navigationState;
  if (
    navigationState !== "navigating" &&
    navigationState !== "off-route" &&
    navigationState !== "paused"
  ) {
    return null;
  }

  const routeContext = parsed.routeContext;
  if (routeContext !== "guest" && routeContext !== "saved") {
    return null;
  }

  const routePlan = normalizeStoredRoutePlan(parsed.routePlan);
  if (!routePlan) {
    return null;
  }

  const lastLocation =
    parsed.lastLocation === null || parsed.lastLocation === undefined
      ? null
      : normalizeReliableLocationSample(parsed.lastLocation);
  if (parsed.lastLocation && !lastLocation) {
    return null;
  }
  const recentLastLocation = isReliableLocationSampleRecent(lastLocation, nowMs)
    ? lastLocation
    : null;

  return {
    backgroundTrackingEnabled: parsed.backgroundTrackingEnabled === true,
    followModeEnabled: parsed.followModeEnabled !== false,
    lastLocation: recentLastLocation,
    navigationState,
    progressFloorMeters: normalizeProgressFloorForRoute(
      parsed.progressFloorMeters,
      routePlan,
    ),
    routeContext,
    routePlan,
    savedAtMs,
    version: ACTIVE_NAVIGATION_SESSION_VERSION,
  };
}

export function canResumeActiveNavigationSession(
  session: ActiveNavigationSession,
  authenticated: boolean,
): boolean {
  return session.routeContext === "guest" || authenticated;
}

export function mergeActiveNavigationLocation(
  session: ActiveNavigationSession,
  location: ReliableLocationSample | null,
): ActiveNavigationSession {
  if (
    !location ||
    (session.lastLocation &&
      location.timestampMs <= session.lastLocation.timestampMs)
  ) {
    return session;
  }

  return {
    ...session,
    lastLocation: { ...location },
    savedAtMs: Math.max(session.savedAtMs, location.timestampMs),
  };
}

function parseActiveNavigationSessionValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  if (
    value.length === 0 ||
    utf8ByteLength(value) > ACTIVE_NAVIGATION_SESSION_MAX_PAYLOAD_BYTES
  ) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeStoredRoutePlan(value: unknown): SavedSafeRoutePlan | null {
  if (!isRecord(value) || !hasRequiredRoutePlanStrings(value)) {
    return null;
  }

  if (!isStoredRegion(value.region) || !isRecord(value.route)) {
    return null;
  }

  const route = value.route;
  const routeCoordinates = route.coordinates;
  if (
    !hasRequiredRouteStrings(route) ||
    !isFiniteNumber(route.safeScore) ||
    Number(route.safeScore) < 0 ||
    Number(route.safeScore) > 100 ||
    (route.tone !== "safe" && route.tone !== "amber" && route.tone !== "blue") ||
    !isStoredCoordinateArray(routeCoordinates, 2, MAX_ROUTE_COORDINATES) ||
    calculatePolylineDistanceMeters(routeCoordinates) < 1 ||
    (route.navigationSteps !== undefined &&
      !isStoredNavigationSteps(
        route.navigationSteps,
        calculatePolylineDistanceMeters(routeCoordinates),
      ))
  ) {
    return null;
  }

  if (
    (value.clientId !== undefined && typeof value.clientId !== "string") ||
    !Array.isArray(value.riskZones) ||
    value.riskZones.length > MAX_RISK_ZONES ||
    !value.riskZones.every(isStoredRiskZone) ||
    !Array.isArray(value.checkpoints) ||
    value.checkpoints.length > MAX_CHECKPOINTS ||
    !value.checkpoints.every(isStoredCheckpoint)
  ) {
    return null;
  }

  if (
    value.status !== "ready" &&
    value.status !== "in-progress" &&
    value.status !== "planned"
  ) {
    return null;
  }

  return value as unknown as SavedSafeRoutePlan;
}

function hasRequiredRoutePlanStrings(value: Record<string, unknown>): boolean {
  return [
    "id",
    "name",
    "operation",
    "convoyCallsign",
    "updatedAtLabel",
    "origin",
    "destination",
  ].every((key) => typeof value[key] === "string");
}

function hasRequiredRouteStrings(value: Record<string, unknown>): boolean {
  return [
    "id",
    "label",
    "eta",
    "distance",
    "riskLabel",
    "tone",
    "color",
    "mutedColor",
    "description",
    "nextInstruction",
    "nextDistance",
  ].every((key) => typeof value[key] === "string");
}

function isStoredRegion(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isStoredCoordinate(value) &&
    isFiniteNumber(value.latitudeDelta) &&
    Number(value.latitudeDelta) > 0 &&
    isFiniteNumber(value.longitudeDelta) &&
    Number(value.longitudeDelta) > 0
  );
}

function isStoredCoordinate(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function isStoredCoordinateArray(
  value: unknown,
  minimumLength: number,
  maximumLength = MAX_ROUTE_COORDINATES,
): boolean {
  return (
    Array.isArray(value) &&
    value.length >= minimumLength &&
    value.length <= maximumLength &&
    value.every(isStoredCoordinate)
  );
}

function isStoredCheckpoint(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.caption === "string" &&
    (value.kind === "origin" ||
      value.kind === "waypoint" ||
      value.kind === "destination") &&
    isStoredCoordinate(value.coordinate)
  );
}

function isStoredRiskZone(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.description === "string" &&
    typeof value.category === "string" &&
    (value.severity === "low" ||
      value.severity === "medium" ||
      value.severity === "high") &&
    isStoredCoordinate(value.coordinate) &&
    isFiniteNumber(value.radiusMeters) &&
    Number(value.radiusMeters) >= 0 &&
    typeof value.markerColor === "string" &&
    typeof value.strokeColor === "string" &&
    typeof value.fillColor === "string" &&
    isOptionalCoordinateArray(value.routeSegmentCoordinates, 2) &&
    isOptionalCoordinateArray(value.connectorCoordinates, 2) &&
    isOptionalCoordinateArray(value.polygonCoordinates, 3)
  );
}

function isStoredNavigationSteps(
  value: unknown,
  routeDistanceMeters: number,
): boolean {
  if (!Array.isArray(value) || value.length > MAX_ROUTE_COORDINATES) {
    return false;
  }

  let previousDistanceAlongMeters = -1;
  return value.every((step) => {
    if (!isRecord(step)) {
      return false;
    }

    const distanceAlongMeters = Number(step.distanceAlongMeters);
    const valid =
      typeof step.id === "string" &&
      typeof step.instruction === "string" &&
      typeof step.maneuverType === "string" &&
      isOptionalNullableString(step.modifier) &&
      isOptionalNullableString(step.roadName) &&
      Number.isFinite(distanceAlongMeters) &&
      distanceAlongMeters >= previousDistanceAlongMeters &&
      distanceAlongMeters <= routeDistanceMeters + 1_000 &&
      isOptionalNullableNonNegativeNumber(step.distanceMeters) &&
      isOptionalNullableNonNegativeNumber(step.durationSeconds) &&
      isStoredCoordinate(step.coordinate);
    previousDistanceAlongMeters = distanceAlongMeters;
    return valid;
  });
}

function isOptionalCoordinateArray(
  value: unknown,
  minimumLength: number,
): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) && value.length === 0) ||
    isStoredCoordinateArray(value, minimumLength, MAX_ROUTE_COORDINATES)
  );
}

function normalizeProgressFloor(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function normalizeProgressFloorForRoute(
  value: unknown,
  routePlan: SavedSafeRoutePlan,
): number {
  const normalized = normalizeProgressFloor(value);
  const routeDistanceMeters = calculatePolylineDistanceMeters(
    routePlan.route.coordinates,
  );
  return Math.min(normalized, routeDistanceMeters);
}

function calculatePolylineDistanceMeters(value: unknown): number {
  if (!Array.isArray(value) || value.length < 2) {
    return 0;
  }

  let totalDistanceMeters = 0;
  for (let index = 1; index < value.length; index += 1) {
    const previous = value[index - 1];
    const current = value[index];
    if (!isStoredCoordinate(previous) || !isStoredCoordinate(current)) {
      return 0;
    }
    totalDistanceMeters += haversineDistanceMeters(previous, current);
  }
  return Number.isFinite(totalDistanceMeters) ? totalDistanceMeters : 0;
}

function isOptionalNullableString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function isOptionalNullableNonNegativeNumber(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (isFiniteNumber(value) && Number(value) >= 0)
  );
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) || 0;
    byteLength +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return byteLength;
}

function isFiniteNumber(value: unknown): boolean {
  return Number.isFinite(Number(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
