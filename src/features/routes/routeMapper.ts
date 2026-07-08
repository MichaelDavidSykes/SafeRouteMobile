import type { LatLng, Region } from 'react-native-maps';

import type {
  RiskSeverity,
  RiskZone,
  RouteCheckpoint,
  SavedSafeRoutePlan
} from '../live-map/liveMapTypes';
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
  coordinates?: LatLng[];
  distance_meters?: number;
  distance_label?: string;
  eta_seconds?: number | null;
  eta_label?: string | null;
  risk_score?: number;
  risk_level?: string;
  description?: string;
  next_instruction?: string;
  next_distance_meters?: number | null;
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
  coordinate?: LatLng | null;
  coordinates?: LatLng[];
  connector_coordinates?: LatLng[];
  radius_meters?: number;
}

interface MobileCheckpointDto {
  id?: string;
  label?: string;
  caption?: string;
  coordinate?: LatLng | null;
  kind?: string;
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
  checkpoints?: MobileCheckpointDto[];
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
    id: String(dto.id || ''),
    name: dto.name || 'SafeRoute plan',
    operation: dto.operation || dto.client_name || dto.client?.name || 'SafeRoute plan',
    status: normalizeStatus(dto.mobile_status || dto.status),
    convoyCallsign: dto.convoy_callsign || 'Convoy',
    updatedAtLabel: formatUpdatedAt(dto.updated_at),
    origin: dto.origin?.label || 'Origin',
    destination: dto.destination?.label || 'Destination',
    region: buildRegion(coordinates),
    route: {
      id: route.id || dto.id || 'primary',
      label: route.label || 'Primary route',
      eta: route.eta_label || formatEta(route.eta_seconds),
      distance: route.distance_label || formatDistance(toFiniteNumber(route.distance_meters, 0)),
      safeScore,
      riskLabel: toTitleCase(riskLevel),
      tone: riskLevel === 'high' || safeScore >= 65 ? 'amber' : riskLevel === 'medium' ? 'blue' : 'safe',
      color,
      mutedColor: toMutedRouteColor(color),
      description: route.description || dto.description || 'Follow the saved SafeRoute geometry with live position guidance.',
      nextInstruction: route.next_instruction || 'Continue on saved route',
      nextDistance: formatDistance(toFiniteNumber(route.next_distance_meters, 0)),
      coordinates
    },
    riskZones: toArray<MobileRiskOverlayDto>(dto.risk_overlays).map(mapRiskOverlay).filter((zone): zone is RiskZone => Boolean(zone)),
    checkpoints: mapCheckpoints(toArray<MobileCheckpointDto>(dto.checkpoints), dto.origin, dto.destination, coordinates)
  };
}

function normalizeCoordinates(coordinates: unknown): LatLng[] {
  return toArray<LatLng>(coordinates).map(normalizeCoordinate).filter((coordinate): coordinate is LatLng => Boolean(coordinate));
}

function normalizeCoordinate(coordinate?: LatLng | null): LatLng | null {
  if (!coordinate) {
    return null;
  }

  const latitude = Number(coordinate.latitude);
  const longitude = Number(coordinate.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return { latitude, longitude };
}

function mapRiskOverlay(overlay: MobileRiskOverlayDto): RiskZone | null {
  const severity = normalizeSeverity(overlay.severity);
  const colors = severityColors[severity];
  const category = String(overlay.category || 'Risk').replace(/[-_]+/g, ' ');
  const overlayCoordinates = normalizeCoordinates(overlay.coordinates);
  const normalizedShape = normalizeEnumToken(overlay.shape);
  const normalizedAreaShape = normalizeEnumToken(firstNonEmptyString(overlay.area_shape, overlay.areaShape));
  const isStructureSightline = normalizeEnumToken(overlay.category) === 'structure-exposure' ||
    normalizedShape === 'sightline';
  const polygonCoordinates = shouldTreatOverlayAsPolygon(overlayCoordinates, normalizedShape, normalizedAreaShape)
    ? overlayCoordinates
    : [];
  const coordinate = normalizeCoordinate(overlay.coordinate) ||
    deriveRiskOverlayCoordinate(polygonCoordinates, overlayCoordinates);
  if (!coordinate) {
    return null;
  }

  const routeSegmentCoordinates = !polygonCoordinates.length && (isStructureSightline || overlayCoordinates.length > 1)
    ? overlayCoordinates
    : [];
  return {
    id: overlay.id || `${overlay.title || 'risk'}-${coordinate.latitude}-${coordinate.longitude}`,
    title: overlay.title || 'Route risk',
    description: overlay.description || 'SafeRoute risk note',
    severity,
    category: toTitleCase(category),
    coordinate,
    routeSegmentCoordinates,
    connectorCoordinates: isStructureSightline ? normalizeCoordinates(overlay.connector_coordinates) : [],
    polygonCoordinates,
    shape: overlay.shape,
    radiusMeters: toFiniteNumber(overlay.radius_meters, 250),
    markerColor: colors.marker,
    strokeColor: colors.stroke,
    fillColor: colors.fill
  };
}

function shouldTreatOverlayAsPolygon(
  coordinates: LatLng[],
  normalizedShape: string,
  normalizedAreaShape = ''
): boolean {
  if (coordinates.length < 3) {
    return false;
  }

  if (
    normalizedShape === 'polygon' ||
    normalizedShape === 'area' ||
    normalizedShape === 'risk-area' ||
    normalizedShape === 'hot-zone' ||
    normalizedShape === 'geofence' ||
    normalizedAreaShape === 'polygon' ||
    normalizedAreaShape === 'rectangle'
  ) {
    return true;
  }

  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  return Boolean(first && last && first.latitude === last.latitude && first.longitude === last.longitude);
}

function deriveRiskOverlayCoordinate(polygonCoordinates: LatLng[], overlayCoordinates: LatLng[]): LatLng | null {
  if (polygonCoordinates.length >= 3) {
    return centroidCoordinate(polygonCoordinates);
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
      return {
        id: checkpoint.id || checkpoint.kind || checkpoint.label || 'checkpoint',
        label: checkpoint.label || (checkpoint.kind === 'destination' ? 'B' : 'A'),
        caption: checkpoint.caption || checkpoint.kind || 'Checkpoint',
        coordinate,
        kind: checkpoint.kind === 'destination' ? 'destination' as const : 'origin' as const
      };
    })
    .filter((checkpoint): checkpoint is RouteCheckpoint => Boolean(checkpoint));

  if (mapped.length) {
    return mapped;
  }

  const originCoordinate = normalizeCoordinate(origin?.coordinate) || coordinates[0];
  const destinationCoordinate = normalizeCoordinate(destination?.coordinate) || coordinates[coordinates.length - 1];
  return [
    originCoordinate
      ? {
          id: 'origin',
          label: 'A',
          caption: origin?.label || 'Origin',
          coordinate: originCoordinate,
          kind: 'origin' as const
        }
      : null,
    destinationCoordinate
      ? {
          id: 'destination',
          label: 'B',
          caption: destination?.label || 'Destination',
          coordinate: destinationCoordinate,
          kind: 'destination' as const
        }
      : null
  ].filter((checkpoint): checkpoint is RouteCheckpoint => Boolean(checkpoint));
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
