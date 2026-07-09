import type { LatLng } from 'react-native-maps';

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_DEGREE_LATITUDE = 110574;
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111320;

export interface SegmentProjection {
  snappedCoordinate: LatLng;
  distanceMeters: number;
  segmentIndex: number;
  segmentProgress: number;
}

export interface RouteProjection extends SegmentProjection {
  distanceAlongMeters: number;
}

export function haversineDistanceMeters(first: LatLng, second: LatLng): number {
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const deltaLatitude = toRadians(second.latitude - first.latitude);
  const deltaLongitude = toRadians(second.longitude - first.longitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLongitude / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculateCumulativeDistances(coordinates: LatLng[]): number[] {
  const route = normalizeRouteCoordinates(coordinates);
  if (!route.length) {
    return [];
  }

  const distances = [0];
  for (let index = 1; index < route.length; index += 1) {
    distances[index] = distances[index - 1] + haversineDistanceMeters(route[index - 1], route[index]);
  }
  return distances;
}

export function densifyRouteCoordinates(
  coordinates: LatLng[],
  maxSegmentLengthMeters: number
): LatLng[] {
  const route = normalizeRouteCoordinates(coordinates);
  if (route.length <= 1) {
    return route;
  }

  if (!Number.isFinite(maxSegmentLengthMeters) || maxSegmentLengthMeters <= 0) {
    return route;
  }

  const denseRoute: LatLng[] = [route[0]];

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentDistanceMeters = haversineDistanceMeters(start, end);
    const segmentSteps = Math.max(1, Math.ceil(segmentDistanceMeters / maxSegmentLengthMeters));

    for (let step = 1; step <= segmentSteps; step += 1) {
      denseRoute.push(interpolateCoordinate(start, end, step / segmentSteps));
    }
  }

  return denseRoute;
}

export function normalizeRouteCoordinates(coordinates: LatLng[]): LatLng[] {
  const normalized: LatLng[] = [];

  for (const coordinate of coordinates) {
    if (!isValidCoordinate(coordinate)) {
      continue;
    }

    const previous = normalized[normalized.length - 1];
    if (previous && haversineDistanceMeters(previous, coordinate) < 0.5) {
      continue;
    }

    normalized.push(coordinate);
  }

  return normalized;
}

export function projectCoordinateToRoute(
  coordinates: LatLng[],
  currentCoordinate: LatLng,
  minimumDistanceAlongMeters = 0
): RouteProjection | null {
  const route = normalizeRouteCoordinates(coordinates);
  if (!route.length || !isValidCoordinate(currentCoordinate)) {
    return null;
  }

  if (route.length === 1) {
    return {
      snappedCoordinate: route[0],
      distanceMeters: haversineDistanceMeters(currentCoordinate, route[0]),
      distanceAlongMeters: 0,
      segmentIndex: 0,
      segmentProgress: 0
    };
  }

  const segmentLengths = route.slice(0, -1).map((coordinate, index) => (
    haversineDistanceMeters(coordinate, route[index + 1])
  ));
  const routeDistanceMeters = segmentLengths.reduce((total, distance) => total + distance, 0);
  const minimumDistance = clamp(
    Number.isFinite(minimumDistanceAlongMeters) ? minimumDistanceAlongMeters : 0,
    0,
    routeDistanceMeters
  );
  let nearest: RouteProjection = {
    snappedCoordinate: route[0],
    distanceMeters: Number.POSITIVE_INFINITY,
    distanceAlongMeters: 0,
    segmentIndex: 0,
    segmentProgress: 0
  };
  let distanceBeforeSegmentMeters = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentLengthMeters = segmentLengths[index];

    if (distanceBeforeSegmentMeters + segmentLengthMeters < minimumDistance) {
      distanceBeforeSegmentMeters += segmentLengthMeters;
      continue;
    }

    const projection = projectCoordinateToSegment(currentCoordinate, start, end, index);
    const minimumSegmentProgress = segmentLengthMeters <= 0
      ? 0
      : clamp((minimumDistance - distanceBeforeSegmentMeters) / segmentLengthMeters, 0, 1);
    const segmentProgress = Math.max(projection.segmentProgress, minimumSegmentProgress);
    const snappedCoordinate = segmentProgress === projection.segmentProgress
      ? projection.snappedCoordinate
      : interpolateCoordinate(start, end, segmentProgress);
    const distanceMeters = segmentProgress === projection.segmentProgress
      ? projection.distanceMeters
      : haversineDistanceMeters(currentCoordinate, snappedCoordinate);
    const distanceAlongMeters = distanceBeforeSegmentMeters + segmentLengthMeters * segmentProgress;

    if (distanceMeters < nearest.distanceMeters) {
      nearest = {
        snappedCoordinate,
        distanceMeters,
        distanceAlongMeters,
        segmentIndex: index,
        segmentProgress
      };
    }

    distanceBeforeSegmentMeters += segmentLengthMeters;
  }

  if (!Number.isFinite(nearest.distanceMeters)) {
    const finalCoordinate = route[route.length - 1];
    return {
      snappedCoordinate: finalCoordinate,
      distanceMeters: haversineDistanceMeters(currentCoordinate, finalCoordinate),
      distanceAlongMeters: routeDistanceMeters,
      segmentIndex: Math.max(0, route.length - 2),
      segmentProgress: 1
    };
  }

  return nearest;
}

