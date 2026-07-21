import type { LatLng, Region } from 'react-native-maps';

import type {
  RiskSeverity,
  RiskZone,
  RouteCheckpoint,
  SavedSafeRoutePlan
} from '../live-map/liveMapTypes';
import {
  deriveRouteNavigationSteps,
  normalizeRouteNavigationSteps
} from '../live-map/routeGuidance';
import {
  clampNumber,
  formatDistance,
  formatEta,
  formatUpdatedAt,
  normalizeEnumToken,
  normalizeRiskLevel,
  normalizeRouteColor,
  normalizeSeverity,
  normalizeStatus,
  toArray,
  toFiniteNumber,
  toMutedRouteColor,
  toTitleCase
} from './routeMapperNormalization';

export { formatDistance, formatEta } from './routeMapperNormalization';

export interface MobileSafeRouteClient {
  id: string;
  name: string;
}

interface MobileEndpointDto {
  label?: string;
  coordinate?: LatLng | null;
}

interface MobileRoutePathDto {
  id?: string;
  label?: string;
  color?: string;
  coordinates?: unknown;
  distance_meters?: number;
  distance_label?: string;
  eta_seconds?: number | null;
  eta_label?: string | null;
  risk_score?: number;
  risk_level?: string;
  description?: string;
  next_instruction?: string;
  next_distance_meters?: number | null;
  guidance_steps?: unknown;
  navigation_steps?: unknown;
}

interface MobileRiskOverlayDto {
  id?: string;
  title?: string;
  description?: string;
  severity?: string;
  category?: string;
  shape?: string;
  area_shape?: string;
  areaShape?: string;
  coordinate?: unknown;
  center?: unknown;
  geometry?: unknown;
  geojson?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  lat?: unknown;
  lon?: unknown;
  lng?: unknown;
  coordinates?: unknown;
  polygon_coordinates?: unknown;
  polygonCoordinates?: unknown;
  route_segment_coordinates?: unknown;
  routeSegmentCoordinates?: unknown;
  connector_coordinates?: unknown;
  connectorCoordinates?: unknown;
  radius_meters?: number;
  radius_m?: number;
  radiusMeters?: number;
}

interface MobileCheckpointDto {
  id?: string;
  label?: string;
  caption?: string;
  coordinate?: LatLng | null;
  kind?: string;
}

interface MobileWaypointDto extends MobileCheckpointDto {
  label?: string;
}

export interface MobileSafeRouteDto {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  mobile_status?: string;
  client?: MobileSafeRouteClient;
  client_id?: string;
  client_name?: string;
  operation?: string;
  convoy_callsign?: string;
  updated_at?: string | null;
  origin?: MobileEndpointDto;
  destination?: MobileEndpointDto;
  route?: MobileRoutePathDto;
  risk_overlays?: MobileRiskOverlayDto[];
  route_alerts?: MobileRiskOverlayDto[];
  alerts?: MobileRiskOverlayDto[];
  checkpoints?: MobileCheckpointDto[];
  waypoints?: MobileWaypointDto[];
}

export interface MobileRouteListResponse {
  clients: MobileSafeRouteClient[];
  routes: MobileSafeRouteDto[];
  selected_client_id?: string | null;
}

const DEFAULT_REGION: Region = {
  latitude: 51.5072,
  longitude: -0.1276,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08
};

const DEFAULT_RISK_RADIUS_METERS = 250;
const MAX_RISK_RADIUS_METERS = 10000;

