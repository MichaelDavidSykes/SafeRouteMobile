import type { LatLng } from 'react-native-maps';

import { haversineDistanceMeters } from '../live-map/routeGeometry';

export type GuestRoadRouteProvider = 'osrm' | 'tomtom';

export type GuestRoadRoutePreview = {
  coordinates: LatLng[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  provider: GuestRoadRouteProvider;
  snapped: boolean;
};

export type GuestRoadRoutePreviewOptions = {
  avoidRectangles?: GuestRouteAvoidRectangle[];
  request?: typeof fetch;
  signal?: AbortSignal;
  stops: LatLng[];
  timeoutMs?: number;
};

export type GuestRouteAvoidRectangle = {
  label?: string | null;
  maxLatitude: number;
  maxLongitude: number;
  minLatitude: number;
  minLongitude: number;
};

const OSRM_ROUTE_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';
const GUEST_ROUTE_PROVIDER_TIMEOUT_MS = 8000;
const GUEST_ROUTE_PROVIDER_MAX_STOPS = 25;
const GUEST_ROUTE_PROVIDER_MAX_COORDINATES = 1400;
const GUEST_ROUTE_PROVIDER_ENDPOINT_CONNECTOR_THRESHOLD_METERS = 2;
const GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS = 800;

export async function fetchGuestRoadRoutePreview({
  avoidRectangles = [],
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

    return normalizeOsrmRoutePreview(
      await response.json(),
      routeStops,
      normalizeAvoidRectangles(avoidRectangles)
    );
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
    alternatives: 'true',
    continue_straight: 'false',
    geometries: 'geojson',
    overview: 'full',
    steps: 'false'
  });

  return `${OSRM_ROUTE_BASE_URL}/${coordinatePath}?${searchParams.toString()}`;
}

function normalizeOsrmRoutePreview(
  payload: unknown,
  stops: LatLng[],
  avoidRectangles: GuestRouteAvoidRectangle[] = []
): GuestRoadRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.code !== 'Ok' || !Array.isArray(record.routes) || !record.routes.length) {
    return null;
  }

  const candidates = record.routes
    .map((route) => normalizeOsrmRouteCandidate(route, stops))
    .filter((route): route is GuestRoadRoutePreview => Boolean(route))
    .filter((route) => !routeIntersectsAvoidRectangles(route.coordinates, avoidRectangles))
    .sort((left, right) =>
      (left.durationSeconds ?? Number.POSITIVE_INFINITY) -
        (right.durationSeconds ?? Number.POSITIVE_INFINITY) ||
      (left.distanceMeters ?? Number.POSITIVE_INFINITY) -
        (right.distanceMeters ?? Number.POSITIVE_INFINITY)
    );

  return candidates[0] || null;
}

