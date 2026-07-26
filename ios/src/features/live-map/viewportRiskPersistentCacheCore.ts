import type { AreaRiskViewportRequest } from './areaRiskApiCore';
import type { RiskZone } from './liveMapTypes';
import {
  VIEWPORT_RISK_CACHE_MAX_ENTRIES,
  viewportRiskCacheKey,
  type ViewportRiskCache,
  type ViewportRiskCacheEntry
} from './viewportRiskState';

export const VIEWPORT_RISK_PERSISTENT_CACHE_SCHEMA = 1;
export const VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const VIEWPORT_RISK_PERSISTENT_MAX_ENTRIES = 16;
export const VIEWPORT_RISK_PERSISTENT_MAX_CHARACTERS = 1536 * 1024;

interface PersistedViewportRiskCacheRecord {
  entries: ViewportRiskCacheEntry[];
  savedAtMs: number;
  schema: typeof VIEWPORT_RISK_PERSISTENT_CACHE_SCHEMA;
  scopeId: string;
}

export function serializeViewportRiskCache(
  cache: ViewportRiskCache,
  scopeIdValue: string,
  nowMs = Date.now()
): string {
  const scopeId = normalizeViewportRiskCacheScopeId(scopeIdValue);
  if (!scopeId) {
    throw new Error('Viewport risk cache scope is invalid.');
  }
  const entries = Array.from(cache.values())
    .filter((entry) => isPersistedEntryCurrent(entry, nowMs))
    .sort((left, right) =>
      right.lastAccessedAt - left.lastAccessedAt
      || right.cachedAt - left.cachedAt
    )
    .slice(
      0,
      Math.min(
        VIEWPORT_RISK_CACHE_MAX_ENTRIES,
        VIEWPORT_RISK_PERSISTENT_MAX_ENTRIES
      )
    )
    .map(cloneCacheEntry);

  for (let entryCount = entries.length; entryCount >= 0; entryCount -= 1) {
    const serialized = JSON.stringify({
      entries: entries.slice(0, entryCount),
      savedAtMs: nowMs,
      schema: VIEWPORT_RISK_PERSISTENT_CACHE_SCHEMA,
      scopeId
    } satisfies PersistedViewportRiskCacheRecord);
    if (serialized.length <= VIEWPORT_RISK_PERSISTENT_MAX_CHARACTERS) {
      return serialized;
    }
  }

  throw new Error('Viewport risk cache storage capacity was exceeded.');
}