const severityColors: Record<RiskSeverity, { marker: string; stroke: string; fill: string }> = {
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

export function mapRouteDtoToSavedPlan(dto: MobileSafeRouteDto): SavedSafeRoutePlan {
  const route = dto.route || {};
  const originCoordinate = normalizeCoordinate(dto.origin?.coordinate);
  const destinationCoordinate = normalizeCoordinate(dto.destination?.coordinate);
  const routeCoordinates = normalizeCoordinates(route.coordinates);
  const coordinates = routeCoordinates.length >= 2
    ? routeCoordinates
    : [originCoordinate, destinationCoordinate].filter((coordinate): coordinate is LatLng => Boolean(coordinate));
  const safeScore = clampNumber(route.risk_score ?? 0, 0, 100);
  const riskLevel = normalizeRiskLevel(route.risk_level, safeScore);
  const color = normalizeRouteColor(route.color, riskLevel);

  return {
    id: cleanText(dto.id, 'safe-route-plan'),
    ...(firstCleanText(dto.client_id, dto.client?.id, '')
      ? { clientId: firstCleanText(dto.client_id, dto.client?.id, '') }
      : {}),
    name: cleanText(dto.name, 'SafeRoute plan'),
    operation: firstCleanText(dto.operation, dto.client_name, dto.client?.name, 'SafeRoute plan'),
    status: normalizeStatus(dto.mobile_status || dto.status),
    convoyCallsign: cleanText(dto.convoy_callsign, 'Convoy'),
    updatedAtLabel: formatUpdatedAt(dto.updated_at),
    origin: cleanText(dto.origin?.label, 'Origin'),
    destination: cleanText(dto.destination?.label, 'Destination'),
    region: buildRegion(coordinates),
    route: {
      id: firstCleanText(route.id, dto.id, 'primary'),
      label: cleanText(route.label, 'Primary route'),
      eta: cleanText(route.eta_label, formatEta(route.eta_seconds)),
      distance: cleanText(route.distance_label, formatDistance(toFiniteNumber(route.distance_meters, 0))),
      safeScore,
      riskLabel: toTitleCase(riskLevel),
      tone: riskLevel === 'high' || safeScore >= 65 ? 'amber' : riskLevel === 'medium' ? 'blue' : 'safe',
      color,
      mutedColor: toMutedRouteColor(color),
      description: firstCleanText(route.description, dto.description, 'Follow the saved SafeRoute geometry with live position guidance.'),
      nextInstruction: cleanText(route.next_instruction, 'Continue on saved route'),
      nextDistance: formatDistance(toFiniteNumber(route.next_distance_meters, 0)),
      coordinates,
      navigationSteps: (() => {
        const providerSteps = normalizeRouteNavigationSteps(
          route.guidance_steps ?? route.navigation_steps
        );
        return providerSteps.length
          ? providerSteps
          : deriveRouteNavigationSteps(coordinates);
      })()
    },
    riskZones: mapRiskOverlays(dto),
    checkpoints: mapCheckpoints(
      preferredCheckpointDtos(dto.checkpoints, dto.waypoints),
      dto.origin,
      dto.destination,
      coordinates
    )
  };
}

function preferredCheckpointDtos(
  checkpoints: MobileCheckpointDto[] | undefined,
  waypoints: MobileWaypointDto[] | undefined
): MobileCheckpointDto[] {
  const normalizedWaypoints = toArray<MobileWaypointDto>(waypoints);
  const hasIntermediateWaypoint = normalizedWaypoints.some((waypoint) => {
    const kind = String(waypoint.kind || '').trim().toLowerCase();
    return kind === 'checkpoint' || kind === 'stop' || kind === 'waypoint' || kind === 'via';
  });
  return hasIntermediateWaypoint
    ? normalizedWaypoints.map((waypoint) => ({
        ...waypoint,
        caption: waypoint.caption || waypoint.label
      }))
    : toArray<MobileCheckpointDto>(checkpoints);
}

export function normalizeMobileClients(clients: unknown): MobileSafeRouteClient[] {
  if (!Array.isArray(clients)) {
    return [];
  }

  const seenClientIds = new Set<string>();
  const normalizedClients: MobileSafeRouteClient[] = [];

  for (const client of clients) {
    if (!client || typeof client !== 'object') {
      continue;
    }

    const record = client as { id?: unknown; name?: unknown };
    const id = cleanText(record.id, '');
    if (!id || seenClientIds.has(id)) {
      continue;
    }

    seenClientIds.add(id);
    normalizedClients.push({
      id,
      name: cleanText(record.name, 'Client')
    });
  }

  return normalizedClients;
}

function normalizeCoordinates(coordinates: unknown): LatLng[] {
  return coordinateCandidatesFrom(coordinates)
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is LatLng => Boolean(coordinate));
}

