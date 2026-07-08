import type { LatLng, Region } from 'react-native-maps';

export type RiskSeverity = 'low' | 'medium' | 'high';
export type SavedRouteStatus = 'ready' | 'in-progress' | 'planned';

export interface RoutePath {
  id: string;
  label: string;
  eta: string;
  distance: string;
  safeScore: number;
  riskLabel: string;
  tone: 'safe' | 'amber' | 'blue';
  color: string;
  mutedColor: string;
  description: string;
  nextInstruction: string;
  nextDistance: string;
  coordinates: LatLng[];
}

export interface RiskZone {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  category: string;
  coordinate: LatLng;
  routeSegmentCoordinates?: LatLng[];
  connectorCoordinates?: LatLng[];
  polygonCoordinates?: LatLng[];
  shape?: string;
  radiusMeters: number;
  markerColor: string;
  strokeColor: string;
  fillColor: string;
}

export interface RouteCheckpoint {
  id: string;
  label: string;
  caption: string;
  coordinate: LatLng;
  kind: 'origin' | 'destination';
}

export interface SavedSafeRoutePlan {
  id: string;
  name: string;
  operation: string;
  status: SavedRouteStatus;
  convoyCallsign: string;
  updatedAtLabel: string;
  origin: string;
  destination: string;
  region: Region;
  route: RoutePath;
  riskZones: RiskZone[];
  checkpoints: RouteCheckpoint[];
}