export function parseViewportRiskCache(
  raw: string | null,
  expectedScopeIdValue: string,
  nowMs = Date.now()
): ViewportRiskCache | null {
  const expectedScopeId = normalizeViewportRiskCacheScopeId(expectedScopeIdValue);
  if (
    !raw
    || !expectedScopeId
    || raw.length > VIEWPORT_RISK_PERSISTENT_MAX_CHARACTERS
  ) {
    return null;
  }

  try {
    const value = JSON.parse(raw) as Partial<PersistedViewportRiskCacheRecord>;
    if (
      value.schema !== VIEWPORT_RISK_PERSISTENT_CACHE_SCHEMA
      || normalizeViewportRiskCacheScopeId(value.scopeId) !== expectedScopeId
      || !isCurrentTimestamp(value.savedAtMs, nowMs)
      || !Array.isArray(value.entries)
      || value.entries.length > VIEWPORT_RISK_PERSISTENT_MAX_ENTRIES
    ) {
      return null;
    }

    const cache: ViewportRiskCache = new Map();
    for (const candidate of value.entries) {
      const entry = normalizePersistedCacheEntry(candidate, nowMs);
      if (!entry) {
        continue;
      }
      const existing = cache.get(entry.key);
      if (!existing || entry.cachedAt > existing.cachedAt) {
        cache.set(entry.key, entry);
      }
    }
    if (value.entries.length > 0 && cache.size === 0) {
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

export function mergeViewportRiskCaches(
  current: ViewportRiskCache,
  restored: ViewportRiskCache,
  nowMs = Date.now()
): ViewportRiskCache {
  const merged: ViewportRiskCache = new Map();
  for (const entry of [...restored.values(), ...current.values()]) {
    if (!isPersistedEntryCurrent(entry, nowMs)) {
      continue;
    }
    const existing = merged.get(entry.key);
    if (
      !existing
      || entry.cachedAt > existing.cachedAt
      || (
        entry.cachedAt === existing.cachedAt
        && entry.lastAccessedAt > existing.lastAccessedAt
      )
    ) {
      merged.set(entry.key, cloneCacheEntry(entry));
    }
  }

  const retainedKeys = Array.from(merged.values())
    .sort((left, right) =>
      right.lastAccessedAt - left.lastAccessedAt
      || right.cachedAt - left.cachedAt
    )
    .slice(0, VIEWPORT_RISK_PERSISTENT_MAX_ENTRIES)
    .map((entry) => entry.key);
  return new Map(retainedKeys.map((key) => [key, merged.get(key)!]));
}

export function normalizeViewportRiskCacheScopeId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, 200)
    : '';
}

export function normalizePersistedRiskZones(
  value: unknown,
  maxZones = 200
): RiskZone[] | null {
  if (!Array.isArray(value) || value.length > maxZones) {
    return null;
  }
  const zones: RiskZone[] = [];
  for (const candidate of value) {
    const zone = normalizePersistedRiskZone(candidate);
    if (!zone) {
      return null;
    }
    zones.push(zone);
  }
  return zones;
}

function normalizePersistedCacheEntry(
  value: unknown,
  nowMs: number
): ViewportRiskCacheEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ViewportRiskCacheEntry>;
  const request = normalizePersistedRequest(candidate.request);
  const zones = normalizePersistedRiskZones(candidate.zones);
  if (
    !request
    || !zones
    || typeof candidate.key !== 'string'
    || candidate.key !== viewportRiskCacheKey(request)
    || !isCurrentTimestamp(candidate.cachedAt, nowMs)
    || !Number.isFinite(candidate.lastAccessedAt)
    || Number(candidate.lastAccessedAt) < Number(candidate.cachedAt)
    || Number(candidate.lastAccessedAt) > nowMs
  ) {
    return null;
  }
  return {
    cachedAt: Number(candidate.cachedAt),
    key: candidate.key,
    lastAccessedAt: Number(candidate.lastAccessedAt),
    request,
    zones
  };
}

function normalizePersistedRequest(
  value: unknown
): AreaRiskViewportRequest | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<AreaRiskViewportRequest>;
  const scope = candidate.scope;
  const minLat = finiteNumber(candidate.minLat);
  const maxLat = finiteNumber(candidate.maxLat);
  const minLon = finiteNumber(candidate.minLon);
  const maxLon = finiteNumber(candidate.maxLon);
  const zoom = finiteNumber(candidate.zoom);
  const maxRecords = finiteNumber(candidate.maxRecords);
  if (
    (scope !== 'global' && scope !== 'regional' && scope !== 'detail')
    || minLat === null
    || maxLat === null
    || minLon === null
    || maxLon === null
    || zoom === null
    || maxRecords === null
    || minLat < -90
    || maxLat > 90
    || minLat >= maxLat
    || minLon < -180
    || maxLon > 180
    || minLon >= maxLon
    || zoom < 0
    || zoom > 24
    || !Number.isInteger(maxRecords)
    || maxRecords < 1
    || maxRecords > 160
    || typeof candidate.bbox !== 'string'
    || !candidate.bbox.trim()
    || candidate.bbox.length > 160
    || (
      candidate.clientId !== undefined
      && (
        typeof candidate.clientId !== 'string'
        || !candidate.clientId.trim()
        || candidate.clientId.length > 80
      )
    )
    || (
      candidate.countries !== undefined
      && (
        !Array.isArray(candidate.countries)
        || candidate.countries.length > 12
        || candidate.countries.some((country) =>
          typeof country !== 'string'
          || !country.trim()
          || country.length > 80
        )
      )
    )
  ) {
    return null;
  }
  return {
    bbox: candidate.bbox,
    ...(candidate.clientId ? { clientId: candidate.clientId } : {}),
    ...(candidate.countries ? { countries: [...candidate.countries] } : {}),
    maxLat,
    maxLon,
    maxRecords,
    minLat,
    minLon,
    scope,
    zoom
  };
}

