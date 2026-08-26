import type { LatLng } from "react-native-maps";

import type { RiskSeverity, RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import { riskZoneToAvoidRectangles } from "./areaRiskApiCore";
import type { NavigationLifecycle } from "./liveMapUiState";
import { isRouteAlertZone } from "./riskOverlayPresentation";
import {
  calculateCumulativeDistances,
  densifyRouteCoordinates,
  formatDistance,
  haversineDistanceMeters,
  projectCoordinateToRoute,
  projectCoordinateToSegment,
  type RouteProgressSnapshot,
} from "./routeProgress";

export const ROUTE_RISK_AVOIDANCE_CLEARANCE_METERS = 25;
export const LIVE_RISK_UPCOMING_DISTANCE_METERS = 4400;
export const LIVE_RISK_LATERAL_BUFFER_METERS = 420;
export const LIVE_RISK_ACTIVE_BUFFER_METERS = 380;
export const LIVE_RISK_PASSED_GRACE_METERS = 160;
export const ROUTE_ALERT_SEGMENT_MIN_HALF_LENGTH_METERS = 140;
export const ROUTE_ALERT_SEGMENT_MAX_HALF_LENGTH_METERS = 720;
export const LIVE_RISK_VISIBLE_TITLE_MAX_LENGTH = 40;
export const LIVE_RISK_VISIBLE_CATEGORY_MAX_LENGTH = 24;
export const LIVE_RISK_VISIBLE_BODY_MAX_LENGTH = 96;

export type LiveRouteRiskAlertStatus = "inside" | "nearby" | "approaching";

export interface RouteRiskProximity {
  areaShape: "circle" | "polygon";
  clearanceMeters: number;
  nearestRouteCoordinate: LatLng;
  radiusMeters: number;
  routeDistanceAlongMeters: number;
  routeDistanceMeters: number;
  zone: RiskZone;
}

export interface RouteRiskAvoidanceAudit {
  proximities: RouteRiskProximity[];
  violations: RouteRiskProximity[];
}

export interface RouteRiskSpatialEntry {
  maxLatitude: number;
  maxLongitude: number;
  minLatitude: number;
  minLongitude: number;
  proximity: RouteRiskProximity;
}

/** Route-relative risk geometry built once when a plan/viewport revision changes. */
export interface RouteRiskSpatialIndex {
  entries: RouteRiskSpatialEntry[];
  routeCoordinates: LatLng[];
}

interface RouteRiskComputationCache {
  denseRouteCoordinates?: LatLng[];
  proximityByZoneId: Map<
    string,
    {
      geometrySignature: string;
      proximity: RouteRiskProximity | null;
    }
  >;
  spatialIndex?: {
    index: RouteRiskSpatialIndex;
    riskZoneSignature: string;
  };
}

const routeRiskComputationCache = new WeakMap<
  LatLng[],
  RouteRiskComputationCache
>();

export interface LiveRouteRiskAlert {
  distanceToVehicleMeters: number;
  vehicleInsideRiskArea: boolean;
  routeDistanceAheadMeters: number;
  status: LiveRouteRiskAlertStatus;
  proximity: RouteRiskProximity;
  zone: RiskZone;
}

export interface LiveRouteRiskAlertPresentation {
  accessibilityLabel: string;
  detailLabel: string;
  metaLabel: string;
  title: string;
  tone: RiskSeverity;
  zoneTitle: string;
}

export interface RiskZoneDetailPresentation {
  accessibilityLabel: string;
  body: string;
  clearanceLabel: string;
  metaLabel: string;
  title: string;
  tone: RiskSeverity;
}

export function calculateRiskZoneRouteProximity(
  routeCoordinates: LatLng[],
  zone: RiskZone
): RouteRiskProximity | null {
  const cache = getRouteRiskComputationCache(routeCoordinates);
  const geometrySignature = riskZoneGeometrySignature(zone);
  const cached = cache.proximityByZoneId.get(zone.id);
  if (cached?.geometrySignature === geometrySignature) {
    return cached.proximity && cached.proximity.zone !== zone
      ? { ...cached.proximity, zone }
      : cached.proximity;
  }

  const proximity = calculateRiskZoneRouteProximityUncached(
    routeCoordinates,
    zone
  );
  cache.proximityByZoneId.set(zone.id, {
    geometrySignature,
    proximity,
  });
  return proximity;
}

function calculateRiskZoneRouteProximityUncached(
  routeCoordinates: LatLng[],
  zone: RiskZone
): RouteRiskProximity | null {
  const polygonCoordinates = normalizeRiskPolygon(zone.polygonCoordinates);
  if (polygonCoordinates.length >= 3) {
    return calculatePolygonRiskZoneRouteProximity(routeCoordinates, zone, polygonCoordinates);
  }

  const routeSegmentCoordinates = normalizeRiskLine(zone.routeSegmentCoordinates);
  if (routeSegmentCoordinates.length >= 2) {
    return calculateRouteSegmentRiskZoneRouteProximity(
      routeCoordinates,
      zone,
      routeSegmentCoordinates
    );
  }

  const projection = projectCoordinateToRoute(routeCoordinates, zone.coordinate);
  if (!projection) {
    return null;
  }

  const radiusMeters = normalizeRadiusMeters(zone.radiusMeters);

  return {
    areaShape: "circle",
    clearanceMeters: projection.distanceMeters - radiusMeters,
    nearestRouteCoordinate: projection.snappedCoordinate,
    radiusMeters,
    routeDistanceAlongMeters: projection.distanceAlongMeters,
    routeDistanceMeters: projection.distanceMeters,
    zone,
  };
}

export function createRouteRiskSpatialIndex(
  routeCoordinates: LatLng[],
  riskZones: RiskZone[]
): RouteRiskSpatialIndex {
  const riskZoneSignature = JSON.stringify(riskZones);
  const cache = getRouteRiskComputationCache(routeCoordinates);
  if (cache.spatialIndex?.riskZoneSignature === riskZoneSignature) {
    return cache.spatialIndex.index;
  }

  const entries = riskZones
    .map((zone): RouteRiskSpatialEntry | null => {
      const proximity = calculateRiskZoneRouteProximity(routeCoordinates, zone);
      if (!proximity) {
        return null;
      }
      const coordinates = [
        zone.coordinate,
        ...(zone.polygonCoordinates || []),
        ...(zone.routeSegmentCoordinates || []),
      ];
      const radiusPaddingLatitude = (normalizeRadiusMeters(zone.radiusMeters) + LIVE_RISK_ACTIVE_BUFFER_METERS) / 110574;
      const longitudeScale = 111320 * Math.max(0.15, Math.cos(zone.coordinate.latitude * Math.PI / 180));
      const radiusPaddingLongitude = (normalizeRadiusMeters(zone.radiusMeters) + LIVE_RISK_ACTIVE_BUFFER_METERS) / longitudeScale;
      let minLatitude = Number.POSITIVE_INFINITY;
      let maxLatitude = Number.NEGATIVE_INFINITY;
      let minLongitude = Number.POSITIVE_INFINITY;
      let maxLongitude = Number.NEGATIVE_INFINITY;
      coordinates.forEach((coordinate) => {
        minLatitude = Math.min(minLatitude, coordinate.latitude);
        maxLatitude = Math.max(maxLatitude, coordinate.latitude);
        minLongitude = Math.min(minLongitude, coordinate.longitude);
        maxLongitude = Math.max(maxLongitude, coordinate.longitude);
      });
      return {
        maxLatitude: maxLatitude + radiusPaddingLatitude,
        maxLongitude: maxLongitude + radiusPaddingLongitude,
        minLatitude: minLatitude - radiusPaddingLatitude,
        minLongitude: minLongitude - radiusPaddingLongitude,
        proximity,
      };
    })
    .filter((entry): entry is RouteRiskSpatialEntry => Boolean(entry))
    .sort((first, second) =>
      first.proximity.routeDistanceAlongMeters - second.proximity.routeDistanceAlongMeters
    );

  const index = { entries, routeCoordinates };
  cache.spatialIndex = {
    index,
    riskZoneSignature,
  };
  return index;
}

export function auditRouteRiskAvoidance(
  routePlan: SavedSafeRoutePlan,
  {
    minimumClearanceMeters = ROUTE_RISK_AVOIDANCE_CLEARANCE_METERS,
    riskIndex,
  }: {
    minimumClearanceMeters?: number;
    riskIndex?: RouteRiskSpatialIndex;
  } = {}
): RouteRiskAvoidanceAudit {
  const proximities = (
    riskIndex?.routeCoordinates === routePlan.route.coordinates
      ? riskIndex.entries.map(({ proximity }) => proximity)
      : routePlan.riskZones
          .map((zone) =>
            calculateRiskZoneRouteProximity(routePlan.route.coordinates, zone)
          )
          .filter((proximity): proximity is RouteRiskProximity => Boolean(proximity))
  ).filter(({ zone }) => shouldAuditZoneForRouteAvoidance(zone));

  return {
    proximities,
    violations: proximities.filter(
      (proximity) => proximity.clearanceMeters < minimumClearanceMeters
    ),
  };
}

export function routeRiskAvoidanceLabel(
  proximity: RouteRiskProximity | null
): string {
  if (!proximity) {
    return "Route clearance unavailable";
  }

  if (proximity.clearanceMeters < 0) {
    return proximity.areaShape === "polygon"
      ? "Route enters mapped area"
      : `Route enters area by ${formatDistance(Math.abs(proximity.clearanceMeters))}`;
  }

  if (isRouteSegmentRiskZone(proximity.zone)) {
    return proximity.routeDistanceMeters <= LIVE_RISK_LATERAL_BUFFER_METERS
      ? "Route alert on saved line"
      : `Route clears alert segment by ${formatDistance(proximity.routeDistanceMeters)}`;
  }

  return proximity.areaShape === "polygon"
    ? `Route clears mapped area by ${formatDistance(proximity.clearanceMeters)}`
    : `Route clears by ${formatDistance(proximity.clearanceMeters)}`;
}

export function routeRiskStartBlockedReason(
  routePlan: SavedSafeRoutePlan,
  riskIndex?: RouteRiskSpatialIndex
): string | null {
  const audit = auditRouteRiskAvoidance(routePlan, { riskIndex });
  const requiredStops = routePlan.checkpoints.map(({ coordinate }) => coordinate);
  const hardAvoidRiskZoneIds = new Set(
    routePlan.riskZones
      .filter((zone) => riskZoneRequiresHardAvoidance(zone, requiredStops))
      .map(({ id }) => id)
  );
  const [firstViolation] = audit.violations
    .filter((violation) => hardAvoidRiskZoneIds.has(violation.zone.id))
    .sort((first, second) => {
      const severityDelta =
        severityPriority(second.zone.severity) - severityPriority(first.zone.severity);
      return severityDelta || first.clearanceMeters - second.clearanceMeters;
    });

  if (!firstViolation) {
    return null;
  }

  const zoneTitle = normalizeRouteStartBlockedRiskTitle(firstViolation.zone.title);
  return `Route intersects ${zoneTitle}. Re-sync route in SafeRoute planner before starting guidance.`;
}

function riskZoneRequiresHardAvoidance(
  zone: RiskZone,
  requiredStops: LatLng[]
): boolean {
  const rectangles = riskZoneToAvoidRectangles(zone);
  return rectangles.length > 0 && !rectangles.some((rectangle) =>
    requiredStops.some((stop) =>
      stop.latitude >= rectangle.min_lat &&
      stop.latitude <= rectangle.max_lat &&
      stop.longitude >= rectangle.min_lon &&
      stop.longitude <= rectangle.max_lon
    )
  );
}

function normalizeRouteStartBlockedRiskTitle(title: string): string {
  const normalizedTitle = normalizeCopy(title).replace(/[.!?]+$/g, "").trim();
  return normalizedTitle || "a mapped risk area";
}

export function resolveLiveRouteRiskAlert({
  navigationState,
  progress,
  riskIndex,
  routePlan,
  vehicleCoordinate,
}: {
  navigationState: NavigationLifecycle;
  progress: RouteProgressSnapshot | null;
  riskIndex?: RouteRiskSpatialIndex | null;
  routePlan: SavedSafeRoutePlan;
  vehicleCoordinate?: LatLng | null;
}): LiveRouteRiskAlert | null {
  if (!isLiveRiskState(navigationState) || !progress) {
    return null;
  }

  const currentVehicleCoordinate = vehicleCoordinate || progress.snappedCoordinate;
  const indexedProximities = riskIndex?.routeCoordinates === routePlan.route.coordinates
    ? riskIndex.entries
    : routePlan.riskZones.map((zone) => {
        const proximity = calculateRiskZoneRouteProximity(
          routePlan.route.coordinates,
          zone
        );
        return proximity
          ? {
              maxLatitude: 90,
              maxLongitude: 180,
              minLatitude: -90,
              minLongitude: -180,
              proximity,
            }
          : null;
      }).filter((entry): entry is RouteRiskSpatialEntry => Boolean(entry));
  const candidates = indexedProximities
    .map((entry) => {
      const proximity = entry.proximity;
      const zone = proximity.zone;

      const routeDistanceAheadMeters =
        proximity.routeDistanceAlongMeters - progress.travelledDistanceMeters;
      const routeCandidate =
        routeDistanceAheadMeters >= -(proximity.radiusMeters + LIVE_RISK_PASSED_GRACE_METERS) &&
        routeDistanceAheadMeters <= LIVE_RISK_UPCOMING_DISTANCE_METERS;
      const nearbyCandidate =
        currentVehicleCoordinate.latitude >= entry.minLatitude &&
        currentVehicleCoordinate.latitude <= entry.maxLatitude &&
        currentVehicleCoordinate.longitude >= entry.minLongitude &&
        currentVehicleCoordinate.longitude <= entry.maxLongitude;
      if (!routeCandidate && !nearbyCandidate) {
        return null;
      }
      const vehicleProximity = calculateRiskZoneCoordinateProximity(
        currentVehicleCoordinate,
        zone
      );
      const status = resolveLiveRouteRiskAlertStatus({
        distanceToVehicleMeters: vehicleProximity.distanceMeters,
        proximity,
        routeDistanceAheadMeters,
        vehicleInsideRiskArea: vehicleProximity.inside,
      });

      return status
        ? {
            distanceToVehicleMeters: vehicleProximity.distanceMeters,
            proximity,
            routeDistanceAheadMeters,
            status,
            vehicleInsideRiskArea: vehicleProximity.inside,
            zone,
          }
        : null;
    })
    .filter((alert): alert is LiveRouteRiskAlert => Boolean(alert));

  if (!candidates.length) {
    return null;
  }

  return candidates.sort(compareLiveRouteRiskAlerts)[0];
}

export function buildRouteRiskAlertSegment(
  routeCoordinates: LatLng[],
  zone: RiskZone
): LatLng[] {
  const proximity = calculateRiskZoneRouteProximity(routeCoordinates, zone);
  if (!proximity) {
    return [];
  }

  const alertCorridorMeters = proximity.areaShape === "polygon"
    ? LIVE_RISK_LATERAL_BUFFER_METERS
    : proximity.radiusMeters + LIVE_RISK_LATERAL_BUFFER_METERS;
  if (proximity.routeDistanceMeters > alertCorridorMeters) {
    return [];
  }

  const route = normalizeRouteCoordinatesForAlert(routeCoordinates);
  const cumulativeDistances = calculateCumulativeDistances(route);
  const totalDistanceMeters = cumulativeDistances[cumulativeDistances.length - 1] || 0;
  if (route.length < 2 || totalDistanceMeters <= 0) {
    return [];
  }

  const halfLengthMeters = clampNumber(
    Math.max(
      ROUTE_ALERT_SEGMENT_MIN_HALF_LENGTH_METERS,
      proximity.areaShape === "polygon"
        ? LIVE_RISK_ACTIVE_BUFFER_METERS * 0.6
        : proximity.radiusMeters * 0.75
    ),
    ROUTE_ALERT_SEGMENT_MIN_HALF_LENGTH_METERS,
    ROUTE_ALERT_SEGMENT_MAX_HALF_LENGTH_METERS
  );
  const startDistanceMeters = clampNumber(
    proximity.routeDistanceAlongMeters - halfLengthMeters,
    0,
    totalDistanceMeters
  );
  const endDistanceMeters = clampNumber(
    proximity.routeDistanceAlongMeters + halfLengthMeters,
    0,
    totalDistanceMeters
  );

  return sliceRouteByDistance(
    route,
    cumulativeDistances,
    startDistanceMeters,
    endDistanceMeters
  );
}

export function resolveVisibleRiskZones({
  alertsVisible,
  liveRiskAlert,
  navigationState,
  riskZones,
}: {
  alertsVisible: boolean;
  liveRiskAlert: LiveRouteRiskAlert | null;
  navigationState: NavigationLifecycle;
  riskZones: RiskZone[];
}): RiskZone[] {
  if (alertsVisible) {
    return riskZones;
  }

  if (!isLiveRiskState(navigationState) || !liveRiskAlert) {
    return [];
  }

  return [liveRiskAlert.zone];
}

export function cullVisibleRiskZones({
  activeRiskZoneId,
  maxCount = 80,
  progress,
  riskIndex,
  riskZones,
  selectedRiskZoneId,
}: {
  activeRiskZoneId?: string | null;
  maxCount?: number;
  progress: RouteProgressSnapshot | null;
  riskIndex: RouteRiskSpatialIndex;
  riskZones: RiskZone[];
  selectedRiskZoneId?: string | null;
}): RiskZone[] {
  if (riskZones.length <= maxCount) {
    return riskZones;
  }
  const proximityById = new Map(
    riskIndex.entries.map((entry) => [entry.proximity.zone.id, entry.proximity]),
  );
  const travelledDistance = progress?.travelledDistanceMeters || 0;
  const severityScore: Record<RiskSeverity, number> = { high: 0, medium: 1, low: 2 };
  return riskZones.slice().sort((first, second) => {
    const priority = (zone: RiskZone) => {
      if (zone.id === activeRiskZoneId) return -4_000_000;
      if (zone.id === selectedRiskZoneId) return -3_000_000;
      const proximity = proximityById.get(zone.id);
      const routeDistance = proximity
        ? Math.abs(proximity.routeDistanceAlongMeters - travelledDistance)
        : 2_000_000;
      return (isRouteAlertZone(zone) ? -1_000_000 : 0) +
        severityScore[zone.severity] * 100_000 + routeDistance;
    };
    return priority(first) - priority(second);
  }).slice(0, Math.max(1, maxCount));
}

export function createLiveRouteRiskAlertPresentation(
  alert: LiveRouteRiskAlert
): LiveRouteRiskAlertPresentation {
  const zone = alert.zone;
  const routeAlert = isRouteAlertZone(zone);
  const title = routeAlert
    ? liveRouteAlertTitle(alert.status)
    : liveRiskAlertTitle(alert.status);
  const zoneTitle = normalizeRiskTitle(zone.title);
  const categoryLabel = normalizeRiskCategory(zone.category);
  const detailLabel = liveRiskAlertDetail(alert, routeAlert);
  const metaLabel = [
    severityLabel(zone.severity),
    createCompactRiskCopy(categoryLabel, LIVE_RISK_VISIBLE_CATEGORY_MAX_LENGTH),
  ].join(" · ");

  return {
    accessibilityLabel: `${title}. ${zoneTitle}. ${detailLabel}. ${routeRiskAvoidanceLabel(alert.proximity)}.`,
    detailLabel,
    metaLabel,
    title,
    tone: zone.severity,
    zoneTitle: createCompactRiskCopy(zoneTitle, LIVE_RISK_VISIBLE_TITLE_MAX_LENGTH),
  };
}

export function createRiskZoneDetailPresentation({
  proximity,
  zone,
}: {
  proximity: RouteRiskProximity | null;
  zone: RiskZone;
}): RiskZoneDetailPresentation {
  const title = normalizeRiskTitle(zone.title);
  const body = normalizeCopy(zone.description) || "SafeRoute risk note";
  const categoryLabel = normalizeRiskCategory(zone.category);
  const routeAlert = isRouteAlertZone(zone);
  const areaLabel = isRouteSegmentRiskZone(zone)
    ? "route segment"
    : zone.polygonCoordinates?.length
      ? "mapped area"
      : `${formatDistance(normalizeRadiusMeters(zone.radiusMeters))} radius`;
  const metaLabel = [
    severityLabel(zone.severity),
    createCompactRiskCopy(categoryLabel, LIVE_RISK_VISIBLE_CATEGORY_MAX_LENGTH),
    areaLabel,
  ].join(" · ");
  const accessibilityMetaLabel = [
    severityLabel(zone.severity),
    categoryLabel,
    areaLabel,
  ].join(" · ");
  const clearanceLabel = routeRiskAvoidanceLabel(proximity);

  return {
    accessibilityLabel: `${routeAlert ? "Route alert" : "Risk area"}. ${title}. ${accessibilityMetaLabel}. ${body}. ${clearanceLabel}.`,
    body: createCompactRiskCopy(body, LIVE_RISK_VISIBLE_BODY_MAX_LENGTH),
    clearanceLabel,
    metaLabel,
    title: createCompactRiskCopy(title, LIVE_RISK_VISIBLE_TITLE_MAX_LENGTH),
    tone: zone.severity,
  };
}

export function createRiskZoneAccessibilityLabel(
  zone: RiskZone,
  selected = false
): string {
  const prefix = isRouteAlertZone(zone)
    ? selected ? "Selected route alert" : "Route alert"
    : selected ? "Selected risk area" : "Risk area";
  return `${prefix}. ${normalizeCopy(zone.title) || "Route risk"}. ${severityLabel(zone.severity)}. ${normalizeCopy(zone.category) || "Route risk"}.`;
}

function resolveLiveRouteRiskAlertStatus({
  distanceToVehicleMeters,
  proximity,
  routeDistanceAheadMeters,
  vehicleInsideRiskArea,
}: {
  distanceToVehicleMeters: number;
  proximity: RouteRiskProximity;
  routeDistanceAheadMeters: number;
  vehicleInsideRiskArea: boolean;
}): LiveRouteRiskAlertStatus | null {
  if (vehicleInsideRiskArea) {
    return "inside";
  }

  if (distanceToVehicleMeters <= LIVE_RISK_ACTIVE_BUFFER_METERS) {
    return "nearby";
  }

  const alertCorridorMeters = proximity.areaShape === "polygon"
    ? LIVE_RISK_LATERAL_BUFFER_METERS
    : proximity.radiusMeters + LIVE_RISK_LATERAL_BUFFER_METERS;
  if (proximity.routeDistanceMeters > alertCorridorMeters) {
    return null;
  }

  if (
    routeDistanceAheadMeters >= -LIVE_RISK_PASSED_GRACE_METERS &&
    routeDistanceAheadMeters <= LIVE_RISK_UPCOMING_DISTANCE_METERS
  ) {
    return "approaching";
  }

  return null;
}

function compareLiveRouteRiskAlerts(
  first: LiveRouteRiskAlert,
  second: LiveRouteRiskAlert
): number {
  const priorityDelta =
    liveRiskAlertPriority(first.status) - liveRiskAlertPriority(second.status);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const firstAhead = Math.max(0, first.routeDistanceAheadMeters);
  const secondAhead = Math.max(0, second.routeDistanceAheadMeters);
  if (firstAhead !== secondAhead) {
    return firstAhead - secondAhead;
  }

  return first.distanceToVehicleMeters - second.distanceToVehicleMeters;
}

function liveRiskAlertPriority(status: LiveRouteRiskAlertStatus): number {
  switch (status) {
    case "inside":
      return 0;
    case "nearby":
      return 1;
    case "approaching":
    default:
      return 2;
  }
}

function liveRiskAlertTitle(status: LiveRouteRiskAlertStatus): string {
  switch (status) {
    case "inside":
      return "Risk area";
    case "nearby":
      return "Nearby risk";
    case "approaching":
    default:
      return "Risk ahead";
  }
}

function liveRouteAlertTitle(status: LiveRouteRiskAlertStatus): string {
  return status === "approaching" ? "Route alert ahead" : "Route alert";
}

function liveRiskAlertDetail(
  alert: LiveRouteRiskAlert,
  routeAlert = isRouteAlertZone(alert.zone)
): string {
  if (alert.status === "inside") {
    if (routeAlert) {
      return "On this SafeRoute alert segment";
    }
    return alert.proximity.areaShape === "polygon"
      ? "Inside this mapped SafeRoute area"
      : "Inside this SafeRoute risk area";
  }

  if (alert.status === "nearby") {
    return `${formatDistance(alert.distanceToVehicleMeters)} from ${
      routeAlert ? "route alert" : "risk area"
    }`;
  }

  return `${formatDistance(Math.max(0, alert.routeDistanceAheadMeters))} ahead`;
}

function isLiveRiskState(state: NavigationLifecycle): boolean {
  return state === "navigating" || state === "off-route";
}

function normalizeRadiusMeters(radiusMeters: number): number {
  return Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 0;
}

function calculatePolygonRiskZoneRouteProximity(
  routeCoordinates: LatLng[],
  zone: RiskZone,
  polygonCoordinates: LatLng[]
): RouteRiskProximity | null {
  if (!routeCoordinates.length) {
    return null;
  }

  const cache = getRouteRiskComputationCache(routeCoordinates);
  const normalizedRoute = cache.denseRouteCoordinates
    || densifyRouteCoordinates(routeCoordinates, 25);
  cache.denseRouteCoordinates = normalizedRoute;
  if (!normalizedRoute.length) {
    return null;
  }

  let best: { coordinate: LatLng; distanceMeters: number } | null = null;

  for (const coordinate of normalizedRoute) {
    const distanceMeters = distanceToPolygonMeters(coordinate, polygonCoordinates);
    if (!best || distanceMeters < best.distanceMeters) {
      best = { coordinate, distanceMeters };
    }

    if (distanceMeters === 0) {
      break;
    }
  }

  for (let index = 0; index < routeCoordinates.length - 1; index += 1) {
    if (routeSegmentIntersectsPolygon(routeCoordinates[index], routeCoordinates[index + 1], polygonCoordinates)) {
      best = { coordinate: routeCoordinates[index], distanceMeters: 0 };
      break;
    }
  }

  if (!best) {
    return null;
  }

  const projection = projectCoordinateToRoute(routeCoordinates, best.coordinate);
  if (!projection) {
    return null;
  }

  return {
    areaShape: "polygon",
    clearanceMeters: best.distanceMeters,
    nearestRouteCoordinate: projection.snappedCoordinate,
    radiusMeters: 0,
    routeDistanceAlongMeters: projection.distanceAlongMeters,
    routeDistanceMeters: best.distanceMeters,
    zone,
  };
}

function getRouteRiskComputationCache(
  routeCoordinates: LatLng[]
): RouteRiskComputationCache {
  const cached = routeRiskComputationCache.get(routeCoordinates);
  if (cached) {
    return cached;
  }
  const created: RouteRiskComputationCache = {
    proximityByZoneId: new Map(),
  };
  routeRiskComputationCache.set(routeCoordinates, created);
  return created;
}

function riskZoneGeometrySignature(zone: RiskZone): string {
  return JSON.stringify([
    zone.coordinate,
    zone.radiusMeters,
    zone.polygonCoordinates || null,
    zone.routeSegmentCoordinates || null,
  ]);
}

function calculateRouteSegmentRiskZoneRouteProximity(
  routeCoordinates: LatLng[],
  zone: RiskZone,
  routeSegmentCoordinates: LatLng[]
): RouteRiskProximity | null {
  if (!routeCoordinates.length || routeSegmentCoordinates.length < 2) {
    return null;
  }

  const normalizedRiskLine = densifyRouteCoordinates(routeSegmentCoordinates, 25);
  let best: {
    distanceMeters: number;
    projection: NonNullable<ReturnType<typeof projectCoordinateToRoute>>;
  } | null = null;

  for (const coordinate of normalizedRiskLine) {
    const projection = projectCoordinateToRoute(routeCoordinates, coordinate);
    if (!projection) {
      continue;
    }

    if (!best || projection.distanceMeters < best.distanceMeters) {
      best = { distanceMeters: projection.distanceMeters, projection };
    }
  }

  if (!best) {
    return null;
  }

  return {
    areaShape: "circle",
    clearanceMeters: best.distanceMeters,
    nearestRouteCoordinate: best.projection.snappedCoordinate,
    radiusMeters: 0,
    routeDistanceAlongMeters: best.projection.distanceAlongMeters,
    routeDistanceMeters: best.distanceMeters,
    zone,
  };
}

export function calculateRiskZoneCoordinateProximity(
  coordinate: LatLng,
  zone: RiskZone
): { distanceMeters: number; inside: boolean } {
  const polygonCoordinates = normalizeRiskPolygon(zone.polygonCoordinates);
  if (polygonCoordinates.length >= 3) {
    const distanceMeters = distanceToPolygonMeters(coordinate, polygonCoordinates);
    return {
      distanceMeters,
      inside: distanceMeters === 0 && isCoordinateInsideOrOnPolygon(coordinate, polygonCoordinates),
    };
  }

  const distanceToCenterMeters = haversineDistanceMeters(coordinate, zone.coordinate);
  const radiusMeters = normalizeRadiusMeters(zone.radiusMeters);
  return {
    distanceMeters: Math.max(0, distanceToCenterMeters - radiusMeters),
    inside: distanceToCenterMeters <= radiusMeters,
  };
}

function distanceToPolygonMeters(coordinate: LatLng, polygonCoordinates: LatLng[]): number {
  if (isCoordinateInsideOrOnPolygon(coordinate, polygonCoordinates)) {
    return 0;
  }

  let nearestDistanceMeters = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygonCoordinates.length; index += 1) {
    const start = polygonCoordinates[index];
    const end = polygonCoordinates[(index + 1) % polygonCoordinates.length];
    const projection = projectCoordinateToSegment(coordinate, start, end);
    nearestDistanceMeters = Math.min(nearestDistanceMeters, projection.distanceMeters);
  }

  return Number.isFinite(nearestDistanceMeters) ? nearestDistanceMeters : 0;
}

