import type { Region } from 'react-native-maps';

import type { RiskSeverity, RiskZone } from './liveMapTypes';

export const AREA_RISK_ENDPOINT_PATH = '/intel/map/area-risk';
export const AREA_RISK_RESEARCH_ENDPOINT_PATH = `${AREA_RISK_ENDPOINT_PATH}/research`;
export const AREA_RISK_CAPABILITY_HEADER = 'X-SafeRoute-Area-Risk-Capability';
export const MOBILE_AREA_RISK_CAPABILITY = 'mobile-explicit-research-strict-read-v1';
export const MIN_VIEWPORT_RISK_ZOOM = 0;
export const DEFAULT_DETAIL_AREA_RISK_MAX_RECORDS = 100;
export const DEFAULT_REGIONAL_AREA_RISK_MAX_RECORDS = 120;
export const DEFAULT_GLOBAL_AREA_RISK_MAX_RECORDS = 120;
export const MAX_AREA_RISK_RECORDS = 160;
export const MAX_AREA_RISK_RESEARCH_SPAN_KM = 1500;
export const DEFAULT_AREA_RISK_PAGE_SIZE = 100;
export const MAX_AREA_RISK_PAGES = 8;
export const AREA_RISK_CACHE_COORDINATE_QUANTUM = 0.00001;
export const AREA_RISK_CACHE_ZOOM_QUANTUM = 0.5;
export const AREA_RISK_VIEWPORT_PADDING_RATIO = 0.35;

export type AreaRiskScope = 'global' | 'regional' | 'detail';
export type AreaRiskLoadIntent = 'read' | 'research';

export interface AreaRiskBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface AreaRiskViewportRequest {
  bbox: string;
  clientId?: string;
  countries?: string[];
  maxLat: number;
  maxLon: number;
  maxRecords: number;
  minLat: number;
  minLon: number;
  scope: AreaRiskScope;
  zoom: number;
}

export interface AreaRiskViewportRequestOptions {
  clientId?: string;
  countries?: string[];
  detailMaxRecords?: number;
  globalMaxRecords?: number;
  minZoom?: number;
  regionalMaxRecords?: number;
}

export interface AreaRiskPathOptions {
  authenticated?: boolean;
  bypassCacheNonce?: string | null;
  cursor?: string | null;
  pageSize?: number | null;
  strictRead?: boolean;
}

export interface AreaRiskCacheKeyOptions {
  coordinateQuantum?: number;
  zoomQuantum?: number;
}

export interface AreaRiskFeed {
  coverageStatus: string | null;
  fetchedAt: string | null;
  legacyFallback: boolean;
  message: string;
  pagesLoaded: number;
  partial: boolean;
  providerStatus: string | null;
  readError: string | null;
  research: AreaRiskResearchState | null;
  researchError: string | null;
  seedStatus: string | null;
  zones: RiskZone[];
}

export interface AreaRiskResearchState {
  accepted: boolean;
  coalesced: boolean;
  coverageStatus: string | null;
  pending: boolean;
  queued: boolean;
  retryAfterSeconds: number | null;
  seedId: string | null;
  seedStatus: string | null;
  status: string | null;
}

export interface AreaRiskResearchPayload {
  bounds: {
    max_lat: number;
    max_lon: number;
    min_lat: number;
    min_lon: number;
  };
  client_id: string;
  country_hints: string[];
  scope: Exclude<AreaRiskScope, 'global'>;
  zoom: number;
}

export interface AreaRiskFeedPage extends AreaRiskFeed {
  hasMore: boolean;
  nextCursor: string | null;
}

export interface AreaRiskAvoidRectangle {
  label?: string;
  max_lat: number;
  max_lon: number;
  min_lat: number;
  min_lon: number;
}

export interface AreaRiskAvoidRectangleOptions {
  maxRectangles?: number;
  maxSpanKm?: number;
  paddingMeters?: number;
}

type Coordinate = RiskZone['coordinate'];
type AvoidanceRiskZone = Omit<RiskZone, 'severity'> & {
  severity: RiskSeverity | 'critical';
};

const DEFAULT_RADIUS_METERS = 1000;
const MIN_RADIUS_METERS = 50;
const MAX_RADIUS_METERS = 10000;
const MAX_COORDINATES_PER_ZONE = 512;

const severityColors: Record<RiskSeverity, { fill: string; marker: string; stroke: string }> = {
  low: {
    marker: '#5c8df6',
    stroke: 'rgba(92, 141, 246, 0.72)',
    fill: 'rgba(92, 141, 246, 0.16)'
  },
  medium: {
    marker: '#f3a32b',
    stroke: 'rgba(243, 163, 43, 0.72)',
    fill: 'rgba(243, 163, 43, 0.18)'
  },
  high: {
    marker: '#d84a3f',
    stroke: 'rgba(216, 74, 63, 0.72)',
    fill: 'rgba(216, 74, 63, 0.18)'
  }
};

