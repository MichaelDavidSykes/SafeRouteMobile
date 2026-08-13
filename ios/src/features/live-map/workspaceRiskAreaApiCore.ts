import type { Region } from 'react-native-maps';

import { mapMobileRiskOverlays } from '../routes/routeMapper';
import {
  areaRiskItemIntersectsBounds,
  regionToAreaRiskViewportRequests
} from './areaRiskApiCore';
import type { RiskZone } from './liveMapTypes';

export const WORKSPACE_RISK_AREA_ENDPOINT_PATH =
  '/convoy-routes/risk-markers/client';
export const MAX_VISIBLE_WORKSPACE_RISK_AREAS = 80;

interface WorkspaceRiskAreaRecord {
  _id?: unknown;
  area_shape?: unknown;
  category?: unknown;
  client_id?: unknown;
  coordinates?: unknown;
  id?: unknown;
  is_active?: unknown;
  label?: unknown;
  lat?: unknown;
  lon?: unknown;
  notes?: unknown;
  radius_m?: unknown;
  severity?: unknown;
  shape?: unknown;
}

export function buildWorkspaceRiskAreaPath(
  clientId: string,
  requestNonce?: string | null
): string {
  const normalizedClientId = cleanOptionalText(clientId, 160);
  const normalizedNonce = cleanOptionalText(requestNonce, 160);
  if (!normalizedClientId) {
    throw new Error('A valid workspace is required.');
  }
  const basePath = `${WORKSPACE_RISK_AREA_ENDPOINT_PATH}/${encodeURIComponent(normalizedClientId)}` +
    '?include_inactive=false';
  return normalizedNonce
    ? `${basePath}&request_nonce=${encodeURIComponent(normalizedNonce)}`
    : basePath;
}

export function normalizeWorkspaceRiskAreas(
  payload: unknown,
  clientId: string
): RiskZone[] {
  const normalizedClientId = cleanOptionalText(clientId, 160);
  if (!normalizedClientId) {
    throw new Error('A valid workspace is required.');
  }
  const records = unwrapList(payload);
  const zones: RiskZone[] = [];

  for (const value of records) {
    if (!isAuthoritativeWorkspaceRiskAreaRecord(value, normalizedClientId)) {
      throw new Error('Invalid SafeRoute workspace risk marker response record.');
    }
    const record = value as WorkspaceRiskAreaRecord;
    const rawMarkerId = cleanRequiredText(record._id ?? record.id, 'workspace-marker');
    const markerId = rawMarkerId.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 96);
    const shape = cleanRequiredText(record.shape, 'point').toLowerCase();
    const rawAreaShape = cleanRequiredText(record.area_shape, 'circle').toLowerCase();
    const areaShape = rawAreaShape === 'polygon' || rawAreaShape === 'rectangle'
      ? rawAreaShape
      : 'circle';
    const coordinates = record.coordinates as Array<Record<string, unknown>>;
    const mapped = mapMobileRiskOverlays([{
      ...record,
      id: `workspace-risk-${markerId}`,
      shape,
      area_shape: areaShape,
      title: cleanRequiredText(record.label, 'Shared risk area').slice(0, 140),
      description: cleanOptionalText(record.notes, 1200) ?? 'Shared workspace risk marker.',
      coordinate: {
        latitude: Number(record.lat),
        longitude: Number(record.lon)
      },
      coordinates: shape === 'section' ? coordinates : [],
      polygon_coordinates:
        shape === 'area' && areaShape !== 'circle'
          ? coordinates
          : [],
      radius_meters: record.radius_m
    }]);
    const zone = mapped[0];
    if (!zone) {
      throw new Error('Invalid SafeRoute workspace risk marker geometry.');
    }
    zones.push(zone);
  }

  return zones;
}

export function selectWorkspaceRiskAreasForRegion(
  zones: readonly RiskZone[],
  region: Region,
  limit = MAX_VISIBLE_WORKSPACE_RISK_AREAS
): RiskZone[] {
  const requests = regionToAreaRiskViewportRequests(region);
  if (!requests.length) {
    return [];
  }
  const safeLimit = Math.max(
    0,
    Math.min(MAX_VISIBLE_WORKSPACE_RISK_AREAS, Math.trunc(limit))
  );
  return zones
    .filter((zone) => requests.some((request) =>
      areaRiskItemIntersectsBounds({
        ...zone,
        coordinates:
          zone.polygonCoordinates?.length
            ? zone.polygonCoordinates
            : zone.routeSegmentCoordinates
      }, {
        south: request.minLat,
        west: request.minLon,
        north: request.maxLat,
        east: request.maxLon
      })
    ))
    .sort((left, right) =>
      severityRank(right) - severityRank(left) ||
      distanceScore(left, region) - distanceScore(right, region) ||
      left.id.localeCompare(right.id)
    )
    .slice(0, safeLimit);
}

function isAuthoritativeWorkspaceRiskAreaRecord(
  value: unknown,
  clientId: string
): value is WorkspaceRiskAreaRecord {
  const record = asRecord(value);
  if (!record) {
    return false;
  }
  const markerId = cleanOptionalText(record._id ?? record.id, 160);
  const recordClientId = cleanOptionalText(record.client_id, 160);
  const label = cleanOptionalText(record.label, 140);
  const shape = cleanOptionalText(record.shape, 32)?.toLowerCase() ?? 'point';
  const latitude = finiteNumber(record.lat);
  const longitude = finiteNumber(record.lon);
  const coordinates = record.coordinates;
  if (
    !markerId ||
    recordClientId !== clientId ||
    !label ||
    record.is_active !== true ||
    !['point', 'area', 'section'].includes(shape) ||
    latitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude === null ||
    longitude < -180 ||
    longitude > 180 ||
    !Array.isArray(coordinates)
  ) {
    return false;
  }
  const requiredCoordinateCount = shape === 'area' ? 3 : (shape === 'section' ? 2 : 0);
  return coordinates.length >= requiredCoordinateCount &&
    coordinates.length <= 80 &&
    coordinates.every(isValidCoordinate);
}

function isValidCoordinate(value: unknown): boolean {
  const record = asRecord(value);
  const latitude = finiteNumber(record?.lat);
  const longitude = finiteNumber(record?.lon);
  return latitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude !== null &&
    longitude >= -180 &&
    longitude <= 180;
}

function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const record = asRecord(payload);
  if (Array.isArray(record?.data)) {
    return record.data;
  }
  throw new Error('Invalid SafeRoute workspace risk marker list response.');
}

function severityRank(zone: RiskZone): number {
  return zone.avoidanceSeverity === 'critical'
    ? 4
    : (zone.severity === 'high' ? 3 : (zone.severity === 'medium' ? 2 : 1));
}

function distanceScore(zone: RiskZone, region: Region): number {
  const latitudeDelta = zone.coordinate.latitude - region.latitude;
  const longitudeDelta = zone.coordinate.longitude - region.longitude;
  return latitudeDelta * latitudeDelta + longitudeDelta * longitudeDelta;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function cleanRequiredText(value: unknown, fallback: string): string {
  return cleanOptionalText(value, 160) ?? fallback;
}

function cleanOptionalText(value: unknown, maxLength: number): string | null {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return normalized ? normalized.slice(0, maxLength) : null;
}
