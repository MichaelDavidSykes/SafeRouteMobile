import type { LatLng } from 'react-native-maps';

import { haversineDistanceMeters } from '../live-map/routeGeometry';
import { normalizeRouteNavigationSteps } from '../live-map/routeGuidance';
import {
  type GuestRoadRoutePreview,
  type GuestRouteAvoidRectangle
} from './guestRoadRouteProvider';

type SafeRouteRoutePreviewPayload = {
  avoid_rectangles?: Array<{
    label?: string | null;
    max_lat: number;
    max_lon: number;
    min_lat: number;
    min_lon: number;
  }>;
  client_id: string;
  waypoints: Array<{
    elevation_m: null;
    lat: number;
    lon: number;
  }>;
};

const SAFE_ROUTE_STOP_MATCH_METERS = 1200;
const SAFE_ROUTE_FALLBACK_SPEED_METERS_PER_SECOND = 6.5;

export function buildSafeRoutePreviewPayload({
  avoidRectangles,
  clientId,
  stops
}: {
  avoidRectangles: GuestRouteAvoidRectangle[];
  clientId: string;
  stops: LatLng[];
}): SafeRouteRoutePreviewPayload {
  const payload: SafeRouteRoutePreviewPayload = {
    client_id: clientId.trim(),
    waypoints: stops.map((stop) => ({
      elevation_m: null,
      lat: Number(stop.latitude.toFixed(6)),
      lon: Number(stop.longitude.toFixed(6))
    }))
  };
  const normalizedAvoidRectangles = normalizeAvoidRectangles(avoidRectangles);
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

export function normalizeSafeRoutePreviewResponse(
  payload: unknown,
  requestedStops: LatLng[],
  requestedAvoidAreaCount = 0
): GuestRoadRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const provider = record.provider === 'tomtom' || record.provider === 'osrm'
    ? record.provider
    : null;
  if (!provider || record.snapped !== true) {
    return null;
  }

  const appliedAvoidAreaCount = normalizeNonNegativeNumber(
    record.avoid_area_count ?? record.avoidAreaCount
  );
  if (
    requestedAvoidAreaCount > 0 &&
    (appliedAvoidAreaCount === null || appliedAvoidAreaCount < requestedAvoidAreaCount)
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
  const withEndpointConnectors = preserveEndpointConnectors(coordinates, stops);
  const measuredDistance = measureRouteDistance(withEndpointConnectors);
  const distanceMeters = normalizePositiveNumber(
    record.distance_meters ?? record.distanceMeters ?? record.distance
  ) ?? measuredDistance;
  const durationSeconds = normalizePositiveNumber(
    record.duration_seconds ?? record.durationSeconds ?? record.duration
  ) ?? (distanceMeters > 0
    ? distanceMeters / SAFE_ROUTE_FALLBACK_SPEED_METERS_PER_SECOND
    : null);

  return {
    coordinates: withEndpointConnectors,
    distanceMeters,
    durationSeconds,
    provider,
    snapped: true,
    guidanceSteps: normalizeRouteNavigationSteps(
      record.guidance_steps ?? record.guidanceSteps
    )
  };
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

function normalizeAvoidRectangles(
  rectangles: GuestRouteAvoidRectangle[]
): GuestRouteAvoidRectangle[] {
  return rectangles.filter((rectangle) =>
    Number.isFinite(rectangle?.minLatitude) &&
    Number.isFinite(rectangle?.maxLatitude) &&
    Number.isFinite(rectangle?.minLongitude) &&
    Number.isFinite(rectangle?.maxLongitude) &&
    rectangle.maxLatitude > rectangle.minLatitude &&
    rectangle.maxLongitude > rectangle.minLongitude
  ).slice(0, 10);
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