export function approximateMapZoom(region: Pick<Region, 'longitudeDelta'>): number {
  const longitudeDelta = positiveFiniteNumber(region?.longitudeDelta);
  if (longitudeDelta === null) {
    return 0;
  }
  return clamp(Math.log2(360 / Math.min(360, longitudeDelta)), 0, 24);
}

/**
 * Returns one stable padded request normally and two bounded requests when
 * the viewport crosses the antimeridian. World views use one canonical global
 * partition so panning at low zoom does not repeatedly refetch the same feed.
 */
export function regionToAreaRiskViewportRequests(
  region: Region | null | undefined,
  options: AreaRiskViewportRequestOptions = {}
): AreaRiskViewportRequest[] {
  if (!region || !isValidLatLon(region.latitude, region.longitude)) {
    return [];
  }

  const zoom = approximateMapZoom(region);
  const minimumZoom = clamp(
    finiteNumber(options.minZoom) ?? MIN_VIEWPORT_RISK_ZOOM,
    0,
    24
  );
  if (zoom < minimumZoom) {
    return [];
  }

  const latitudeDelta = clamp(positiveFiniteNumber(region.latitudeDelta) ?? 0.04, 0.002, 170);
  const longitudeDelta = clamp(positiveFiniteNumber(region.longitudeDelta) ?? 0.04, 0.002, 360);
  const scope: AreaRiskScope = zoom < 4 ? 'global' : (zoom >= 9 ? 'detail' : 'regional');
  const rawBounds: AreaRiskBounds = scope === 'global'
    ? { south: -85, west: -180, north: 85, east: 180 }
    : stablePaddedViewportBounds(region, latitudeDelta, longitudeDelta, zoom);
  if (rawBounds.north <= rawBounds.south) {
    return [];
  }

  const maxRecords = clampInteger(
    scope === 'global'
      ? options.globalMaxRecords ?? DEFAULT_GLOBAL_AREA_RISK_MAX_RECORDS
      : scope === 'detail'
        ? options.detailMaxRecords ?? DEFAULT_DETAIL_AREA_RISK_MAX_RECORDS
        : options.regionalMaxRecords ?? DEFAULT_REGIONAL_AREA_RISK_MAX_RECORDS,
    1,
    MAX_AREA_RISK_RECORDS,
    scope === 'global'
      ? DEFAULT_GLOBAL_AREA_RISK_MAX_RECORDS
      : scope === 'detail'
        ? DEFAULT_DETAIL_AREA_RISK_MAX_RECORDS
        : DEFAULT_REGIONAL_AREA_RISK_MAX_RECORDS
  );
  const clientId = cleanOptionalText(options.clientId, 80) ?? undefined;
  const countries = normalizeCountryHints(options.countries);

  const stableZoom = quantizedNumber(zoom, AREA_RISK_CACHE_ZOOM_QUANTUM);
  return splitBoundsAtAntimeridian(rawBounds).map((bounds) => ({
    bbox: formatBbox(bounds),
    ...(clientId ? { clientId } : {}),
    ...(countries.length ? { countries } : {}),
    maxLat: bounds.north,
    maxLon: bounds.east,
    maxRecords,
    minLat: bounds.south,
    minLon: bounds.west,
    scope,
    zoom: stableZoom
  }));
}

function stablePaddedViewportBounds(
  region: Pick<Region, 'latitude' | 'longitude'>,
  latitudeDelta: number,
  longitudeDelta: number,
  zoom: number
): AreaRiskBounds {
  const latitudePadding = latitudeDelta * AREA_RISK_VIEWPORT_PADDING_RATIO;
  const longitudePadding = longitudeDelta * AREA_RISK_VIEWPORT_PADDING_RATIO;
  const gridSize = areaRiskViewportGridSize(zoom);
  const south = clamp(
    floorToQuantum(region.latitude - latitudeDelta / 2 - latitudePadding, gridSize),
    -85,
    85
  );
  const north = clamp(
    ceilToQuantum(region.latitude + latitudeDelta / 2 + latitudePadding, gridSize),
    -85,
    85
  );
  const expandedLongitudeDelta = Math.min(
    360,
    longitudeDelta + longitudePadding * 2
  );
  if (expandedLongitudeDelta >= 360) {
    return { south, west: -180, north, east: 180 };
  }
  const centerLongitude = wrapLongitude(region.longitude);
  return {
    south,
    west: floorToQuantum(centerLongitude - expandedLongitudeDelta / 2, gridSize),
    north,
    east: ceilToQuantum(centerLongitude + expandedLongitudeDelta / 2, gridSize)
  };
}