function routeSegmentIntersectsPolygon(
  start: LatLng,
  end: LatLng,
  polygonCoordinates: LatLng[]
): boolean {
  if (
    isCoordinateInsideOrOnPolygon(start, polygonCoordinates) ||
    isCoordinateInsideOrOnPolygon(end, polygonCoordinates)
  ) {
    return true;
  }

  for (let index = 0; index < polygonCoordinates.length; index += 1) {
    const polygonStart = polygonCoordinates[index];
    const polygonEnd = polygonCoordinates[(index + 1) % polygonCoordinates.length];
    if (segmentsIntersect(start, end, polygonStart, polygonEnd)) {
      return true;
    }
  }

  return false;
}

function isCoordinateInsideOrOnPolygon(coordinate: LatLng, polygonCoordinates: LatLng[]): boolean {
  return isCoordinateOnPolygonBoundary(coordinate, polygonCoordinates) ||
    isCoordinateInsidePolygon(coordinate, polygonCoordinates);
}

function isCoordinateOnPolygonBoundary(coordinate: LatLng, polygonCoordinates: LatLng[]): boolean {
  for (let index = 0; index < polygonCoordinates.length; index += 1) {
    const start = polygonCoordinates[index];
    const end = polygonCoordinates[(index + 1) % polygonCoordinates.length];
    const projection = projectCoordinateToSegment(coordinate, start, end);
    if (projection.distanceMeters <= 0.75 && onSegment(start, coordinate, end)) {
      return true;
    }
  }

  return false;
}

