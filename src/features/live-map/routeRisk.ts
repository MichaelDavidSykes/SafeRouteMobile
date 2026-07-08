import type { LatLng } from "react-native-maps";

import type { RiskSeverity, RiskZone, SavedSafeRoutePlan } from "./liveMapTypes";
import type { NavigationLifecycle } from "./liveMapUiState";
import {
  formatDistance,
  haversineDistanceMeters,
  projectCoordinateToRoute,
  type RouteProgressSnapshot,
} from "./routeProgress";

export const ROUTE_RISK_AVOIDANCE_CLEARANCE_METERS = 25;
export const LIVE_RISK_UPCOMING_DISTANCE_METERS = 4400;
export const LIVE_RISK_LATERAL_BUFFER_METERS = 420;
export const LIVE_RISK_ACTIVE_BUFFER_METERS = 380;
export const LIVE_RISK_PASSED_GRACE_METERS = 160;

export type LiveRouteRiskAlertStatus = "inside" | "nearby" | "approaching";

export interface RouteRiskProximity {
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
  const projection = projectCoordinateToRoute(routeCoordinates, zone.coordinate);
  if (!projection) {
    return null;
  }

  const radiusMeters = normalizeRadiusMeters(zone.radiusMeters);

  return {
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
    return `Route enters area by ${formatDistance(Math.abs(proximity.clearanceMeters))}`;
  }

  return `Route clears by ${formatDistance(proximity.clearanceMeters)}`;
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
      const distanceToVehicleMeters = haversineDistanceMeters(
        progress.snappedCoordinate,
        zone.coordinate
      );
      const status = resolveLiveRouteRiskAlertStatus({
        distanceToVehicleMeters,
        proximity,
        routeDistanceAheadMeters,
      });

      return status
        ? {
            distanceToVehicleMeters,
            proximity,
            routeDistanceAheadMeters,
            status,
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
  const metaLabel = [
    severityLabel(zone.severity),
    normalizeCopy(zone.category) || "Route risk",
    `${formatDistance(normalizeRadiusMeters(zone.radiusMeters))} radius`,
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
}: {
  distanceToVehicleMeters: number;
  proximity: RouteRiskProximity;
  routeDistanceAheadMeters: number;
}): LiveRouteRiskAlertStatus | null {
  const alertCorridorMeters =
    proximity.radiusMeters + LIVE_RISK_LATERAL_BUFFER_METERS;
  if (proximity.routeDistanceMeters > alertCorridorMeters) {
    return null;
  }

  if (distanceToVehicleMeters <= proximity.radiusMeters) {
    return "inside";
  }

  if (
    distanceToVehicleMeters <=
    proximity.radiusMeters + LIVE_RISK_ACTIVE_BUFFER_METERS
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
    return "Inside this SafeRoute risk area";
  }

  if (alert.status === "nearby") {
    return `${formatDistance(alert.distanceToVehicleMeters)} from convoy`;
  }

  return `${formatDistance(Math.max(0, alert.routeDistanceAheadMeters))} ahead`;
}

function isLiveRiskState(state: NavigationLifecycle): boolean {
  return state === "navigating" || state === "off-route";
}

function normalizeRadiusMeters(radiusMeters: number): number {
  return Number.isFinite(radiusMeters) && radiusMeters > 0 ? radiusMeters : 0;
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