function areaRiskViewportGridSize(zoom: number): number {
  if (zoom >= 13) {
    return 0.02;
  }
  if (zoom >= 11) {
    return 0.05;
  }
  if (zoom >= 9) {
    return 0.1;
  }
  if (zoom >= 7) {
    return 0.5;
  }
  if (zoom >= 4) {
    return 2;
  }
  return 360;
}

/** The configured API base contributes /api/v1 to this endpoint-relative path. */
export function buildAreaRiskViewportPath(
  request: AreaRiskViewportRequest,
  {
    authenticated = false,
    bypassCacheNonce,
    cursor,
    pageSize,
    strictRead = true
  }: AreaRiskPathOptions = {}
): string {
  const scope = normalizeScope(request.scope, request.zoom);
  const bounds = scope === 'global'
    ? null
    : normalizeNonCrossingBounds({
        south: request.minLat,
        west: request.minLon,
        north: request.maxLat,
        east: request.maxLon
      });
  if (scope !== 'global' && !bounds) {
    throw new Error('A valid, non-crossing viewport bbox is required for area risk.');
  }

  const params = new URLSearchParams();
  params.set('refresh', 'false');
  params.set('read_only', strictRead ? 'true' : 'false');
  params.set('max_records', String(clampInteger(request.maxRecords, 1, MAX_AREA_RISK_RECORDS, 60)));
  const clientId = cleanOptionalText(request.clientId, 80);
  if (authenticated && clientId) {
    params.set('client_id', clientId);
  }
  params.set('scope', scope);
  params.set('zoom', clamp(finiteNumber(request.zoom) ?? 0, 0, 24).toFixed(2));
  if (bounds) {
    params.set('bbox', formatBbox(bounds));
  }
  const countries = normalizeCountryHints(request.countries);
  if (countries.length) {
    params.set('countries', countries.join(','));
  }
  const normalizedPageSize = clampInteger(
    pageSize,
    1,
    DEFAULT_AREA_RISK_PAGE_SIZE,
    Math.min(DEFAULT_AREA_RISK_PAGE_SIZE, request.maxRecords)
  );
  params.set('page_size', String(normalizedPageSize));
  const normalizedCursor = cleanOptionalText(cursor, 160);
  if (normalizedCursor) {
    params.set('cursor', normalizedCursor);
  }
  const nonce = cleanOptionalText(bypassCacheNonce, 120);
  if (nonce) {
    params.set('_read_nonce', nonce);
  }
  return `${AREA_RISK_ENDPOINT_PATH}?${params.toString()}`;
}

export function canRequestAreaRiskResearch(
  request: AreaRiskViewportRequest,
  accessToken?: string | null
): boolean {
  const clientId = cleanOptionalText(request.clientId, 80);
  if (!String(accessToken ?? '').trim() || !clientId || request.scope === 'global') {
    return false;
  }
  const bounds = normalizeNonCrossingBounds({
    south: request.minLat,
    west: request.minLon,
    north: request.maxLat,
    east: request.maxLon
  });
  if (!bounds) {
    return false;
  }

  const latitudeSpanKm = (bounds.north - bounds.south) * 111.32;
  const midpointLatitudeRadians = ((bounds.south + bounds.north) / 2) * (Math.PI / 180);
  const longitudeSpanKm = (bounds.east - bounds.west)
    * 111.32
    * Math.max(0.01, Math.abs(Math.cos(midpointLatitudeRadians)));
  return latitudeSpanKm <= MAX_AREA_RISK_RESEARCH_SPAN_KM
    && longitudeSpanKm <= MAX_AREA_RISK_RESEARCH_SPAN_KM;
}

export function buildAreaRiskResearchPayload(
  request: AreaRiskViewportRequest
): AreaRiskResearchPayload {
  if (request.scope === 'global') {
    throw new Error('Global area-risk research is not supported.');
  }
  const bounds = normalizeNonCrossingBounds({
    south: request.minLat,
    west: request.minLon,
    north: request.maxLat,
    east: request.maxLon
  });
  const clientId = cleanOptionalText(request.clientId, 80);
  if (!bounds || !clientId) {
    throw new Error('A tenant and valid, non-crossing viewport are required for area-risk research.');
  }

  return {
    client_id: clientId,
    scope: request.scope,
    bounds: {
      min_lat: bounds.south,
      max_lat: bounds.north,
      min_lon: bounds.west,
      max_lon: bounds.east
    },
    zoom: clamp(finiteNumber(request.zoom) ?? 0, 0, 24),
    country_hints: normalizeCountryHints(request.countries)
  };
}