function isCoordinateInsidePolygon(coordinate: LatLng, polygonCoordinates: LatLng[]): boolean {
  let inside = false;
  for (let index = 0, previousIndex = polygonCoordinates.length - 1; index < polygonCoordinates.length; previousIndex = index, index += 1) {
    const current = polygonCoordinates[index];
    const previous = polygonCoordinates[previousIndex];
    const intersects =
      current.longitude > coordinate.longitude !== previous.longitude > coordinate.longitude &&
      coordinate.latitude <
        ((previous.latitude - current.latitude) * (coordinate.longitude - current.longitude)) /
          (previous.longitude - current.longitude) +
          current.latitude;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function segmentsIntersect(
  firstStart: LatLng,
  firstEnd: LatLng,
  secondStart: LatLng,
  secondEnd: LatLng
): boolean {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);

  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) {
    return true;
  }

  if (firstOrientation === 0 && onSegment(firstStart, secondStart, firstEnd)) {
    return true;
  }

  if (secondOrientation === 0 && onSegment(firstStart, secondEnd, firstEnd)) {
    return true;
  }

  if (thirdOrientation === 0 && onSegment(secondStart, firstStart, secondEnd)) {
    return true;
  }

  return fourthOrientation === 0 && onSegment(secondStart, firstEnd, secondEnd);
}