function normalizePersistedRiskZone(value: unknown): RiskZone | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<RiskZone>;
  const coordinate = normalizeCoordinate(candidate.coordinate);
  const radiusMeters = finiteNumber(candidate.radiusMeters);
  if (
    !boundedText(candidate.id, 160)
    || !boundedText(candidate.title, 160)
    || typeof candidate.description !== 'string'
    || candidate.description.length > 1600
    || (candidate.severity !== 'low'
      && candidate.severity !== 'medium'
      && candidate.severity !== 'high')
    || (
      candidate.avoidanceSeverity !== undefined
      && candidate.avoidanceSeverity !== 'high'
      && candidate.avoidanceSeverity !== 'critical'
    )
    || !boundedText(candidate.category, 120)
    || !coordinate
    || radiusMeters === null
    || radiusMeters < 0
    || radiusMeters > 250000
    || !boundedText(candidate.markerColor, 80)
    || !boundedText(candidate.strokeColor, 80)
    || !boundedText(candidate.fillColor, 80)
  ) {
    return null;
  }

  const routeSegmentCoordinates = normalizeCoordinateList(
    candidate.routeSegmentCoordinates
  );
  const connectorCoordinates = normalizeCoordinateList(
    candidate.connectorCoordinates
  );
  const polygonCoordinates = normalizeCoordinateList(
    candidate.polygonCoordinates
  );
  if (
    routeSegmentCoordinates === null
    || connectorCoordinates === null
    || polygonCoordinates === null
    || (
      candidate.shape !== undefined
      && (
        typeof candidate.shape !== 'string'
        || candidate.shape.length > 40
      )
    )
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title,
    description: candidate.description,
    severity: candidate.severity,
    ...(candidate.avoidanceSeverity
      ? { avoidanceSeverity: candidate.avoidanceSeverity }
      : {}),
    category: candidate.category,
    coordinate,
    ...(routeSegmentCoordinates
      ? { routeSegmentCoordinates }
      : {}),
    ...(connectorCoordinates ? { connectorCoordinates } : {}),
    ...(polygonCoordinates ? { polygonCoordinates } : {}),
    ...(candidate.shape ? { shape: candidate.shape } : {}),
    radiusMeters,
    markerColor: candidate.markerColor,
    strokeColor: candidate.strokeColor,
    fillColor: candidate.fillColor
  };
}

function normalizeCoordinateList(value: unknown): RiskZone['polygonCoordinates'] | null {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length > 512) {
    return null;
  }
  const coordinates = value.map(normalizeCoordinate);
  return coordinates.some((coordinate) => coordinate === null)
    ? null
    : coordinates as NonNullable<RiskZone['polygonCoordinates']>;
}

function normalizeCoordinate(value: unknown): RiskZone['coordinate'] | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<RiskZone['coordinate']>;
  const latitude = finiteNumber(candidate.latitude);
  const longitude = finiteNumber(candidate.longitude);
  return latitude !== null
    && latitude >= -90
    && latitude <= 90
    && longitude !== null
    && longitude >= -180
    && longitude <= 180
    ? { latitude, longitude }
    : null;
}

function cloneCacheEntry(entry: ViewportRiskCacheEntry): ViewportRiskCacheEntry {
  return {
    cachedAt: entry.cachedAt,
    key: entry.key,
    lastAccessedAt: entry.lastAccessedAt,
    request: {
      ...entry.request,
      countries: entry.request.countries
        ? [...entry.request.countries]
        : undefined
    },
    zones: normalizePersistedRiskZones(entry.zones) || []
  };
}

function isPersistedEntryCurrent(
  entry: Pick<ViewportRiskCacheEntry, 'cachedAt'>,
  nowMs: number
): boolean {
  return isCurrentTimestamp(entry.cachedAt, nowMs);
}

function isCurrentTimestamp(value: unknown, nowMs: number): boolean {
  return Number.isFinite(value)
    && Number.isFinite(nowMs)
    && Number(value) > 0
    && Number(value) <= nowMs
    && nowMs - Number(value) <= VIEWPORT_RISK_PERSISTENT_MAX_AGE_MS;
}

function boundedText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string'
    && Boolean(value.trim())
    && value.length <= maxLength;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : null;
}
