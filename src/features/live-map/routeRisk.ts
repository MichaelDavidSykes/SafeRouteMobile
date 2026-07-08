import type { LatLng } from "react-native-maps";

import type { RiskSeverity, RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import {
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
  const polygonCoordinates = normalizeRiskPolygon(zone.polygonCoordinates);
  if (polygonCoordinates.length >= 3) {
    return calculatePolygonRiskZoneRouteProximity(routeCoordinates, zone, polygonCoordinates);
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

export function auditRouteRiskAvoidance(
  routePlan: SavedSafeRoutePlan,
  {
    minimumClearanceMeters = ROUTE_RISK_AVOIDANCE_CLEARANCE_METERS,
  }: { minimumClearanceMeters?: number } = {}
): RouteRiskAvoidanceAudit {
  const proximities = routePlan.riskZones
    .map((zone) => calculateRiskZoneRouteProximity(routePlan.route.coordinates, zone))
    .filter((proximity): proximity is RouteRiskProximity => Boolean(proximity));

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

  return proximity.areaShape === "polygon"
    ? `Route clears mapped area by ${formatDistance(proximity.clearanceMeters)}`
    : `Route clears by ${formatDistance(proximity.clearanceMeters)}`;
}

export function routeRiskStartBlockedReason(
  routePlan: SavedSafeRoutePlan
): string | null {
  const audit = auditRouteRiskAvoidance(routePlan);
  const [firstViolation] = audit.violations.sort((first, second) => {
    const severityDelta =
      severityPriority(second.zone.severity) - severityPriority(first.zone.severity);
    return severityDelta || first.clearanceMeters - second.clearanceMeters;
  });

  if (!firstViolation) {
    return null;
  }

  const zoneTitle = normalizeCopy(firstViolation.zone.title) || "a mapped risk area";
  return `Route intersects ${zoneTitle}. Re-sync route in SafeRoute planner before starting guidance.`;
}

export function resolveLiveRouteRiskAlert({
  navigationState,
  progress,
  routePlan,
}: {
  navigationState: NavigationLifecycle;
  progress: RouteProgressSnapshot | null;
  routePlan: SavedSafeRoutePlan;
}): LiveRouteRiskAlert | null {
  if (!isLiveRiskState(navigationState) || !progress) {
    return null;
  }

  const candidates = routePlan.riskZones
    .map((zone) => {
      const proximity = calculateRiskZoneRouteProximity(
        routePlan.route.coordinates,
        zone
      );
      if (!proximity) {
        return null;
      }

      const routeDistanceAheadMeters =
        proximity.routeDistanceAlongMeters - progress.travelledDistanceMeters;
      const vehicleProximity = calculateRiskZoneCoordinateProximity(
        progress.snappedCoordinate,
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

export function createLiveRouteRiskAlertPresentation(
  alert: LiveRouteRiskAlert
): LiveRouteRiskAlertPresentation {
  const zone = alert.zone;
  const title = liveRiskAlertTitle(alert.status);
  const detailLabel = liveRiskAlertDetail(alert);
  const metaLabel = [
    severityLabel(zone.severity),
    normalizeCopy(zone.category) || "Route risk",
  ].join(" · ");

  return {
    accessibilityLabel: `${title}. ${zone.title}. ${detailLabel}. ${routeRiskAvoidanceLabel(alert.proximity)}.`,
    detailLabel,
    metaLabel,
    title,
    tone: zone.severity,
  };
}

export function createRiskZoneDetailPresentation({
  proximity,
  zone,
}: {
  proximity: RouteRiskProximity | null;
  zone: RiskZone;
}): RiskZoneDetailPresentation {
  const body = normalizeCopy(zone.description) || "SafeRoute risk note";
  const areaLabel = zone.polygonCoordinates?.length
    ? "mapped area"
    : `${formatDistance(normalizeRadiusMeters(zone.radiusMeters))} radius`;
  const metaLabel = [
    severityLabel(zone.severity),
    normalizeCopy(zone.category) || "Route risk",
    areaLabel,
  ].join(" · ");
  const clearanceLabel = routeRiskAvoidanceLabel(proximity);

  return {
    accessibilityLabel: `Risk area. ${zone.title}. ${metaLabel}. ${body}. ${clearanceLabel}.`,
    body,
    clearanceLabel,
    metaLabel,
    title: normalizeCopy(zone.title) || "Route risk",
    tone: zone.severity,
  };
}

export function createRiskZoneAccessibilityLabel(
  zone: RiskZone,
  selected = false
): string {
  const prefix = selected ? "Selected risk area" : "Risk area";
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
  const alertCorridorMeters = proximity.areaShape === "polygon"
    ? LIVE_RISK_LATERAL_BUFFER_METERS
    : proximity.radiusMeters + LIVE_RISK_LATERAL_BUFFER_METERS;
  if (proximity.routeDistanceMeters > alertCorridorMeters) {
    return null;
  }

  if (vehicleInsideRiskArea) {
    return "inside";
  }

  if (
    distanceToVehicleMeters <= LIVE_RISK_ACTIVE_BUFFER_METERS
  ) {
    return "nearby";
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

function liveRiskAlertDetail(alert: LiveRouteRiskAlert): string {
  if (alert.status === "inside") {
    return alert.proximity.areaShape === "polygon"
      ? "Inside this mapped SafeRoute area"
      : "Inside this SafeRoute risk area";
  }

  if (alert.status === "nearby") {
    return `${formatDistance(alert.distanceToVehicleMeters)} from risk area`;
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

  const normalizedRoute = densifyRouteCoordinates(routeCoordinates, 25);
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

function calculateRiskZoneCoordinateProximity(
  coordinate: LatLng,
  zone: RiskZone
): { distanceMeters: number; inside: boolean } {
  const polygonCoordinates = normalizeRiskPolygon(zone.polygonCoordinates);
  if (polygonCoordinates.length >= 3) {
    const distanceMeters = distanceToPolygonMeters(coordinate, polygonCoordinates);
    return {
      distanceMeters,
      inside: distanceMeters === 0 && isCoordinateInsidePolygon(coordinate, polygonCoordinates),
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
  if (isCoordinateInsidePolygon(coordinate, polygonCoordinates)) {
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
    isCoordinateInsidePolygon(start, polygonCoordinates) ||
    isCoordinateInsidePolygon(end, polygonCoordinates)
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

  return firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation;
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

function normalizeRiskPolygon(coordinates: LatLng[] | undefined): LatLng[] {
  const polygon = (coordinates || []).filter(isValidCoordinate);
  return polygon.length >= 3 ? polygon : [];
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

function normalizeCopy(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
