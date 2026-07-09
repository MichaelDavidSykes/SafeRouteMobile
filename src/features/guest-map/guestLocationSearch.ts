import type { LatLng, Region } from 'react-native-maps';

export type GuestLocationSearchResult = {
  category: string | null;
  coordinate: LatLng;
  displayName: string;
  id: string;
  label: string;
};

export type GuestLocationSearchBias = {
  center?: LatLng | null;
  region?: Region | null;
};

export type GuestLocationSearchOptions = {
  bias?: GuestLocationSearchBias;
  request?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
};

type NominatimSearchResult = {
  class?: unknown;
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
  osm_id?: unknown;
  osm_type?: unknown;
  place_id?: unknown;
  type?: unknown;
};

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const LOCATION_SEARCH_TIMEOUT_MS = 8000;
const LOCATION_RESULT_LIMIT = 6;

export async function searchGuestLocations(
  query: string,
  {
    bias,
    request = fetch,
    signal,
    timeoutMs = LOCATION_SEARCH_TIMEOUT_MS
  }: GuestLocationSearchOptions = {}
): Promise<GuestLocationSearchResult[]> {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }

  const coordinateResult = parseCoordinateSearch(normalizedQuery);
  if (coordinateResult) {
    return [coordinateResult];
  }

  const normalizedBias = normalizeSearchBias(bias);
  const params = new URLSearchParams({
    addressdetails: '1',
    format: 'jsonv2',
    limit: String(LOCATION_RESULT_LIMIT),
    q: normalizedQuery
  });
  const bounds = normalizedBias.region
    ? regionToBounds(normalizedBias.region)
    : null;
  if (bounds) {
    params.set(
      'viewbox',
      [bounds.west, bounds.south, bounds.east, bounds.north]
        .map(formatCoordinate)
        .join(',')
    );
    params.set('bounded', '0');
  }

  const timeoutSignal = createTimeoutSignal(signal, timeoutMs);
  try {
    const response = await request(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-GB,en;q=0.8'
      },
      signal: timeoutSignal.signal
    });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return rankLocationResults(
      normalizeLocationResults(payload),
      normalizedBias
    );
  } catch {
    return [];
  } finally {
    timeoutSignal.cleanup();
  }
}

export async function reverseGeocodeGuestLocation(
  coordinate: LatLng,
  {
    request = fetch,
    signal,
    timeoutMs = LOCATION_SEARCH_TIMEOUT_MS
  }: Omit<GuestLocationSearchOptions, 'bias'> = {}
): Promise<GuestLocationSearchResult | null> {
  if (!isValidCoordinate(coordinate)) {
    return null;
  }

  const params = new URLSearchParams({
    addressdetails: '1',
    format: 'jsonv2',
    lat: formatCoordinate(coordinate.latitude),
    lon: formatCoordinate(coordinate.longitude),
    zoom: '18'
  });
  const timeoutSignal = createTimeoutSignal(signal, timeoutMs);
  try {
    const response = await request(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
        'Accept-Language': 'en-GB,en;q=0.8'
      },
      signal: timeoutSignal.signal
    });
    if (!response.ok) {
      return null;
    }

    return normalizeLocationResult(await response.json(), 0);
  } catch {
    return null;
  } finally {
    timeoutSignal.cleanup();
  }
}

export function regionToBounds(region: Region) {
  if (!isValidRegion(region)) {
    return null;
  }

  const halfLatitudeDelta = Math.min(180, Math.abs(region.latitudeDelta)) / 2;
  const halfLongitudeDelta = Math.min(360, Math.abs(region.longitudeDelta)) / 2;
  return {
    east: clampLongitude(region.longitude + halfLongitudeDelta),
    north: Math.min(90, region.latitude + halfLatitudeDelta),
    south: Math.max(-90, region.latitude - halfLatitudeDelta),
    west: clampLongitude(region.longitude - halfLongitudeDelta)
  };
}

