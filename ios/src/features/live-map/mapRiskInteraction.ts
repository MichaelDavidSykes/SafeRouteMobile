import type { LatLng, Region } from "react-native-maps";

import type { RiskZone } from "./liveMapTypes";
import { isRouteAlertZone, visibleRiskRadiusMeters } from "./riskOverlayPresentation";
import { calculateRiskZoneCoordinateProximity } from "./routeRisk";
import { haversineDistanceMeters } from "./routeProgress";

const METERS_PER_LATITUDE_DEGREE = 111_320;
const DEFAULT_TAP_TOLERANCE_METERS = 24;
const MIN_TAP_TOLERANCE_METERS = 10;
const MAX_TAP_TOLERANCE_METERS = 120;
const TAP_TARGET_POINTS = 14;
const riskPolygonBoundsCache = new WeakMap<RiskZone, RiskBounds>();
const polylineBoundsCache = new WeakMap<LatLng[], RiskBounds>();

interface RiskBounds {
  maxLatitude: number;
  maxLongitude: number;
  minLatitude: number;
  minLongitude: number;
}

export function resolveRiskMapTapToleranceMeters({
  region,
  viewportHeight,
}: {
  region: Pick<Region, "latitudeDelta">;
  viewportHeight: number;
}): number {
  if (
    !Number.isFinite(region.latitudeDelta) ||
    region.latitudeDelta <= 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return DEFAULT_TAP_TOLERANCE_METERS;
  }

  const metersPerPoint =
    region.latitudeDelta * METERS_PER_LATITUDE_DEGREE / viewportHeight;
  return Math.max(
    MIN_TAP_TOLERANCE_METERS,
    Math.min(MAX_TAP_TOLERANCE_METERS, metersPerPoint * TAP_TARGET_POINTS),
  );
}

export function resolveRiskZoneAtMapCoordinate({
  coordinate,
  toleranceMeters = 0,
  zones,
}: {
  coordinate: LatLng;
  toleranceMeters?: number;
  zones: RiskZone[];
}): RiskZone | null {
  if (!isValidCoordinate(coordinate) || !zones.length) {
    return null;
  }

  const candidates = zones.flatMap((zone) => {
    if (isRouteAlertZone(zone) || !isValidCoordinate(zone.coordinate)) {
      return [];
    }

    if (!riskZoneCouldContainTap(coordinate, zone, toleranceMeters)) {
      return [];
    }

    const polygon = zone.polygonCoordinates || [];
    const proximity = calculateRiskZoneCoordinateProximity(
      coordinate,
      polygon.length >= 3
        ? zone
        : { ...zone, radiusMeters: visibleRiskRadiusMeters(zone) },
    );
    if (!proximity.inside && proximity.distanceMeters > toleranceMeters) {
      return [];
    }

    return [{
      centerDistanceMeters: haversineDistanceMeters(coordinate, zone.coordinate),
      inside: proximity.inside,
      proximityMeters: proximity.distanceMeters,
      zone,
    }];
  });

  candidates.sort((first, second) =>
    Number(second.inside) - Number(first.inside) ||
    first.proximityMeters - second.proximityMeters ||
    first.centerDistanceMeters - second.centerDistanceMeters,
  );
  return candidates[0]?.zone || null;
}

export function resolveRiskMarkerAtMapCoordinate({
  coordinate,
  toleranceMeters,
  zones,
}: {
  coordinate: LatLng;
  toleranceMeters: number;
  zones: RiskZone[];
}): RiskZone | null {
  if (
    !isValidCoordinate(coordinate) ||
    !Number.isFinite(toleranceMeters) ||
    toleranceMeters <= 0 ||
    !zones.length
  ) {
    return null;
  }

  let nearest: { distanceMeters: number; zone: RiskZone } | null = null;
  for (const zone of zones) {
    if (!isValidCoordinate(zone.coordinate)) {
      continue;
    }
    const distanceMeters = haversineDistanceMeters(coordinate, zone.coordinate);
    if (
      distanceMeters <= toleranceMeters &&
      (!nearest || distanceMeters < nearest.distanceMeters)
    ) {
      nearest = { distanceMeters, zone };
    }
  }
  return nearest?.zone || null;
}

export function resolveMapPolylineAtCoordinate<
  T extends { coordinates: LatLng[] },
>({
  coordinate,
  polylines,
  toleranceMeters,
}: {
  coordinate: LatLng;
  polylines: T[];
  toleranceMeters: number;
}): T | null {
  if (!isValidCoordinate(coordinate) || !polylines.length) {
    return null;
  }

  let nearest: { distanceMeters: number; polyline: T } | null = null;
  for (const polyline of polylines) {
    if (
      polyline.coordinates.length < 2 ||
      !polylineCouldContainTap(
        coordinate,
        polyline.coordinates,
        toleranceMeters,
      )
    ) {
      continue;
    }

    const distanceMeters = distanceToPolylineMeters(
      coordinate,
      polyline.coordinates,
    );
    if (
      distanceMeters <= toleranceMeters &&
      (!nearest || distanceMeters < nearest.distanceMeters)
    ) {
      nearest = { distanceMeters, polyline };
    }
  }

  return nearest?.polyline || null;
}