function orientation(first: LatLng, second: LatLng, third: LatLng): number {
  const value =
    (second.longitude - first.longitude) * (third.latitude - first.latitude) -
    (second.latitude - first.latitude) * (third.longitude - first.longitude);

  if (Math.abs(value) < 1e-12) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function onSegment(start: LatLng, coordinate: LatLng, end: LatLng): boolean {
  const epsilon = 1e-10;
  return (
    coordinate.latitude <= Math.max(start.latitude, end.latitude) + epsilon &&
    coordinate.latitude >= Math.min(start.latitude, end.latitude) - epsilon &&
    coordinate.longitude <= Math.max(start.longitude, end.longitude) + epsilon &&
    coordinate.longitude >= Math.min(start.longitude, end.longitude) - epsilon
  );
}

function sliceRouteByDistance(
  route: LatLng[],
  cumulativeDistances: number[],
  startDistanceMeters: number,
  endDistanceMeters: number
): LatLng[] {
  if (endDistanceMeters <= startDistanceMeters || route.length < 2) {
    return [];
  }

  const startCoordinate = coordinateAtDistanceAlongRoute(route, cumulativeDistances, startDistanceMeters);
  const endCoordinate = coordinateAtDistanceAlongRoute(route, cumulativeDistances, endDistanceMeters);
  if (!startCoordinate || !endCoordinate) {
    return [];
  }

  const segmentCoordinates: LatLng[] = [startCoordinate];
  for (let index = 1; index < route.length - 1; index += 1) {
    const distance = cumulativeDistances[index];
    if (distance > startDistanceMeters && distance < endDistanceMeters) {
      segmentCoordinates.push(route[index]);
    }
  }
  segmentCoordinates.push(endCoordinate);

  return dedupeNearbyCoordinates(segmentCoordinates);
}

function coordinateAtDistanceAlongRoute(
  route: LatLng[],
  cumulativeDistances: number[],
  targetDistanceMeters: number
): LatLng | null {
  if (!route.length) {
    return null;
  }

  const totalDistanceMeters = cumulativeDistances[cumulativeDistances.length - 1] || 0;
  const target = clampNumber(targetDistanceMeters, 0, totalDistanceMeters);
  if (target <= 0) {
    return route[0];
  }

  if (target >= totalDistanceMeters) {
    return route[route.length - 1];
  }

  for (let index = 1; index < route.length; index += 1) {
    const segmentStartDistance = cumulativeDistances[index - 1] || 0;
    const segmentEndDistance = cumulativeDistances[index] || segmentStartDistance;
    if (target <= segmentEndDistance) {
      const segmentLength = segmentEndDistance - segmentStartDistance;
      const ratio = segmentLength <= 0 ? 0 : (target - segmentStartDistance) / segmentLength;
      return interpolateCoordinate(route[index - 1], route[index], ratio);
    }
  }

  return route[route.length - 1];
}

function interpolateCoordinate(start: LatLng, end: LatLng, ratio: number): LatLng {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * ratio,
  };
}

