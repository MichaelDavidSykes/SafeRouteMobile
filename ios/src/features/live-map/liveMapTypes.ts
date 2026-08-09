import type { LatLng, Region } from 'react-native-maps';

export type RiskSeverity = 'low' | 'medium' | 'high';
export type RiskAvoidanceSeverity = 'high' | 'critical';
export type SavedRouteStatus = 'ready' | 'in-progress' | 'planned';
export type SafeRouteTravelMode = 'drive' | 'walk' | 'cycle' | 'transit';

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
  navigationSteps?: RouteNavigationStep[];
  navigationStepRevision?: string;
  navigationStepSource?: 'backend';
}

export interface RouteNavigationStep {
  id: string;
  instruction: string;
  maneuverType: string;
  modifier?: string | null;
  roadName?: string | null;
  distanceAlongMeters: number;
  distanceMeters: number | null;
  durationSeconds: number | null;
  coordinate: LatLng;
}

export interface RiskZone {
  id: string;
  areaFamilyId?: string;
  areaFamilyAliases?: string[];
  title: string;
  description: string;
  severity: RiskSeverity;
  avoidanceSeverity?: RiskAvoidanceSeverity;
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
  riskScore?: number;
  confidence?: string;
  source?: string;
  sourceDescription?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceUrls?: string[];
  evidenceCount?: number;
  escalationIndicators?: RiskEscalationIndicator[];
  linkedEntities?: RiskLinkedEntity[];
  lastVerifiedAt?: string;
  validUntil?: string;
  sourceQuery?: string;
  queryRelation?: string;
  riskTheme?: string;
  expectedActivity?: string;
  recommendedActions?: string[];
  relatedAreas?: string[];
}

export interface RiskEscalationIndicator {
  id?: string;
  label: string;
  category?: string;
  confidence?: string;
  evidenceCount?: number;
  matchedTerms?: string[];
  snippet?: string;
}

export interface RiskLinkedEntity {
  id?: string;
  label: string;
  relation?: string;
  source?: string;
  type?: string;
}

export interface RouteCheckpoint {
  id: string;
  label: string;
  caption: string;
  coordinate: LatLng;
  kind: 'origin' | 'waypoint' | 'destination';
}

export interface SavedSafeRoutePlan {
  id: string;
  clientId?: string;
  name: string;
  operation: string;
  status: SavedRouteStatus;
  convoyCallsign: string;
  updatedAtLabel: string;
  origin: string;
  destination: string;
  travelMode?: SafeRouteTravelMode;
  region: Region;
  route: RoutePath;
  riskZones: RiskZone[];
  checkpoints: RouteCheckpoint[];
}