export function buildAreaRiskRequestHeaders(accessToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    [AREA_RISK_CAPABILITY_HEADER]: MOBILE_AREA_RISK_CAPABILITY
  };
  const token = String(accessToken ?? '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export function areaRiskViewportRequestKey(
  request: AreaRiskViewportRequest,
  {
    coordinateQuantum = AREA_RISK_CACHE_COORDINATE_QUANTUM,
    zoomQuantum = AREA_RISK_CACHE_ZOOM_QUANTUM
  }: AreaRiskCacheKeyOptions = {}
): string {
  const coordinateStep = positiveFiniteNumber(coordinateQuantum) ?? AREA_RISK_CACHE_COORDINATE_QUANTUM;
  const zoomStep = positiveFiniteNumber(zoomQuantum) ?? AREA_RISK_CACHE_ZOOM_QUANTUM;
  const countries = normalizeCountryHints(request.countries)
    .map((country) => country.toLowerCase())
    .sort()
    .join(',');

  return [
    request.scope,
    quantizedValue(request.zoom, zoomStep),
    quantizedValue(request.minLat, coordinateStep),
    quantizedValue(request.maxLat, coordinateStep),
    quantizedValue(request.minLon, coordinateStep),
    quantizedValue(request.maxLon, coordinateStep),
    clampInteger(request.maxRecords, 1, MAX_AREA_RISK_RECORDS, 60),
    cleanOptionalText(request.clientId, 80)?.toLowerCase() ?? 'public',
    countries || '-'
  ].join(':');
}

export function normalizeAreaRiskFeed(payload: unknown): AreaRiskFeed {
  return normalizeAreaRiskFeedPage(payload);
}

export function normalizeAreaRiskFeedPage(payload: unknown): AreaRiskFeedPage {
  const body = unwrapDataEnvelope(payload);
  const record = asRecord(body);
  const source = cleanOptionalText(record?.source, 160) ?? 'LunarChain area-risk intelligence';
  const items = Array.isArray(body)
    ? body
    : (Array.isArray(record?.items) ? record.items : []);
  const zones = mergeRiskZonesById(
    items
      .slice(0, MAX_AREA_RISK_RECORDS * 2)
      .map((item, index) => normalizeAreaRiskItem(item, index, source))
      .filter((zone): zone is RiskZone => zone !== null)
  ).slice(0, MAX_AREA_RISK_RECORDS);
  const providerErrors = asArray(record?.providerErrors ?? record?.provider_errors)
    .map((value) => cleanOptionalText(value, 240))
    .filter((value): value is string => Boolean(value));

  return {
    coverageStatus: cleanOptionalText(
      record?.coverageStatus ?? record?.coverage_status,
      80
    ),
    fetchedAt: cleanOptionalText(record?.fetchedAt ?? record?.fetched_at, 80),
    legacyFallback: false,
    message: zones.length
      ? `${zones.length} SafeRoute area-risk signal${zones.length === 1 ? '' : 's'} prepared.`
      : (providerErrors[0] ?? 'No SafeRoute area-risk signals are available for this map view yet.'),
    pagesLoaded: 1,
    partial: false,
    providerStatus: cleanOptionalText(record?.providerStatus ?? record?.provider_status, 80),
    readError: null,
    research: null,
    researchError: null,
    seedStatus: cleanOptionalText(record?.seedStatus ?? record?.seed_status, 80),
    hasMore: record?.hasMore === true || record?.has_more === true,
    nextCursor: cleanOptionalText(record?.nextCursor ?? record?.next_cursor, 160),
    zones
  };
}

export function normalizeAreaRiskResearchState(payload: unknown): AreaRiskResearchState {
  const body = unwrapDataEnvelope(payload);
  const record = asRecord(body);
  const status = cleanOptionalText(record?.status, 80)?.toLowerCase() ?? null;
  return {
    accepted: record?.accepted === true,
    coalesced: record?.coalesced === true,
    coverageStatus: cleanOptionalText(
      record?.coverageStatus ?? record?.coverage_status,
      80
    ),
    pending: record?.pending === true || status === 'queued' || status === 'scheduled'
      || status === 'researching',
    queued: record?.queued === true,
    retryAfterSeconds: nonNegativeIntegerOrNull(
      record?.retryAfterSeconds ?? record?.retry_after_seconds
    ),
    seedId: cleanOptionalText(record?.seedId ?? record?.seed_id, 160),
    seedStatus: cleanOptionalText(record?.seedStatus ?? record?.seed_status, 80),
    status
  };
}

export function areaRiskResponseBoundsMatchRequest(
  payload: unknown,
  request: AreaRiskViewportRequest
): boolean {
  if (request.scope === 'global') {
    return true;
  }
  const body = unwrapDataEnvelope(payload);
  const record = asRecord(body);
  const responseBounds = asRecord(record?.bounds);
  if (!responseBounds) {
    return false;
  }
  const expected = [
    request.minLat,
    request.maxLat,
    request.minLon,
    request.maxLon
  ];
  const actual = [
    responseBounds.minLat ?? responseBounds.min_lat,
    responseBounds.maxLat ?? responseBounds.max_lat,
    responseBounds.minLon ?? responseBounds.min_lon,
    responseBounds.maxLon ?? responseBounds.max_lon
  ].map(finiteNumber);
  return actual.every((value) => value !== null)
    && expected.every((value, index) =>
      Math.abs(value - (actual[index] as number)) <= 0.00001
    );
}