export function parseCoordinateSearch(query: string): GuestLocationSearchResult | null {
  const match = query.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    return null;
  }

  const coordinate = {
    latitude: Number(match[1]),
    longitude: Number(match[2])
  };
  if (!isValidCoordinate(coordinate)) {
    return null;
  }

  const label = `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
  return {
    category: 'coordinate',
    coordinate,
    displayName: `Coordinate ${label}`,
    id: `coordinate-${coordinate.latitude.toFixed(6)}-${coordinate.longitude.toFixed(6)}`,
    label
  };
}

function normalizeLocationResults(payload: unknown): GuestLocationSearchResult[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  const seen = new Set<string>();
  return payload
    .map((item, index) => normalizeLocationResult(item, index))
    .filter((item): item is GuestLocationSearchResult => Boolean(item))
    .filter((item) => {
      const key = `${item.coordinate.latitude.toFixed(6)},${item.coordinate.longitude.toFixed(6)}:${item.displayName.toLowerCase()}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, LOCATION_RESULT_LIMIT);
}

function normalizeLocationResult(
  payload: unknown,
  index: number
): GuestLocationSearchResult | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const item = payload as NominatimSearchResult;
  const coordinate = {
    latitude: Number(item.lat),
    longitude: Number(item.lon)
  };
  const displayName = String(item.display_name ?? '').trim().replace(/\s+/g, ' ');
  if (!displayName || !isValidCoordinate(coordinate)) {
    return null;
  }

  const idParts = [item.place_id, item.osm_type, item.osm_id]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const categoryParts = [item.class, item.type]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  const label = displayName.split(',')[0]?.trim() || displayName;

  return {
    category: categoryParts.join(' / ') || null,
    coordinate: {
      latitude: Number(coordinate.latitude.toFixed(6)),
      longitude: Number(coordinate.longitude.toFixed(6))
    },
    displayName: displayName.slice(0, 320),
    id: idParts.join('-') || `location-${index + 1}`,
    label: label.slice(0, 120)
  };
}

function rankLocationResults(
  results: GuestLocationSearchResult[],
  bias: Required<GuestLocationSearchBias>
): GuestLocationSearchResult[] {
  const bounds = bias.region ? regionToBounds(bias.region) : null;
  const center = bias.center || (bias.region
    ? { latitude: bias.region.latitude, longitude: bias.region.longitude }
    : null);
  if (!bounds && !center) {
    return results;
  }

  return results
    .map((result, index) => ({
      index,
      result,
      score:
        (bounds && coordinateInsideBounds(result.coordinate, bounds) ? -100000 : 0) +
        (center ? distanceKm(result.coordinate, center) : 0)
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ result }) => result);
}

function normalizeSearchBias(
  bias: GuestLocationSearchBias | undefined
): Required<GuestLocationSearchBias> {
  return {
    center: isValidCoordinate(bias?.center) ? bias?.center ?? null : null,
    region: isValidRegion(bias?.region) ? bias?.region ?? null : null
  };
}

function coordinateInsideBounds(
  coordinate: LatLng,
  bounds: NonNullable<ReturnType<typeof regionToBounds>>
): boolean {
  const longitudeInside = bounds.west <= bounds.east
    ? coordinate.longitude >= bounds.west && coordinate.longitude <= bounds.east
    : coordinate.longitude >= bounds.west || coordinate.longitude <= bounds.east;
  return (
    coordinate.latitude >= bounds.south &&
    coordinate.latitude <= bounds.north &&
    longitudeInside
  );
}

function distanceKm(left: LatLng, right: LatLng): number {
  const toRadians = Math.PI / 180;
  const leftLatitude = left.latitude * toRadians;
  const rightLatitude = right.latitude * toRadians;
  const deltaLatitude = (right.latitude - left.latitude) * toRadians;
  const deltaLongitude = (right.longitude - left.longitude) * toRadians;
  const sinLatitude = Math.sin(deltaLatitude / 2);
  const sinLongitude = Math.sin(deltaLongitude / 2);
  const haversine =
    sinLatitude * sinLatitude +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * sinLongitude * sinLongitude;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(Math.max(0, 1 - haversine)));
}

function createTimeoutSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): { cleanup: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const abortFromParent = () => controller.abort();
  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  if (parentSignal?.aborted) {
    controller.abort();
  }

  return {
    cleanup: () => {
      clearTimeout(timer);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
    signal: controller.signal
  };
}

function normalizeSearchText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 160);
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function clampLongitude(value: number): number {
  return ((value + 540) % 360) - 180;
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

function isValidRegion(region?: Region | null): region is Region {
  return Boolean(
    region &&
      isValidCoordinate(region) &&
      Number.isFinite(Number(region.latitudeDelta)) &&
      Number.isFinite(Number(region.longitudeDelta)) &&
      Math.abs(region.latitudeDelta) > 0 &&
      Math.abs(region.longitudeDelta) > 0
  );
}