export function bearingBetween(first: LatLng, second: LatLng): number {
  const lat1 = toRadians(first.latitude);
  const lat2 = toRadians(second.latitude);
  const deltaLongitude = toRadians(second.longitude - first.longitude);
  const y = Math.sin(deltaLongitude) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLongitude);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

export function projectCoordinateToSegment(current: LatLng, start: LatLng, end: LatLng, segmentIndex = 0): SegmentProjection {
  const referenceLatitude = toRadians((current.latitude + start.latitude + end.latitude) / 3);
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * Math.max(0.001, Math.cos(referenceLatitude));
  const startPoint = toLocalPoint(start, current, metersPerDegreeLongitude);
  const endPoint = toLocalPoint(end, current, metersPerDegreeLongitude);
  const currentPoint = { x: 0, y: 0 };
  const segmentX = endPoint.x - startPoint.x;
  const segmentY = endPoint.y - startPoint.y;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const segmentProgress = segmentLengthSquared === 0
    ? 0
    : clamp(((currentPoint.x - startPoint.x) * segmentX + (currentPoint.y - startPoint.y) * segmentY) / segmentLengthSquared, 0, 1);
  const snappedCoordinate = {
    latitude: start.latitude + (end.latitude - start.latitude) * segmentProgress,
    longitude: start.longitude + (end.longitude - start.longitude) * segmentProgress
  };

  return {
    snappedCoordinate,
    distanceMeters: Math.hypot(currentPoint.x - (startPoint.x + segmentX * segmentProgress), currentPoint.y - (startPoint.y + segmentY * segmentProgress)),
    segmentIndex,
    segmentProgress
  };
}

function interpolateCoordinate(start: LatLng, end: LatLng, ratio: number): LatLng {
  return {
    latitude: start.latitude + (end.latitude - start.latitude) * ratio,
    longitude: start.longitude + (end.longitude - start.longitude) * ratio
  };
}

function isValidCoordinate(coordinate?: LatLng | null): coordinate is LatLng {
  if (!coordinate) {
    return false;
  }

  return Number.isFinite(Number(coordinate.latitude)) &&
    Number.isFinite(Number(coordinate.longitude)) &&
    coordinate.latitude >= -90 &&
    coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 &&
    coordinate.longitude <= 180;
}

function toLocalPoint(coordinate: LatLng, origin: LatLng, metersPerDegreeLongitude: number): { x: number; y: number } {
  return {
    x: (coordinate.longitude - origin.longitude) * metersPerDegreeLongitude,
    y: (coordinate.latitude - origin.latitude) * METERS_PER_DEGREE_LATITUDE
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}