export function mergeRiskZonesById(...zoneSets: ReadonlyArray<readonly RiskZone[]>): RiskZone[] {
  const byId = new Map<string, RiskZone>();
  for (const zone of zoneSets.flat()) {
    const existing = byId.get(zone.id);
    byId.set(zone.id, existing ? mergeRiskZone(existing, zone) : cloneRiskZone(zone));
  }
  return Array.from(byId.values());
}

export function canonicalAreaRiskZoneId(
  rawId: unknown,
  fallback: {
    coordinate: Coordinate;
    radiusMeters: number;
    severity: RiskSeverity;
    title: string;
  }
): string {
  const providerId = cleanOptionalText(rawId, 160);
  if (providerId) {
    const providerSlug = slugify(providerId).slice(0, 96) || 'zone';
    return providerSlug.startsWith('generated-area-risk-')
      ? providerSlug
      : `generated-area-risk-${providerSlug}`;
  }

  const titleSlug = slugify(fallback.title).slice(0, 44) || 'zone';
  const signature = [
    titleSlug,
    fallback.severity,
    fallback.coordinate.latitude.toFixed(5),
    fallback.coordinate.longitude.toFixed(5),
    Math.round(fallback.radiusMeters)
  ].join('|');
  return `generated-area-risk-${titleSlug}-${stableHash(signature)}`;
}

export function deriveRiskZoneAvoidRectangles(
  riskZones: readonly (RiskZone | AvoidanceRiskZone)[],
  {
    maxRectangles = 10,
    maxSpanKm = 160,
    paddingMeters = 140
  }: AreaRiskAvoidRectangleOptions = {}
): AreaRiskAvoidRectangle[] {
  const limit = clampInteger(maxRectangles, 0, 10, 10);
  const candidates = riskZones
    .filter((zone) => zone.severity === 'high' || zone.severity === 'critical')
    .flatMap((zone, index) => riskZoneToAvoidRectangles(zone, { maxSpanKm, paddingMeters }).map((rectangle) => ({
      index,
      rank: zone.severity === 'critical' ? 4 : 3,
      rectangle
    })))
    .sort((left, right) => right.rank - left.rank || left.index - right.index);
  const seen = new Set<string>();
  const rectangles: AreaRiskAvoidRectangle[] = [];

  for (const candidate of candidates) {
    const key = [
      candidate.rectangle.min_lat,
      candidate.rectangle.max_lat,
      candidate.rectangle.min_lon,
      candidate.rectangle.max_lon
    ].join(':');
    if (!seen.has(key)) {
      seen.add(key);
      rectangles.push(candidate.rectangle);
    }
    if (rectangles.length >= limit) {
      break;
    }
  }
  return rectangles;
}

export function riskZoneToAvoidRectangles(
  zone: RiskZone | AvoidanceRiskZone,
  {
    maxSpanKm = 160,
    paddingMeters = 140
  }: Omit<AreaRiskAvoidRectangleOptions, 'maxRectangles'> = {}
): AreaRiskAvoidRectangle[] {
  if (zone.severity !== 'high' && zone.severity !== 'critical') {
    return [];
  }

  const polygon = normalizeCoordinates(zone.polygonCoordinates);
  const isPolygon = polygon.length >= 3;
  const coordinates = isPolygon
    ? polygon
    : (isValidLatLon(zone.coordinate?.latitude, zone.coordinate?.longitude) ? [zone.coordinate] : []);
  if (!coordinates.length || coordinates.some(({ latitude }) => latitude < -80 || latitude > 80)) {
    return [];
  }

  const basePadding = clamp(positiveFiniteNumber(paddingMeters) ?? 140, 0, 5000);
  const radiusMeters = clamp(positiveFiniteNumber(zone.radiusMeters) ?? 0, 0, MAX_RADIUS_METERS);
  const totalPaddingMeters = isPolygon
    ? Math.max(basePadding, clamp(radiusMeters * 0.18, 0, 650))
    : radiusMeters + basePadding;
  const southCoordinate = Math.min(...coordinates.map(({ latitude }) => latitude));
  const northCoordinate = Math.max(...coordinates.map(({ latitude }) => latitude));
  const centerLatitude = (southCoordinate + northCoordinate) / 2;
  const latitudePadding = totalPaddingMeters / 110574;
  const longitudePadding = totalPaddingMeters /
    Math.max(1, 111320 * Math.abs(Math.cos(centerLatitude * Math.PI / 180)));
  const south = clamp(southCoordinate - latitudePadding, -80, 80);
  const north = clamp(northCoordinate + latitudePadding, -80, 80);
  const safeMaxSpanKm = clamp(positiveFiniteNumber(maxSpanKm) ?? 160, 1, 160);
  const label = cleanOptionalText(zone.title, 140);

  return longitudeRangesForPoints(
    coordinates.map(({ longitude }) => longitude),
    longitudePadding
  ).map((range): AreaRiskAvoidRectangle | null => {
    const rectangle: AreaRiskAvoidRectangle = {
      min_lat: roundCoordinate(south),
      max_lat: roundCoordinate(north),
      min_lon: roundCoordinate(range.west),
      max_lon: roundCoordinate(range.east),
      ...(label ? { label } : {})
    };
    return rectangle.max_lat > rectangle.min_lat &&
      rectangle.max_lon > rectangle.min_lon &&
      avoidRectangleSpanKm(rectangle) <= safeMaxSpanKm
      ? rectangle
      : null;
  }).filter((rectangle): rectangle is AreaRiskAvoidRectangle => rectangle !== null);
}

