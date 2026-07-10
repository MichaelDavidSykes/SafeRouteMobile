import type { LatLng, Region } from 'react-native-maps';

import { mergeRiskZonesById } from './areaRiskApiCore';
import type { RiskZone } from './liveMapTypes';
import {
  calculateCumulativeDistances,
  densifyRouteCoordinates,
  normalizeRouteCoordinates
} from './routeGeometry';

const DEFAULT_MAX_CORRIDOR_CHUNKS = 8;
const MIN_CORRIDOR_DELTA = 0.12;
const MAX_CORRIDOR_DELTA = 0.75;

export function buildRouteRiskCorridorRegions(
  coordinates: LatLng[],
  maxChunks = DEFAULT_MAX_CORRIDOR_CHUNKS
): Region[] {
  const route = normalizeRouteCoordinates(coordinates);
  if (route.length < 2) {
    return [];
  }
  const cumulative = calculateCumulativeDistances(route);
  const totalDistanceMeters = cumulative.at(-1) ?? 0;
  const chunkLimit = clampInteger(maxChunks, 1, 12, DEFAULT_MAX_CORRIDOR_CHUNKS);
  const targetChunks = Math.max(
    2,
    Math.min(chunkLimit, Math.ceil(totalDistanceMeters / 22_000) + 1)
  );
  const spacingMeters = Math.max(1, totalDistanceMeters / Math.max(1, targetChunks - 1));
  const denseRoute = densifyRouteCoordinates(route, spacingMeters);
  const sampled = evenlySampleCoordinates(denseRoute, targetChunks);
  const delta = clamp(spacingMeters / 90_000 * 1.5, MIN_CORRIDOR_DELTA, MAX_CORRIDOR_DELTA);

  const seen = new Set<string>();
  return sampled.map((coordinate) => ({
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: delta,
    longitudeDelta: delta
  })).filter((region) => {
    const key = `${region.latitude.toFixed(3)}:${region.longitude.toFixed(3)}:${delta.toFixed(3)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function loadRouteRiskCorridor(
  regions: Region[],
  fetchRegion: (region: Region) => Promise<RiskZone[]>,
  concurrency = 2
): Promise<RiskZone[]> {
  if (!regions.length) {
    return [];
  }
  const zoneGroups = await mapWithConcurrency(regions, concurrency, fetchRegion);
  return mergeRiskZonesById(...zoneGroups);
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(values[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function evenlySampleCoordinates(coordinates: LatLng[], count: number): LatLng[] {
  if (coordinates.length <= count) {
    return coordinates;
  }
  return Array.from({ length: count }, (_, index) =>
    coordinates[Math.round(index * (coordinates.length - 1) / (count - 1))]
  );
}

function clampInteger(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
