import type { LatLng } from 'react-native-maps';

export const GUEST_RISK_AREA_RADIUS_METERS = 250;

export type GuestRiskAreaPayload = {
  area_shape: 'circle';
  category: 'area-risk';
  client_id: string;
  coordinates: Array<{ elevation_m: null; lat: number; lon: number }>;
  display_color: 'orange';
  elevation_m: null;
  id: string;
  is_active: true;
  label: string;
  lat: number;
  lon: number;
  notes: string;
  radius_m: number;
  severity: 'medium';
  shape: 'area';
};

export function buildGuestRiskAreaPayload({
  clientId,
  coordinate,
  locationLabel,
  nowMs = Date.now()
}: {
  clientId: string;
  coordinate: LatLng;
  locationLabel: string;
  nowMs?: number;
}): GuestRiskAreaPayload {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId || !isCoordinate(coordinate)) {
    throw new Error('A valid workspace and map location are required.');
  }
  const shortLocation = locationLabel.trim().replace(/\s+/g, ' ').slice(0, 104) ||
    `${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)}`;
  const timestamp = Number.isFinite(nowMs) ? Math.max(0, Math.trunc(nowMs)) : 0;
  return {
    area_shape: 'circle',
    category: 'area-risk',
    client_id: normalizedClientId,
    coordinates: buildCircleBoundary(coordinate, GUEST_RISK_AREA_RADIUS_METERS),
    display_color: 'orange',
    elevation_m: null,
    id: `mobile-risk-${timestamp.toString(36)}-${signedCoordinateKey(coordinate.latitude)}-${signedCoordinateKey(coordinate.longitude)}`.slice(0, 80),
    is_active: true,
    label: `Reported risk near ${shortLocation}`.slice(0, 140),
    lat: Number(coordinate.latitude.toFixed(6)),
    lon: Number(coordinate.longitude.toFixed(6)),
    notes: 'Reported from SafeRoute Mobile after a deliberate map long-press confirmation.',
    radius_m: GUEST_RISK_AREA_RADIUS_METERS,
    severity: 'medium',
    shape: 'area'
  };
}

function buildCircleBoundary(
  center: LatLng,
  radiusMeters: number
): Array<{ elevation_m: null; lat: number; lon: number }> {
  const latitudeRadius = radiusMeters / 110_574;
  const longitudeRadius = radiusMeters /
    Math.max(1, 111_320 * Math.abs(Math.cos(center.latitude * Math.PI / 180)));
  return Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2;
    return {
      elevation_m: null,
      lat: Number((center.latitude + Math.sin(angle) * latitudeRadius).toFixed(6)),
      lon: Number((center.longitude + Math.cos(angle) * longitudeRadius).toFixed(6))
    };
  });
}

function isCoordinate(coordinate: LatLng): boolean {
  return Number.isFinite(coordinate?.latitude) &&
    Number.isFinite(coordinate?.longitude) &&
    coordinate.latitude >= -90 && coordinate.latitude <= 90 &&
    coordinate.longitude >= -180 && coordinate.longitude <= 180;
}

function signedCoordinateKey(value: number): string {
  const rounded = Math.round(value * 10000);
  return `${rounded < 0 ? 'n' : 'p'}${Math.abs(rounded).toString(36)}`;
}