function normalizeAreaRiskItem(value: unknown, index: number, feedSource: string): RiskZone | null {
  const item = asRecord(value);
  if (!item) {
    return null;
  }

  const severity = normalizeSeverity(item.severity, item.riskScore ?? item.risk_score);
  const colors = severityColors[severity];
  const radiusMeters = normalizeRadius(item.radiusM ?? item.radius_m ?? item.radiusMeters);
  const coordinates = normalizeCoordinates(
    item.polygonCoordinates ??
      item.polygon_coordinates ??
      item.coordinates ??
      item.geometry ??
      item.geojson
  );
  const areaShape = cleanOptionalText(item.areaShape ?? item.area_shape, 32)?.toLowerCase();
  const polygonCoordinates = areaShape === 'polygon' || areaShape === 'rectangle' ||
    (!areaShape && coordinates.length >= 3)
    ? coordinates
    : [];
  const coordinate = normalizeCoordinate(item.coordinate) ??
    normalizeCoordinate(item.center) ??
    normalizeCoordinate(item) ??
    centroidCoordinate(coordinates);
  if (!coordinate) {
    return null;
  }

  const title = cleanText(item.label ?? item.title ?? item.name, `Area safety signal ${index + 1}`, 120);
  const source = cleanOptionalText(item.riskAreaSourceLabel ?? item.source, 160) ?? feedSource;
  const rawDescription = cleanOptionalText(item.notes ?? item.description ?? item.summary, 1000);
  const description = cleanText(
    [rawDescription, source ? `Source: ${source}.` : null].filter(Boolean).join(' '),
    'LunarChain area-risk intelligence.',
    1200
  );
  const id = canonicalAreaRiskZoneId(item.id ?? item.zone_key ?? item.zoneId, {
    coordinate,
    radiusMeters,
    severity,
    title
  });

  return {
    id,
    title,
    description,
    severity,
    category: 'Area Risk',
    coordinate,
    polygonCoordinates: polygonCoordinates.length >= 3 ? polygonCoordinates : undefined,
    shape: polygonCoordinates.length >= 3 ? 'polygon' : 'circle',
    radiusMeters,
    markerColor: colors.marker,
    strokeColor: colors.stroke,
    fillColor: colors.fill
  };
}

function mergeRiskZone(primary: RiskZone, incoming: RiskZone): RiskZone {
  const severity = severityRank(incoming.severity) > severityRank(primary.severity)
    ? incoming.severity
    : primary.severity;
  const colors = severityColors[severity];
  const primaryPolygon = primary.polygonCoordinates ?? [];
  const incomingPolygon = incoming.polygonCoordinates ?? [];
  const polygonCoordinates = incomingPolygon.length > primaryPolygon.length
    ? incomingPolygon
    : primaryPolygon;

  return {
    ...primary,
    description: primary.description.length >= incoming.description.length
      ? primary.description
      : incoming.description,
    severity,
    polygonCoordinates: polygonCoordinates.length >= 3 ? [...polygonCoordinates] : undefined,
    shape: polygonCoordinates.length >= 3 ? 'polygon' : primary.shape,
    radiusMeters: Math.max(primary.radiusMeters, incoming.radiusMeters),
    markerColor: colors.marker,
    strokeColor: colors.stroke,
    fillColor: colors.fill
  };
}

function cloneRiskZone(zone: RiskZone): RiskZone {
  return {
    ...zone,
    coordinate: { ...zone.coordinate },
    polygonCoordinates: zone.polygonCoordinates?.map((coordinate) => ({ ...coordinate }))
  };
}