function normalizeOsrmRouteCandidate(
  payload: unknown,
  stops: LatLng[]
): GuestRoadRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const route = payload as Record<string, unknown>;
  const geometry = route.geometry as Record<string, unknown> | undefined;
  const coordinates = normalizeOsrmGeometryCoordinates(geometry?.coordinates);
  if (
    coordinates.length < 2 ||
    !routeCoversRequestedEndpoints(coordinates, stops) ||
    !routeCoversRequestedStopsInOrder(coordinates, stops)
  ) {
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

function routeCoversRequestedStopsInOrder(coordinates: LatLng[], stops: LatLng[]): boolean {
  let routeStartIndex = 0;
  for (const stop of stops) {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = routeStartIndex; index < coordinates.length; index += 1) {
      const distance = haversineDistanceMeters(coordinates[index], stop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    if (nearestIndex < 0 || nearestDistance > GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS) {
      return false;
    }
    routeStartIndex = nearestIndex;
  }
  return true;
}

function normalizeAvoidRectangles(
  rectangles: GuestRouteAvoidRectangle[]
): GuestRouteAvoidRectangle[] {
  return rectangles
    .filter((rectangle) =>
      Number.isFinite(rectangle?.minLatitude) &&
      Number.isFinite(rectangle?.maxLatitude) &&
      Number.isFinite(rectangle?.minLongitude) &&
      Number.isFinite(rectangle?.maxLongitude) &&
      rectangle.maxLatitude > rectangle.minLatitude &&
      rectangle.maxLongitude > rectangle.minLongitude &&
      rectangle.minLatitude >= -90 &&
      rectangle.maxLatitude <= 90 &&
      rectangle.minLongitude >= -180 &&
      rectangle.maxLongitude <= 180
    )
    .slice(0, 10);
}

function routeIntersectsAvoidRectangles(
  coordinates: LatLng[],
  rectangles: GuestRouteAvoidRectangle[]
): boolean {
  if (!rectangles.length) {
    return false;
  }

  return rectangles.some((rectangle) => coordinates.some((coordinate, index) => {
    if (coordinateInsideRectangle(coordinate, rectangle)) {
      return true;
    }
    const next = coordinates[index + 1];
    return Boolean(next && segmentIntersectsRectangle(coordinate, next, rectangle));
  }));
}

function coordinateInsideRectangle(
  coordinate: LatLng,
  rectangle: GuestRouteAvoidRectangle
): boolean {
  return (
    coordinate.latitude >= rectangle.minLatitude &&
    coordinate.latitude <= rectangle.maxLatitude &&
    coordinate.longitude >= rectangle.minLongitude &&
    coordinate.longitude <= rectangle.maxLongitude
  );
}

function segmentIntersectsRectangle(
  start: LatLng,
  end: LatLng,
  rectangle: GuestRouteAvoidRectangle
): boolean {
  const segmentMinLatitude = Math.min(start.latitude, end.latitude);
  const segmentMaxLatitude = Math.max(start.latitude, end.latitude);
  const segmentMinLongitude = Math.min(start.longitude, end.longitude);
  const segmentMaxLongitude = Math.max(start.longitude, end.longitude);
  if (
    segmentMaxLatitude < rectangle.minLatitude ||
    segmentMinLatitude > rectangle.maxLatitude ||
    segmentMaxLongitude < rectangle.minLongitude ||
    segmentMinLongitude > rectangle.maxLongitude
  ) {
    return false;
  }

  const rectangleCorners: LatLng[] = [
    { latitude: rectangle.minLatitude, longitude: rectangle.minLongitude },
    { latitude: rectangle.minLatitude, longitude: rectangle.maxLongitude },
    { latitude: rectangle.maxLatitude, longitude: rectangle.maxLongitude },
    { latitude: rectangle.maxLatitude, longitude: rectangle.minLongitude }
  ];
  return rectangleCorners.some((corner, index) =>
    lineSegmentsIntersect(start, end, corner, rectangleCorners[(index + 1) % 4])
  );
}

function lineSegmentsIntersect(a: LatLng, b: LatLng, c: LatLng, d: LatLng): boolean {
  const orientation = (p: LatLng, q: LatLng, r: LatLng) =>
    (q.longitude - p.longitude) * (r.latitude - p.latitude) -
    (q.latitude - p.latitude) * (r.longitude - p.longitude);
  const first = orientation(a, b, c);
  const second = orientation(a, b, d);
  const third = orientation(c, d, a);
  const fourth = orientation(c, d, b);
  return (
    ((first <= 0 && second >= 0) || (first >= 0 && second <= 0)) &&
    ((third <= 0 && fourth >= 0) || (third >= 0 && fourth <= 0))
  );
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
  const validStops = stops.filter(isValidLatLng);
  const compactStops: LatLng[] = [];

  for (const [index, stop] of validStops.entries()) {
    const isEndpoint = index === 0 || index === validStops.length - 1;
    const previousStop = compactStops[compactStops.length - 1];

    if (isEndpoint || !previousStop || haversineDistanceMeters(previousStop, stop) >= 15) {
      compactStops.push(stop);
    }
  }

  return limitRouteStops(compactStops);
}

function limitRouteStops(stops: LatLng[]): LatLng[] {
  if (stops.length <= GUEST_ROUTE_PROVIDER_MAX_STOPS) {
    return stops;
  }

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const intermediateStops = stops.slice(1, -1);
  const intermediateBudget = GUEST_ROUTE_PROVIDER_MAX_STOPS - 2;
  const selectedIntermediateStops: LatLng[] = [];
  const selectedIndexes = new Set<number>();

  for (let index = 0; index < intermediateBudget; index += 1) {
    const sourceIndex = Math.round(
      (index * (intermediateStops.length - 1)) / Math.max(1, intermediateBudget - 1)
    );

    if (!selectedIndexes.has(sourceIndex)) {
      selectedIndexes.add(sourceIndex);
      selectedIntermediateStops.push(intermediateStops[sourceIndex]);
    }
  }

  return [origin, ...selectedIntermediateStops, destination];
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