function dedupeNearbyCoordinates(coordinates: LatLng[]): LatLng[] {
  const deduped: LatLng[] = [];
  for (const coordinate of coordinates) {
    const previous = deduped[deduped.length - 1];
    if (!previous || haversineDistanceMeters(previous, coordinate) > 1) {
      deduped.push(coordinate);
    }
  }

  return deduped.length > 1 ? deduped : [];
}

function normalizeRouteCoordinatesForAlert(coordinates: LatLng[]): LatLng[] {
  return coordinates.filter(isValidCoordinate);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeRiskPolygon(coordinates: LatLng[] | undefined): LatLng[] {
  const polygon = (coordinates || []).filter(isValidCoordinate);
  return polygon.length >= 3 ? polygon : [];
}

function normalizeRiskLine(coordinates: LatLng[] | undefined): LatLng[] {
  const line = (coordinates || []).filter(isValidCoordinate);
  return line.length >= 2 ? line : [];
}

function shouldAuditZoneForRouteAvoidance(zone: RiskZone): boolean {
  return !isRouteSegmentRiskZone(zone);
}

function isRouteSegmentRiskZone(zone: RiskZone): boolean {
  return normalizeRiskPolygon(zone.polygonCoordinates).length < 3 &&
    normalizeRiskLine(zone.routeSegmentCoordinates).length >= 2;
}

function isValidCoordinate(coordinate?: LatLng | null): coordinate is LatLng {
  return Boolean(
    coordinate &&
      Number.isFinite(Number(coordinate.latitude)) &&
      Number.isFinite(Number(coordinate.longitude)) &&
      coordinate.latitude >= -90 &&
      coordinate.latitude <= 90 &&
      coordinate.longitude >= -180 &&
      coordinate.longitude <= 180
  );
}

function severityPriority(severity: RiskSeverity): number {
  if (severity === "high") {
    return 3;
  }

  if (severity === "medium") {
    return 2;
  }

  return 1;
}

function severityLabel(severity: RiskSeverity): string {
  if (severity === "high") {
    return "High risk";
  }

  if (severity === "medium") {
    return "Medium risk";
  }

  return "Low risk";
}

function normalizeRiskTitle(value: string): string {
  return normalizeCopy(value) || "Route risk";
}

function normalizeRiskCategory(value: string): string {
  return normalizeCopy(value) || "Route risk";
}

function normalizeCopy(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function createCompactRiskCopy(label: string, maxLength: number): string {
  if (label.length <= maxLength) {
    return label;
  }

  return `${label.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