function normalizeSeverity(value: unknown, scoreValue: unknown): RiskSeverity {
  const severity = cleanOptionalText(value, 32)?.toLowerCase();
  if (severity === 'critical' || severity === 'high') {
    return 'high';
  }
  if (severity === 'medium' || severity === 'low') {
    return severity;
  }
  const score = clamp(finiteNumber(scoreValue) ?? 45, 0, 100);
  if (score >= 65) {
    return 'high';
  }
  return score >= 35 ? 'medium' : 'low';
}

function normalizeRadius(value: unknown): number {
  return Math.round(clamp(finiteNumber(value) ?? DEFAULT_RADIUS_METERS, MIN_RADIUS_METERS, MAX_RADIUS_METERS));
}

function normalizeCoordinate(value: unknown): Coordinate | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const latitude = finiteNumber(record.latitude ?? record.lat);
  const longitude = finiteNumber(record.longitude ?? record.lon ?? record.lng);
  if (latitude === null || longitude === null || !isValidLatLon(latitude, longitude)) {
    return null;
  }
  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(longitude)
  };
}

function normalizeCoordinates(value: unknown): Coordinate[] {
  const candidates: Coordinate[] = [];
  collectCoordinates(value, candidates);
  const coordinates: Coordinate[] = [];
  for (const candidate of candidates.slice(0, MAX_COORDINATES_PER_ZONE)) {
    const previous = coordinates[coordinates.length - 1];
    if (!previous || previous.latitude !== candidate.latitude || previous.longitude !== candidate.longitude) {
      coordinates.push(candidate);
    }
  }
  if (coordinates.length > 3) {
    const first = coordinates[0];
    const last = coordinates[coordinates.length - 1];
    if (first.latitude === last.latitude && first.longitude === last.longitude) {
      coordinates.pop();
    }
  }
  return coordinates;
}

function collectCoordinates(value: unknown, output: Coordinate[]): void {
  if (output.length >= MAX_COORDINATES_PER_ZONE || value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    const tuple = coordinateFromTuple(value);
    if (tuple) {
      output.push(tuple);
      return;
    }
    for (const item of value) {
      collectCoordinates(item, output);
      if (output.length >= MAX_COORDINATES_PER_ZONE) {
        return;
      }
    }
    return;
  }

  const coordinate = normalizeCoordinate(value);
  if (coordinate) {
    output.push(coordinate);
    return;
  }
  const record = asRecord(value);
  if (record) {
    collectCoordinates(record.geometry ?? record.coordinates, output);
  }
}

function coordinateFromTuple(value: unknown[]): Coordinate | null {
  if (value.length < 2 || typeof value[0] === 'object' || typeof value[1] === 'object') {
    return null;
  }
  const longitude = finiteNumber(value[0]);
  const latitude = finiteNumber(value[1]);
  return latitude !== null && longitude !== null && isValidLatLon(latitude, longitude)
    ? { latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) }
    : null;
}

function centroidCoordinate(coordinates: Coordinate[]): Coordinate | null {
  if (!coordinates.length) {
    return null;
  }
  const latitude = coordinates.reduce((sum, coordinate) => sum + coordinate.latitude, 0) /
    coordinates.length;
  const longitudeRadians = coordinates.map(({ longitude }) => longitude * Math.PI / 180);
  const sinTotal = longitudeRadians.reduce((sum, longitude) => sum + Math.sin(longitude), 0);
  const cosTotal = longitudeRadians.reduce((sum, longitude) => sum + Math.cos(longitude), 0);
  return {
    latitude: roundCoordinate(latitude),
    longitude: roundCoordinate(Math.atan2(sinTotal, cosTotal) * 180 / Math.PI)
  };
}

function splitBoundsAtAntimeridian(bounds: AreaRiskBounds): AreaRiskBounds[] {
  const south = clamp(Math.min(bounds.south, bounds.north), -85, 85);
  const north = clamp(Math.max(bounds.south, bounds.north), -85, 85);
  if (north <= south) {
    return [];
  }
  if (Math.abs(bounds.east - bounds.west) >= 360 - 0.000001) {
    return [{ south, west: -180, north, east: 180 }];
  }

  const west = roundCoordinate(wrapLongitude(bounds.west));
  const east = roundCoordinate(wrapLongitude(bounds.east));
  if (west < east) {
    return [{ south, west, north, east }];
  }
  if (west > east) {
    return [
      { south, west, north, east: 180 },
      { south, west: -180, north, east }
    ].filter((part) => part.east > part.west);
  }
  return [];
}

function normalizeNonCrossingBounds(bounds: AreaRiskBounds): AreaRiskBounds | null {
  const parts = splitBoundsAtAntimeridian(bounds);
  return parts.length === 1 ? parts[0] : null;
}