function riskZoneCouldContainTap(
  coordinate: LatLng,
  zone: RiskZone,
  toleranceMeters: number,
): boolean {
  const polygon = zone.polygonCoordinates || [];
  const latitudeTolerance = Math.max(0, toleranceMeters) / METERS_PER_LATITUDE_DEGREE;
  const longitudeMetersPerDegree = Math.max(
    1,
    METERS_PER_LATITUDE_DEGREE * Math.cos(coordinate.latitude * Math.PI / 180),
  );
  const longitudeTolerance = Math.max(0, toleranceMeters) / longitudeMetersPerDegree;

  if (polygon.length >= 3) {
    const bounds = resolvePolygonBounds(zone, polygon);
    if (bounds.maxLongitude - bounds.minLongitude > 180) {
      return true;
    }
    return (
      coordinate.latitude >= bounds.minLatitude - latitudeTolerance &&
      coordinate.latitude <= bounds.maxLatitude + latitudeTolerance &&
      coordinate.longitude >= bounds.minLongitude - longitudeTolerance &&
      coordinate.longitude <= bounds.maxLongitude + longitudeTolerance
    );
  }

  const radiusMeters = visibleRiskRadiusMeters(zone) + Math.max(0, toleranceMeters);
  const radiusLatitude = radiusMeters / METERS_PER_LATITUDE_DEGREE;
  const radiusLongitude = radiusMeters / longitudeMetersPerDegree;
  return (
    Math.abs(coordinate.latitude - zone.coordinate.latitude) <= radiusLatitude &&
    Math.abs(coordinate.longitude - zone.coordinate.longitude) <= radiusLongitude
  );
}

function resolvePolygonBounds(zone: RiskZone, polygon: LatLng[]): RiskBounds {
  const cached = riskPolygonBoundsCache.get(zone);
  if (cached) {
    return cached;
  }
  const bounds = polygon.reduce<RiskBounds>((current, point) => ({
    maxLatitude: Math.max(current.maxLatitude, point.latitude),
    maxLongitude: Math.max(current.maxLongitude, point.longitude),
    minLatitude: Math.min(current.minLatitude, point.latitude),
    minLongitude: Math.min(current.minLongitude, point.longitude),
  }), {
    maxLatitude: -90,
    maxLongitude: -180,
    minLatitude: 90,
    minLongitude: 180,
  });
  riskPolygonBoundsCache.set(zone, bounds);
  return bounds;
}

function polylineCouldContainTap(
  coordinate: LatLng,
  coordinates: LatLng[],
  toleranceMeters: number,
): boolean {
  const bounds = resolvePolylineBounds(coordinates);
  const latitudeTolerance = Math.max(0, toleranceMeters) / METERS_PER_LATITUDE_DEGREE;
  const longitudeMetersPerDegree = Math.max(
    1,
    METERS_PER_LATITUDE_DEGREE * Math.cos(coordinate.latitude * Math.PI / 180),
  );
  const longitudeTolerance = Math.max(0, toleranceMeters) / longitudeMetersPerDegree;
  return (
    coordinate.latitude >= bounds.minLatitude - latitudeTolerance &&
    coordinate.latitude <= bounds.maxLatitude + latitudeTolerance &&
    coordinate.longitude >= bounds.minLongitude - longitudeTolerance &&
    coordinate.longitude <= bounds.maxLongitude + longitudeTolerance
  );
}

function resolvePolylineBounds(coordinates: LatLng[]): RiskBounds {
  const cached = polylineBoundsCache.get(coordinates);
  if (cached) {
    return cached;
  }
  const bounds = coordinates.reduce<RiskBounds>((current, point) => ({
    maxLatitude: Math.max(current.maxLatitude, point.latitude),
    maxLongitude: Math.max(current.maxLongitude, point.longitude),
    minLatitude: Math.min(current.minLatitude, point.latitude),
    minLongitude: Math.min(current.minLongitude, point.longitude),
  }), {
    maxLatitude: -90,
    maxLongitude: -180,
    minLatitude: 90,
    minLongitude: 180,
  });
  polylineBoundsCache.set(coordinates, bounds);
  return bounds;
}

function distanceToPolylineMeters(
  coordinate: LatLng,
  polyline: LatLng[],
): number {
  const longitudeMetersPerDegree = Math.max(
    1,
    METERS_PER_LATITUDE_DEGREE * Math.cos(coordinate.latitude * Math.PI / 180),
  );
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 1; index < polyline.length; index += 1) {
    const start = polyline[index - 1];
    const end = polyline[index];
    if (!isValidCoordinate(start) || !isValidCoordinate(end)) {
      continue;
    }
    const startX = (start.longitude - coordinate.longitude) * longitudeMetersPerDegree;
    const startY = (start.latitude - coordinate.latitude) * METERS_PER_LATITUDE_DEGREE;
    const endX = (end.longitude - coordinate.longitude) * longitudeMetersPerDegree;
    const endY = (end.latitude - coordinate.latitude) * METERS_PER_LATITUDE_DEGREE;
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
    const projection = segmentLengthSquared > 0
      ? Math.max(
          0,
          Math.min(1, -(startX * deltaX + startY * deltaY) / segmentLengthSquared),
        )
      : 0;
    const projectedX = startX + deltaX * projection;
    const projectedY = startY + deltaY * projection;
    nearestDistanceSquared = Math.min(
      nearestDistanceSquared,
      projectedX * projectedX + projectedY * projectedY,
    );
  }
  return Math.sqrt(nearestDistanceSquared);
}

function isValidCoordinate(coordinate: LatLng): boolean {
  return Boolean(
    Number.isFinite(coordinate.latitude) &&
    Number.isFinite(coordinate.longitude) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180,
  );
}
