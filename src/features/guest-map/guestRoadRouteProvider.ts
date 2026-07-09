import type { LatLng } from 'react-native-maps';

import { haversineDistanceMeters } from '../live-map/routeGeometry';

export type GuestRoadRouteProvider = 'osrm';

export type GuestRoadRoutePreview = {
  coordinates: LatLng[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  provider: GuestRoadRouteProvider;
  snapped: boolean;
};

export type GuestRoadRoutePreviewOptions = {
  request?: typeof fetch;
  signal?: AbortSignal;
  stops: LatLng[];
  timeoutMs?: number;
};

const OSRM_ROUTE_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const GUEST_ROUTE_PROVIDER_TIMEOUT_MS = 8000;
const GUEST_ROUTE_PROVIDER_MAX_STOPS = 25;
const GUEST_ROUTE_PROVIDER_MAX_COORDINATES = 1400;
const GUEST_ROUTE_PROVIDER_ENDPOINT_CONNECTOR_THRESHOLD_METERS = 2;
const GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS = 800;

export async function fetchGuestRoadRoutePreview({
  request = fetch,
  signal,
  stops,
  timeoutMs = GUEST_ROUTE_PROVIDER_TIMEOUT_MS
}: GuestRoadRoutePreviewOptions): Promise<GuestRoadRoutePreview | null> {
  const routeStops = normalizeRouteStops(stops);
  if (routeStops.length < 2) {
    return null;
  }

  const timeoutSignal = createTimeoutSignal(signal, timeoutMs);

  try {
    const response = await request(buildOsrmRouteUrl(routeStops), {
      signal: timeoutSignal.signal
    });

    if (!response.ok) {
      return null;
    }

    return normalizeOsrmRoutePreview(await response.json(), routeStops);
  } catch {
    return null;
  } finally {
    timeoutSignal.cleanup();
  }
}

export function buildOsrmRouteUrl(stops: LatLng[]): string {
  const normalizedStops = normalizeRouteStops(stops);
  if (normalizedStops.length < 2) {
    throw new Error('At least two valid stops are required to request a guest road route.');
  }

  const coordinatePath = normalizedStops
    .map((stop) => `${formatCoordinate(stop.longitude)},${formatCoordinate(stop.latitude)}`)
    .join(';');
  const searchParams = new URLSearchParams({
    alternatives: 'false',
    continue_straight: 'false',
    geometries: 'geojson',
    overview: 'full',
    steps: 'false'
  });

  return `${OSRM_ROUTE_BASE_URL}/${coordinatePath}?${searchParams.toString()}`;
}

function normalizeOsrmRoutePreview(payload: unknown, stops: LatLng[]): GuestRoadRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.code !== 'Ok' || !Array.isArray(record.routes) || !record.routes.length) {
    return null;
  }

  const route = record.routes[0] as Record<string, unknown>;
  const geometry = route.geometry as Record<string, unknown> | undefined;
  const coordinates = normalizeOsrmGeometryCoordinates(geometry?.coordinates);
  if (coordinates.length < 2 || !routeCoversRequestedEndpoints(coordinates, stops)) {
    return null;
  }

  return {
    coordinates: preserveRequestedEndpointConnectors(
      downsampleRouteCoordinates(coordinates),
      stops[0],
      stops[stops.length - 1]
    ),
    distanceMeters: normalizePositiveNumber(route.distance),
    durationSeconds: normalizePositiveNumber(route.duration),
    provider: 'osrm',
    snapped: true
  };
}

function normalizeOsrmGeometryCoordinates(coordinates: unknown): LatLng[] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  const normalized: LatLng[] = [];

  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      continue;
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    const nextCoordinate = {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6))
    };

    if (!isValidLatLng(nextCoordinate)) {
      continue;
    }

    const previous = normalized[normalized.length - 1];
    if (!previous || haversineDistanceMeters(previous, nextCoordinate) >= 1) {
      normalized.push(nextCoordinate);
    }
  }

  return normalized;
}

function normalizeRouteStops(stops: LatLng[]): LatLng[] {
  const normalizedStops = stops.filter(isValidLatLng);
  return normalizedStops
    .filter((stop, index) => {
      const previous = normalizedStops[index - 1];
      return !previous || haversineDistanceMeters(previous, stop) >= 15;
    })
    .slice(0, GUEST_ROUTE_PROVIDER_MAX_STOPS);
}

function routeCoversRequestedEndpoints(coordinates: LatLng[], stops: LatLng[]): boolean {
  const firstCoordinate = coordinates[0];
  const lastCoordinate = coordinates[coordinates.length - 1];
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];

  return (
    haversineDistanceMeters(firstCoordinate, firstStop) <= GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS &&
    haversineDistanceMeters(lastCoordinate, lastStop) <= GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS
  );
}

function preserveRequestedEndpointConnectors(
  coordinates: LatLng[],
  origin: LatLng,
  destination: LatLng
): LatLng[] {
  const route = [...coordinates];
  const firstCoordinate = route[0];
  const lastCoordinate = route[route.length - 1];

  if (
    firstCoordinate &&
    haversineDistanceMeters(origin, firstCoordinate) >
      GUEST_ROUTE_PROVIDER_ENDPOINT_CONNECTOR_THRESHOLD_METERS
  ) {
    route.unshift(origin);
  }

  if (
    lastCoordinate &&
    haversineDistanceMeters(destination, lastCoordinate) >
      GUEST_ROUTE_PROVIDER_ENDPOINT_CONNECTOR_THRESHOLD_METERS
  ) {
    route.push(destination);
  }

  return route;
}

function downsampleRouteCoordinates(coordinates: LatLng[]): LatLng[] {
  if (coordinates.length <= GUEST_ROUTE_PROVIDER_MAX_COORDINATES) {
    return coordinates;
  }

  const step = Math.ceil(coordinates.length / GUEST_ROUTE_PROVIDER_MAX_COORDINATES);
  return coordinates.filter((_, index) => (
    index === 0 ||
    index === coordinates.length - 1 ||
    index % step === 0
  ));
}

function createTimeoutSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): { cleanup: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const clearTimer = () => clearTimeout(timeout);
  const abortFromParent = () => {
    clearTimer();
    controller.abort();
  };

  if (parentSignal?.aborted) {
    abortFromParent();
    return {
      cleanup: clearTimer,
      signal: controller.signal
    };
  }

  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  controller.signal.addEventListener('abort', clearTimer, { once: true });

  return {
    cleanup: () => {
      clearTimer();
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
    signal: controller.signal
  };
}

function normalizePositiveNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function isValidLatLng(coordinate?: LatLng | null): coordinate is LatLng {
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