function formatBbox(bounds: AreaRiskBounds): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east]
    .map((value) => roundCoordinate(value).toFixed(5))
    .join(',');
}

function longitudeRangesForPoints(
  longitudes: number[],
  paddingDegrees: number
): Array<{ west: number; east: number }> {
  const normalized = longitudes.map(wrapLongitude);
  if (!normalized.length) {
    return [];
  }
  const plainWest = Math.min(...normalized);
  const plainEast = Math.max(...normalized);
  const shifted = normalized.map((longitude) => longitude < 0 ? longitude + 360 : longitude);
  const shiftedWest = Math.min(...shifted);
  const shiftedEast = Math.max(...shifted);

  let paddedWest = (plainEast - plainWest <= shiftedEast - shiftedWest ? plainWest : shiftedWest) -
    paddingDegrees;
  let paddedEast = (plainEast - plainWest <= shiftedEast - shiftedWest ? plainEast : shiftedEast) +
    paddingDegrees;
  if (paddedEast - paddedWest >= 360) {
    return [];
  }
  while (paddedWest < -180) {
    paddedWest += 360;
    paddedEast += 360;
  }
  while (paddedWest >= 180) {
    paddedWest -= 360;
    paddedEast -= 360;
  }
  if (paddedEast <= 180) {
    return [{ west: paddedWest, east: paddedEast }].filter((range) => range.east > range.west);
  }
  return [
    { west: paddedWest, east: 180 },
    { west: -180, east: paddedEast - 360 }
  ].filter((range) => range.east > range.west);
}

function avoidRectangleSpanKm(rectangle: AreaRiskAvoidRectangle): number {
  const centerLatitude = (rectangle.min_lat + rectangle.max_lat) / 2;
  const latitudeSpanKm = (rectangle.max_lat - rectangle.min_lat) * 111.32;
  const longitudeSpanKm = (rectangle.max_lon - rectangle.min_lon) * 111.32 *
    Math.max(0.05, Math.abs(Math.cos(centerLatitude * Math.PI / 180)));
  return Math.max(latitudeSpanKm, longitudeSpanKm);
}

function normalizeScope(value: unknown, zoom: number): AreaRiskScope {
  return value === 'global' || value === 'regional' || value === 'detail'
    ? value
    : (zoom < 4 ? 'global' : (zoom < 9 ? 'regional' : 'detail'));
}

function normalizeCountryHints(value: unknown): string[] {
  const countries = asArray(value)
    .map((country) => cleanOptionalText(country, 80))
    .filter((country): country is string => Boolean(country));
  return Array.from(new Map(countries.map((country) => [country.toLowerCase(), country])).values()).slice(0, 12);
}

function quantizedValue(value: unknown, quantum: number): string {
  const numeric = finiteNumber(value) ?? 0;
  const quantized = Math.round(numeric / quantum) * quantum;
  const normalized = Object.is(quantized, -0) ? 0 : quantized;
  const decimals = Math.min(6, Math.max(1, Math.ceil(-Math.log10(quantum)) + 1));
  return normalized.toFixed(decimals);
}

function quantizedNumber(value: unknown, quantum: number): number {
  return Number(quantizedValue(value, quantum));
}

function floorToQuantum(value: number, quantum: number): number {
  return roundCoordinate(Math.floor(value / quantum) * quantum);
}

function ceilToQuantum(value: number, quantum: number): number {
  return roundCoordinate(Math.ceil(value / quantum) * quantum);
}

function unwrapDataEnvelope(value: unknown): unknown {
  const record = asRecord(value);
  return record && Object.prototype.hasOwnProperty.call(record, 'data') ? record.data : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanText(value: unknown, fallback: string, maxLength: number): string {
  return cleanOptionalText(value, maxLength) ?? fallback;
}

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return null;
  }
  const cleaned = String(value).trim().replace(/\s+/g, ' ');
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function severityRank(severity: RiskSeverity): number {
  return severity === 'high' ? 3 : (severity === 'medium' ? 2 : 1);
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function wrapLongitude(value: number): number {
  if (Math.abs(value - 180) < 0.000001) {
    return 180;
  }
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function roundCoordinate(value: number): number {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function isValidLatLon(latitude: unknown, longitude: unknown): boolean {
  const lat = finiteNumber(latitude);
  const lon = finiteNumber(longitude);
  return lat !== null && lon !== null && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function positiveFiniteNumber(value: unknown): number | null {
  const numeric = finiteNumber(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = finiteNumber(value);
  return Math.max(minimum, Math.min(maximum, Math.trunc(numeric ?? fallback)));
}

function nonNegativeIntegerOrNull(value: unknown): number | null {
  const numeric = finiteNumber(value);
  return numeric === null || numeric < 0 ? null : Math.trunc(numeric);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