function normalizeCoordinate(coordinate?: unknown): LatLng | null {
  if (!coordinate) {
    return null;
  }

  if (Array.isArray(coordinate)) {
    return normalizeCoordinateTuple(coordinate);
  }

  if (typeof coordinate !== 'object') {
    return null;
  }

  const coordinateRecord = coordinate as Record<string, unknown>;
  if (
    !hasCoordinateFields(coordinateRecord) &&
    Array.isArray(coordinateRecord.coordinates)
  ) {
    return normalizeCoordinate(coordinateRecord.coordinates);
  }

  const latitude = Number(coordinateRecord.latitude ?? coordinateRecord.lat);
  const longitude = Number(
    coordinateRecord.longitude ?? coordinateRecord.lon ?? coordinateRecord.lng
  );
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function normalizeCoordinateTuple(coordinate: unknown[]): LatLng | null {
  if (coordinate.length < 2) {
    return null;
  }

  const longitude = Number(coordinate[0]);
  const latitude = Number(coordinate[1]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function coordinateCandidatesFrom(value: unknown): unknown[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    if (isCoordinateTuple(value)) {
      return [value];
    }

    return value.flatMap((entry) => coordinateCandidatesFrom(entry));
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (hasCoordinateFields(record)) {
      return [record];
    }

    if (record.geometry) {
      return coordinateCandidatesFrom(record.geometry);
    }

    if (record.geojson) {
      return coordinateCandidatesFrom(record.geojson);
    }

    if (record.center) {
      return coordinateCandidatesFrom(record.center);
    }

    if (record.type === 'Feature' && record.properties) {
      return coordinateCandidatesFrom(record.geometry);
    }

    if (Array.isArray(record.coordinates)) {
      return coordinateCandidatesFrom(record.coordinates);
    }
  }

  return [];
}

function isCoordinateTuple(value: unknown[]): boolean {
  return value.length >= 2 &&
    typeof value[0] !== 'object' &&
    typeof value[1] !== 'object';
}

function hasCoordinateFields(record: Record<string, unknown>): boolean {
  return (
    (record.latitude !== undefined || record.lat !== undefined) &&
    (
      record.longitude !== undefined ||
      record.lon !== undefined ||
      record.lng !== undefined
    )
  );
}

function mapRiskOverlays(dto: MobileSafeRouteDto): RiskZone[] {
  const overlays = [
    ...toArray<MobileRiskOverlayDto>(dto.route_alerts),
    ...toArray<MobileRiskOverlayDto>(dto.alerts),
    ...toArray<MobileRiskOverlayDto>(dto.risk_overlays)
  ];
  return mapMobileRiskOverlays(overlays);
}

export function mapMobileRiskOverlays(value: unknown): RiskZone[] {
  const mapped = toArray<MobileRiskOverlayDto>(value)
    .map(mapRiskOverlay)
    .filter((zone): zone is RiskZone => Boolean(zone));
  const zonesById = new Map<string, RiskZone>();

  for (const zone of mapped) {
    const existing = zonesById.get(zone.id);
    if (!existing) {
      zonesById.set(zone.id, zone);
      continue;
    }

    zonesById.set(zone.id, mergeRiskZones(existing, zone));
  }

  return Array.from(zonesById.values());
}

function mergeRiskZones(primary: RiskZone, incoming: RiskZone): RiskZone {
  const severity = severityRank(incoming.severity) > severityRank(primary.severity)
    ? incoming.severity
    : primary.severity;
  const colors = severityColors[severity];

  return {
    ...primary,
    description: preferSpecificCopy(primary.description, incoming.description, 'SafeRoute risk note'),
    severity,
    ...(primary.avoidanceSeverity === 'critical' || incoming.avoidanceSeverity === 'critical'
      ? { avoidanceSeverity: 'critical' as const }
      : {}),
    category: preferSpecificCopy(primary.category, incoming.category, 'Risk'),
    coordinate: primary.coordinate || incoming.coordinate,
    routeSegmentCoordinates: hasMultipleCoordinates(primary.routeSegmentCoordinates)
      ? primary.routeSegmentCoordinates
      : incoming.routeSegmentCoordinates,
    connectorCoordinates: hasMultipleCoordinates(primary.connectorCoordinates)
      ? primary.connectorCoordinates
      : incoming.connectorCoordinates,
    polygonCoordinates: hasMultipleCoordinates(primary.polygonCoordinates)
      ? primary.polygonCoordinates
      : incoming.polygonCoordinates,
    shape: primary.shape || incoming.shape,
    radiusMeters: Math.max(primary.radiusMeters || 0, incoming.radiusMeters || 0),
    markerColor: colors.marker,
    strokeColor: colors.stroke,
    fillColor: colors.fill
  };
}

function hasMultipleCoordinates(coordinates: LatLng[] | undefined): boolean {
  return Boolean(coordinates && coordinates.length > 1);
}

function preferSpecificCopy(primary: string, incoming: string, fallback: string): string {
  const normalizedPrimary = primary.trim();
  const normalizedIncoming = incoming.trim();
  if (normalizedPrimary && normalizedPrimary !== fallback) {
    return normalizedPrimary;
  }

  return normalizedIncoming || normalizedPrimary || fallback;
}

function severityRank(severity: RiskSeverity): number {
  if (severity === 'high') {
    return 3;
  }

  if (severity === 'medium') {
    return 2;
  }

  return 1;
}

function mapRiskOverlay(overlay: MobileRiskOverlayDto): RiskZone | null {
  const severity = normalizeSeverity(overlay.severity);
  const isCriticalAvoidance = normalizeEnumToken(overlay.severity) === 'critical';
  const colors = severityColors[severity];
  const category = cleanText(overlay.category, 'Risk').replace(/[-_]+/g, ' ');
  const title = cleanText(overlay.title, 'Route risk');
  const explicitPolygonCoordinates = firstCoordinateList(
    overlay.polygon_coordinates,
    overlay.polygonCoordinates
  );
  const explicitRouteSegmentCoordinates = firstCoordinateList(
    overlay.route_segment_coordinates,
    overlay.routeSegmentCoordinates
  );
  const overlayCoordinates = firstCoordinateList(
    overlay.coordinates,
    overlay.geometry,
    overlay.geojson
  );
  const normalizedShape = normalizeEnumToken(overlay.shape);
  const normalizedAreaShape = normalizeEnumToken(firstNonEmptyString(overlay.area_shape, overlay.areaShape));
  const normalizedGeometryShape = normalizeEnumToken(
    geometryType(overlay.geometry) || geometryType(overlay.geojson)
  );
  const isStructureSightline = normalizeEnumToken(overlay.category) === 'structure-exposure' ||
    normalizedShape === 'sightline';
  const polygonCandidateCoordinates = explicitPolygonCoordinates.length
    ? explicitPolygonCoordinates
    : overlayCoordinates;
  const polygonCoordinates = shouldTreatOverlayAsPolygon(
    polygonCandidateCoordinates,
    normalizedShape,
    normalizedAreaShape,
    normalizedGeometryShape,
    explicitPolygonCoordinates.length > 0
  )
    ? polygonCandidateCoordinates
    : [];
  const coordinate = normalizeCoordinate(overlay.coordinate) ||
    normalizeCoordinate(overlay.center) ||
    normalizeCoordinate(overlay) ||
    deriveRiskOverlayCoordinate(
      polygonCoordinates,
      overlayCoordinates,
      explicitRouteSegmentCoordinates
    );
  if (!coordinate) {
    return null;
  }

  const routeSegmentCoordinates = explicitRouteSegmentCoordinates.length
    ? explicitRouteSegmentCoordinates
    : !polygonCoordinates.length && (isStructureSightline || shouldTreatOverlayAsRouteSegment(overlayCoordinates, normalizedShape))
      ? overlayCoordinates
      : [];
  return {
    id: cleanText(overlay.id, `${title}-${coordinate.latitude}-${coordinate.longitude}`),
    title,
    description: cleanText(overlay.description, 'SafeRoute risk note'),
    severity,
    ...(isCriticalAvoidance ? { avoidanceSeverity: 'critical' as const } : {}),
    category: toTitleCase(category),
    coordinate,
    routeSegmentCoordinates,
    connectorCoordinates: isStructureSightline
      ? firstCoordinateList(overlay.connector_coordinates, overlay.connectorCoordinates)
      : [],
    polygonCoordinates,
    shape: cleanOptionalText(overlay.shape) || undefined,
    radiusMeters: normalizeRiskRadiusMeters(overlay.radius_meters ?? overlay.radius_m ?? overlay.radiusMeters),
    markerColor: colors.marker,
    strokeColor: colors.stroke,
    fillColor: colors.fill
  };
}

function normalizeRiskRadiusMeters(value: unknown): number {
  if (typeof value === 'string' && !value.trim()) {
    return DEFAULT_RISK_RADIUS_METERS;
  }

  const radiusMeters = toFiniteNumber(value, DEFAULT_RISK_RADIUS_METERS);

  if (radiusMeters < 0) {
    return DEFAULT_RISK_RADIUS_METERS;
  }

  return Math.min(radiusMeters, MAX_RISK_RADIUS_METERS);
}

function firstCoordinateList(...values: unknown[]): LatLng[] {
  for (const value of values) {
    const coordinates = normalizeCoordinates(value);
    if (coordinates.length) {
      return coordinates;
    }
  }

  return [];
}

function shouldTreatOverlayAsPolygon(
  coordinates: LatLng[],
  normalizedShape: string,
  normalizedAreaShape = '',
  normalizedGeometryShape = '',
  explicitPolygonCoordinates = false
): boolean {
  if (coordinates.length < 3) {
    return false;
  }

  if (
    explicitPolygonCoordinates ||
    normalizedShape === 'polygon' ||
    normalizedShape === 'area' ||
    normalizedShape === 'risk-area' ||
    normalizedShape === 'hot-zone' ||
    normalizedShape === 'geofence' ||
    normalizedGeometryShape === 'polygon' ||
    normalizedGeometryShape === 'multi-polygon' ||
    normalizedAreaShape === 'polygon' ||
    normalizedAreaShape === 'rectangle'
  ) {
    return true;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return Boolean(first && last && first.latitude === last.latitude && first.longitude === last.longitude);
}

function shouldTreatOverlayAsRouteSegment(coordinates: LatLng[], normalizedShape: string): boolean {
  return coordinates.length > 1 &&
    normalizedShape !== 'polygon' &&
    normalizedShape !== 'area' &&
    normalizedShape !== 'risk-area' &&
    normalizedShape !== 'hot-zone' &&
    normalizedShape !== 'geofence';
}

function geometryType(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  return typeof record.type === 'string' ? record.type : undefined;
}

function deriveRiskOverlayCoordinate(
  polygonCoordinates: LatLng[],
  overlayCoordinates: LatLng[],
  routeSegmentCoordinates: LatLng[] = []
): LatLng | null {
  if (polygonCoordinates.length >= 3) {
    return centroidCoordinate(polygonCoordinates);
  }

  if (routeSegmentCoordinates.length) {
    return centroidCoordinate(routeSegmentCoordinates);
  }

  return overlayCoordinates[0] || null;
}

function centroidCoordinate(coordinates: LatLng[]): LatLng | null {
  const uniqueCoordinates = withoutClosingDuplicate(coordinates);
  if (!uniqueCoordinates.length) {
    return null;
  }

  const totals = uniqueCoordinates.reduce(
    (sum, coordinate) => ({
      latitude: sum.latitude + coordinate.latitude,
      longitude: sum.longitude + coordinate.longitude
    }),
    { latitude: 0, longitude: 0 }
  );

  return {
    latitude: totals.latitude / uniqueCoordinates.length,
    longitude: totals.longitude / uniqueCoordinates.length
  };
}

function withoutClosingDuplicate(coordinates: LatLng[]): LatLng[] {
  if (coordinates.length < 2) {
    return coordinates;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first.latitude !== last.latitude || first.longitude !== last.longitude) {
    return coordinates;
  }

  return coordinates.slice(0, -1);
}

function firstNonEmptyString(...values: Array<string | undefined>): string {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0) || '';
}

function mapCheckpoints(
  checkpoints: MobileCheckpointDto[],
  origin: MobileEndpointDto | undefined,
  destination: MobileEndpointDto | undefined,
  coordinates: LatLng[]
): RouteCheckpoint[] {
  const mapped = checkpoints
    .map((checkpoint) => {
      const coordinate = normalizeCoordinate(checkpoint.coordinate);
      if (!coordinate) {
        return null;
      }
      const kind = checkpointKind(checkpoint.kind);
      return {
        id: firstCleanText(checkpoint.id, checkpoint.kind, checkpoint.label, 'checkpoint'),
        label: cleanText(checkpoint.label, checkpointLabelForKind(kind)),
        caption: firstCleanText(checkpoint.caption, checkpoint.kind, 'Checkpoint'),
        coordinate,
        kind
      };
    })
    .filter((checkpoint): checkpoint is RouteCheckpoint => Boolean(checkpoint));

  if (mapped.length) {
    return mapped;
  }

  const originCoordinate = normalizeCoordinate(origin?.coordinate) || coordinates[0];
  const destinationCoordinate = normalizeCoordinate(destination?.coordinate) || coordinates[coordinates.length - 1];
  const fallbackCheckpoints: Array<RouteCheckpoint | null> = [
    originCoordinate
      ? {
          id: 'origin',
          label: 'A',
          caption: cleanText(origin?.label, 'Origin'),
          coordinate: originCoordinate,
          kind: 'origin' as const
        }
      : null,
    destinationCoordinate
      ? {
          id: 'destination',
          label: 'B',
          caption: cleanText(destination?.label, 'Destination'),
          coordinate: destinationCoordinate,
          kind: 'destination' as const
      }
      : null
  ];

  return fallbackCheckpoints.filter((checkpoint): checkpoint is RouteCheckpoint => Boolean(checkpoint));
}

function checkpointKind(kind: string | undefined): RouteCheckpoint['kind'] {
  const normalizedKind = String(kind || '').trim().toLowerCase();

  if (normalizedKind === 'destination') {
    return 'destination';
  }

  if (
    normalizedKind === 'waypoint' ||
    normalizedKind === 'checkpoint' ||
    normalizedKind === 'stop' ||
    normalizedKind === 'via'
  ) {
    return 'waypoint';
  }

  return 'origin';
}

function checkpointLabelForKind(kind: RouteCheckpoint['kind']): string {
  if (kind === 'destination') {
    return 'B';
  }

  if (kind === 'waypoint') {
    return 'Stop';
  }

  return 'A';
}

function buildRegion(coordinates: LatLng[]): Region {
  if (!coordinates.length) {
    return DEFAULT_REGION;
  }

  const latitudes = coordinates.map((coordinate) => coordinate.latitude);
  const longitudes = coordinates.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max(0.018, (maxLatitude - minLatitude) * 1.6),
    longitudeDelta: Math.max(0.018, (maxLongitude - minLongitude) * 1.6)
  };
}

function cleanText(value: unknown, fallback: string): string {
  const normalized = cleanOptionalText(value);
  return normalized || fallback;
}

function firstCleanText(...values: unknown[]): string {
  for (let index = 0; index < values.length; index += 1) {
    const normalized = cleanOptionalText(values[index]);
    if (normalized) {
      return normalized;
    }
  }

  const fallback = values[values.length - 1];
  return typeof fallback === 'string' ? fallback : '';
}

function cleanOptionalText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  return String(value).trim();
}
