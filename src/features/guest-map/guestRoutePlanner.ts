import type { LatLng, Region } from 'react-native-maps';

import {
  calculateCumulativeDistances,
  densifyRouteCoordinates,
  normalizeRouteCoordinates
} from '../live-map/routeGeometry';
import type {
  RiskZone,
  RouteCheckpoint,
  RouteNavigationStep,
  SavedSafeRoutePlan
} from '../live-map/liveMapTypes';
import { routeRiskStartBlockedReason } from '../live-map/routeRisk';
import { formatDistance, formatEta } from '../routes/routeMapperNormalization';

export type GuestFullAccessFeature = 'saved-routes' | 'planned-trips' | 'calendar' | 'convoy-management';

export type GuestFullAccessCopy = {
  action: string;
  body: string;
  title: string;
};

export type GuestRouteActionState = {
  accessibilityHint: string;
  accessibilityLabel: string;
  disabled: boolean;
  label: string;
};

export type GuestRouteInputField = 'origin' | 'destination';

export type GuestRouteInputCopy = {
  accessibilityHint: string;
  accessibilityLabel: string;
  placeholder: string;
};

export type GuestRoutePreviewState = {
  accessibilityLabel: string;
  summaryLabel: string;
};

export type GuestRoutePreviewMetricPresentation = {
  accessibilityLabel: string;
  summaryLabel: string;
};

export type GuestRouteMetrics = {
  distance: string;
  eta: string;
};

export type GuestRouteMetricsOptions = {
  distanceMeters?: number | null;
  durationSeconds?: number | null;
};

export type GuestRoutePlanOptions = {
  authenticated?: boolean;
  checkpoints?: RouteCheckpoint[] | null;
  destination: string;
  destinationCoordinate?: LatLng | null;
  origin: string;
  originCoordinate?: LatLng | null;
  riskZones?: RiskZone[];
  roadSnappedCoordinates?: LatLng[] | null;
  routeDistanceMeters?: number | null;
  routeDurationSeconds?: number | null;
  routeGuidanceSteps?: RouteNavigationStep[];
};

export type GuestMapHomeCopy = {
  primaryActionAccessibilityLabel: string;
  primaryActionLabel: string;
  sheetTitle: string;
  sheetSubtitle: string;
};

export type GuestMapGateOptions = {
  authenticated: boolean;
  routePlotted: boolean;
};

export const GUEST_MAP_REGION: Region = {
  latitude: 51.512,
  longitude: -0.073,
  latitudeDelta: 0.095,
  longitudeDelta: 0.14
};

export const GUEST_ROUTE_LABEL_MAX_LENGTH = 80;
export const GUEST_ROUTE_PREVIEW_SUMMARY_FALLBACK = 'Preview ready';
export const GUEST_ROUTE_PREVIEW_METRIC_MAX_LENGTH = 24;

const GUEST_ROUTE_SIMULATION_MAX_SEGMENT_METERS = 330;
const GUEST_ROUTE_PREVIEW_SPEED_METERS_PER_SECOND = 6.5;

const GUEST_ROUTE_ANCHORS: LatLng[] = [
  { latitude: 51.5099, longitude: -0.1479 },
  { latitude: 51.5126, longitude: -0.1266 },
  { latitude: 51.5178, longitude: -0.1032 },
  { latitude: 51.5206, longitude: -0.0732 },
  { latitude: 51.5172, longitude: -0.0445 },
  { latitude: 51.5088, longitude: -0.0182 }
];

const GUEST_ROUTE_COORDINATES: LatLng[] = densifyRouteCoordinates(
  GUEST_ROUTE_ANCHORS,
  GUEST_ROUTE_SIMULATION_MAX_SEGMENT_METERS
);

const LONDON_CITY_AIRPORT_ROUTE_ANCHORS: LatLng[] = [
  { latitude: 51.5099, longitude: -0.1479 },
  { latitude: 51.5015, longitude: -0.135 },
  { latitude: 51.5005, longitude: -0.1197 },
  { latitude: 51.4935, longitude: -0.092 },
  { latitude: 51.4917, longitude: -0.063 },
  { latitude: 51.493, longitude: -0.047 },
  { latitude: 51.484, longitude: -0.01 },
  { latitude: 51.493, longitude: 0.003 },
  { latitude: 51.509, longitude: 0.006 },
  { latitude: 51.514, longitude: 0.03 },
  { latitude: 51.5053, longitude: 0.0553 }
];

const LONDON_CITY_AIRPORT_ROUTE_COORDINATES: LatLng[] = densifyRouteCoordinates(
  LONDON_CITY_AIRPORT_ROUTE_ANCHORS,
  GUEST_ROUTE_SIMULATION_MAX_SEGMENT_METERS
);

const GUEST_ROUTE_DESTINATION_GEOMETRIES = [
  {
    aliases: [
      'london city airport',
      'city airport',
      'lcy'
    ],
    coordinates: LONDON_CITY_AIRPORT_ROUTE_COORDINATES,
    roadPreviewStops: LONDON_CITY_AIRPORT_ROUTE_ANCHORS
  }
];

const GUEST_ROUTE_RISK_ZONES: RiskZone[] = [
  {
    id: 'guest-event-traffic',
    title: 'Event traffic',
    description: 'Local event traffic near the current corridor',
    severity: 'medium',
    category: 'Traffic',
    coordinate: { latitude: 51.5127, longitude: -0.1433 },
    radiusMeters: 210,
    markerColor: '#f3a32b',
    strokeColor: 'rgba(243, 163, 43, 0.72)',
    fillColor: 'rgba(243, 163, 43, 0.18)'
  },
  {
    id: 'guest-bank-crowd',
    title: 'Crowd activity',
    description: 'Route preview keeps clear of a crowd-risk area near Bank',
    severity: 'high',
    category: 'Crowd',
    coordinate: { latitude: 51.5134, longitude: -0.089 },
    radiusMeters: 380,
    markerColor: '#d84a3f',
    strokeColor: 'rgba(216, 74, 63, 0.72)',
    fillColor: 'rgba(216, 74, 63, 0.18)'
  },
  {
    id: 'guest-roadworks',
    title: 'Roadworks',
    description: 'Lane works are monitored from the safer preview corridor',
    severity: 'low',
    category: 'Works',
    coordinate: { latitude: 51.5108, longitude: -0.038 },
    radiusMeters: 260,
    markerColor: '#5c8df6',
    strokeColor: 'rgba(92, 141, 246, 0.72)',
    fillColor: 'rgba(92, 141, 246, 0.16)'
  }
];

export function normalizeGuestRouteLabel(value: string, fallback: string): string {
  const normalizedValue = normalizeGuestRouteLabelText(value);
  const normalizedFallback = normalizeGuestRouteLabelText(fallback);
  return truncateGuestRouteLabel(normalizedValue || normalizedFallback);
}

function normalizeGuestRouteLabelText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function truncateGuestRouteLabel(label: string): string {
  if (label.length <= GUEST_ROUTE_LABEL_MAX_LENGTH) {
    return label;
  }

  return `${label.slice(0, GUEST_ROUTE_LABEL_MAX_LENGTH - 1).trimEnd()}…`;
}

export function hasGuestRouteDestination(destination: string): boolean {
  return normalizeGuestRouteLabel(destination, '').length > 0;
}

export function createGuestRouteActionState({
  destination,
  routePlotted
}: {
  destination: string;
  routePlotted: boolean;
}): GuestRouteActionState {
  if (!hasGuestRouteDestination(destination)) {
    return {
      accessibilityHint: 'Enter a destination before plotting a route on the map.',
      accessibilityLabel: 'Add a destination to plot a route',
      disabled: true,
      label: 'Add destination'
    };
  }

  const destinationLabel = normalizeGuestRouteLabel(destination, 'destination');

  if (routePlotted) {
    return {
      accessibilityHint: `Opens this plotted route to ${destinationLabel} in the live map preview.`,
      accessibilityLabel: `Open route preview to ${destinationLabel}`,
      disabled: false,
      label: 'Preview map'
    };
  }

  return {
    accessibilityHint: `Plots a local route to ${destinationLabel} on the map.`,
    accessibilityLabel: `Plot local route to ${destinationLabel}`,
    disabled: false,
    label: 'Plot route'
  };
}

export function shouldShowGuestMapSubtitle(routePlotted: boolean): boolean {
  return !routePlotted;
}

export function createGuestRouteInputCopy({
  field,
  routePlotted
}: {
  field: GuestRouteInputField;
  routePlotted: boolean;
}): GuestRouteInputCopy {
  if (field === 'origin') {
    return {
      accessibilityHint: routePlotted
        ? 'Changing the start clears the current preview.'
        : 'Edit where the map route starts.',
      accessibilityLabel: 'Route origin',
      placeholder: 'Start point'
    };
  }

  return {
    accessibilityHint: routePlotted
      ? 'Changing the destination clears the current preview.'
      : 'Enter a destination to unlock route plotting.',
    accessibilityLabel: 'Route destination',
    placeholder: 'Where to?'
  };
}

export function createGuestMapHomeCopy(authenticated: boolean): GuestMapHomeCopy {
  if (authenticated) {
    return {
      primaryActionAccessibilityLabel: 'Open saved routes',
      primaryActionLabel: 'Saved',
      sheetTitle: 'Where to?',
      sheetSubtitle: 'Plot fast or open Saved.'
    };
  }

  return {
    primaryActionAccessibilityLabel: 'Sign in to SafeRoute',
    primaryActionLabel: 'Sign in',
    sheetTitle: 'Where to?',
    sheetSubtitle: 'Map first. Save after sign-in.'
  };
}

export function createGuestRouteMetrics(
  coordinates: LatLng[],
  { distanceMeters: providedDistanceMeters, durationSeconds: providedDurationSeconds }: GuestRouteMetricsOptions = {}
): GuestRouteMetrics {
  const cumulativeDistances = calculateCumulativeDistances(coordinates);
  const measuredDistanceMeters = cumulativeDistances.length
    ? cumulativeDistances[cumulativeDistances.length - 1]
    : 0;
  const distanceMeters = normalizePositiveRouteMetric(providedDistanceMeters) ?? measuredDistanceMeters;
  const durationSeconds = normalizePositiveRouteMetric(providedDurationSeconds) ??
    (distanceMeters > 0
      ? distanceMeters / GUEST_ROUTE_PREVIEW_SPEED_METERS_PER_SECOND
      : null);

  return {
    distance: formatDistance(distanceMeters),
    eta: formatEta(durationSeconds)
  };
}

export function createGuestRoutePlan({
  authenticated = false,
  checkpoints,
  destination,
  destinationCoordinate,
  origin,
  originCoordinate,
  riskZones,
  roadSnappedCoordinates,
  routeDistanceMeters,
  routeDurationSeconds,
  routeGuidanceSteps
}: GuestRoutePlanOptions): SavedSafeRoutePlan {
  const originLabel = normalizeGuestRouteLabel(origin, 'Current location');
  const destinationLabel = normalizeGuestRouteLabel(destination, '');

  if (!destinationLabel) {
    throw new Error('A destination is required before plotting a guest route.');
  }

  const normalizedRoadSnappedCoordinates = normalizeGuestRouteCoordinates(roadSnappedCoordinates);
  const hasRoadSnappedCoordinates = normalizedRoadSnappedCoordinates.length >= 2;
  const normalizedCheckpoints = normalizeGuestRouteCheckpoints(checkpoints);
  const selectedStopCoordinates = normalizedCheckpoints.length >= 2
    ? normalizedCheckpoints.map((checkpoint) => checkpoint.coordinate)
    : normalizeGuestRouteCoordinates([
        originCoordinate as LatLng,
        destinationCoordinate as LatLng
      ]);
  const hasSelectedStopCoordinates = selectedStopCoordinates.length >= 2;
  const localRouteCoordinates = hasSelectedStopCoordinates
    ? densifyRouteCoordinates(
        selectedStopCoordinates,
        GUEST_ROUTE_SIMULATION_MAX_SEGMENT_METERS
      )
    : resolveGuestRouteCoordinates(destinationLabel);
  const routeCoordinates = hasRoadSnappedCoordinates
    ? normalizedRoadSnappedCoordinates
    : localRouteCoordinates;
  const routeMetrics = createGuestRouteMetrics(
    routeCoordinates,
    hasRoadSnappedCoordinates
      ? {
          distanceMeters: routeDistanceMeters,
          durationSeconds: routeDurationSeconds
        }
      : {}
  );

  return {
    id: 'guest-plotted-route',
    name: 'Route preview',
    operation: authenticated ? 'Local route' : 'Unsaved route',
    status: 'ready',
    convoyCallsign: authenticated ? 'Map preview' : 'Guest mode',
    updatedAtLabel: hasRoadSnappedCoordinates ? 'Road preview' : 'Local preview',
    origin: originLabel,
    destination: destinationLabel,
    region: buildGuestRouteRegion(routeCoordinates),
    route: {
      id: 'guest-route-preview',
      label: 'Preview route',
      eta: routeMetrics.eta,
      distance: routeMetrics.distance,
      safeScore: 0,
      riskLabel: 'Preview',
      tone: 'blue',
      color: '#15b981',
      mutedColor: 'rgba(21, 185, 129, 0.22)',
      description: authenticated
        ? hasRoadSnappedCoordinates
          ? 'Road-snapped preview. Saved plans stay in Saved.'
          : 'Local preview. Saved plans stay in Saved.'
        : hasRoadSnappedCoordinates
          ? 'Road-snapped preview. Sign in to save.'
          : 'Local preview. Sign in to save.',
      nextInstruction: authenticated
        ? 'Review the route, then open Saved for synced plans.'
        : 'Review the route, then sign in to save it.',
      nextDistance: 'Preview',
      coordinates: routeCoordinates,
      ...(routeGuidanceSteps?.length
        ? { navigationSteps: [...routeGuidanceSteps] }
        : {})
    },
    riskZones: riskZones
      ? [...riskZones]
      : hasSelectedStopCoordinates
        ? []
        : GUEST_ROUTE_RISK_ZONES,
    checkpoints: normalizedCheckpoints.length >= 2
      ? normalizedCheckpoints
      : createGuestRouteCheckpoints({
          destinationLabel,
          originLabel,
          routeCoordinates
        })
  };
}

export function createGuestRoadSnappedRoutePlan(
  options: GuestRoutePlanOptions
): SavedSafeRoutePlan | null {
  const candidateRoutePlan = createGuestRoutePlan(options);
  const acceptedRoadPreview = candidateRoutePlan.updatedAtLabel === 'Road preview';

  if (!acceptedRoadPreview || routeRiskStartBlockedReason(candidateRoutePlan)) {
    return null;
  }

  return candidateRoutePlan;
}

function normalizeGuestRouteCoordinates(coordinates: LatLng[] | null | undefined): LatLng[] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return normalizeRouteCoordinates(coordinates);
}

function normalizeGuestRouteCheckpoints(
  checkpoints: RouteCheckpoint[] | null | undefined
): RouteCheckpoint[] {
  if (!Array.isArray(checkpoints) || checkpoints.length < 2) {
    return [];
  }
  const normalized = checkpoints.filter((checkpoint) =>
    checkpoint &&
    typeof checkpoint.id === 'string' &&
    typeof checkpoint.caption === 'string' &&
    Number.isFinite(checkpoint.coordinate?.latitude) &&
    Number.isFinite(checkpoint.coordinate?.longitude) &&
    checkpoint.coordinate.latitude >= -90 &&
    checkpoint.coordinate.latitude <= 90 &&
    checkpoint.coordinate.longitude >= -180 &&
    checkpoint.coordinate.longitude <= 180
  ).map((checkpoint) => ({
    ...checkpoint,
    coordinate: { ...checkpoint.coordinate }
  }));
  return normalized.length === checkpoints.length ? normalized : [];
}

export function resolveGuestRouteCoordinates(destinationLabel: string): LatLng[] {
  const destinationGeometry = resolveGuestRouteDestinationGeometry(destinationLabel);

  return [...(destinationGeometry?.coordinates || GUEST_ROUTE_COORDINATES)];
}

export function resolveGuestRoadPreviewStops(destinationLabel: string): LatLng[] {
  const destinationGeometry = resolveGuestRouteDestinationGeometry(destinationLabel);

  return [...(destinationGeometry?.roadPreviewStops || GUEST_ROUTE_ANCHORS)];
}

function resolveGuestRouteDestinationGeometry(destinationLabel: string) {
  const normalizedDestination = normalizeGuestDestinationSearchLabel(destinationLabel);

  return GUEST_ROUTE_DESTINATION_GEOMETRIES.find((geometry) =>
    geometry.aliases.some((alias) => normalizedDestination.includes(alias))
  );
}

function normalizeGuestDestinationSearchLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizePositiveRouteMetric(value: number | null | undefined): number | null {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;
}

function createGuestRouteCheckpoints({
  destinationLabel,
  originLabel,
  routeCoordinates
}: {
  destinationLabel: string;
  originLabel: string;
  routeCoordinates: LatLng[];
}): SavedSafeRoutePlan['checkpoints'] {
  const finalIndex = Math.max(0, routeCoordinates.length - 1);

  return [
    {
      id: 'guest-origin',
      label: 'A',
      caption: originLabel,
      coordinate: routeCoordinates[0],
      kind: 'origin'
    },
    {
      id: 'guest-destination',
      label: 'B',
      caption: destinationLabel,
      coordinate: routeCoordinates[finalIndex],
      kind: 'destination'
    }
  ];
}

function buildGuestRouteRegion(coordinates: LatLng[]): Region {
  if (!coordinates.length) {
    return GUEST_MAP_REGION;
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
    latitudeDelta: Math.max(0.025, (maxLatitude - minLatitude) * 1.8),
    longitudeDelta: Math.max(0.025, (maxLongitude - minLongitude) * 1.8)
  };
}

export function createGuestRoutePreviewState(
  routePlan: SavedSafeRoutePlan,
  { authenticated = false }: { authenticated?: boolean } = {}
): GuestRoutePreviewState {
  const modeValue = authenticated ? 'Local' : 'Unsaved';
  const guidanceCopy = authenticated
    ? 'Open the preview map for guidance. Saved plans are available from Saved.'
    : 'Sign in to save it.';
  const originLabel = normalizeGuestRouteLabel(routePlan.origin, 'Start point');
  const destinationLabel = normalizeGuestRouteLabel(routePlan.destination, 'Destination');
  const metricPresentation = createGuestRoutePreviewMetricPresentation({
    distance: routePlan.route.distance,
    eta: routePlan.route.eta
  });

  return {
    accessibilityLabel: `${modeValue} route preview from ${originLabel} to ${destinationLabel}. ${metricPresentation.accessibilityLabel}. ${guidanceCopy}`,
    summaryLabel: metricPresentation.summaryLabel
  };
}

export function createGuestRoutePreviewMetricPresentation({
  distance,
  eta
}: {
  distance?: string | null;
  eta?: string | null;
}): GuestRoutePreviewMetricPresentation {
  const etaLabel = normalizeGuestRouteMetricLabel(eta);
  const distanceLabel = normalizeGuestRouteMetricLabel(distance);
  const etaSummaryLabel = createCompactGuestRoutePreviewMetricLabel(etaLabel);
  const distanceSummaryLabel = createCompactGuestRoutePreviewMetricLabel(distanceLabel);

  if (etaLabel && distanceLabel) {
    return {
      accessibilityLabel: `${etaLabel}, ${distanceLabel}`,
      summaryLabel: `${etaSummaryLabel} · ${distanceSummaryLabel}`
    };
  }

  if (etaLabel || distanceLabel) {
    const metricLabel = etaLabel || distanceLabel;
    const summaryMetricLabel = etaSummaryLabel || distanceSummaryLabel;
    return {
      accessibilityLabel: metricLabel,
      summaryLabel: summaryMetricLabel
    };
  }

  return {
    accessibilityLabel: 'Preview ready; route metrics unavailable',
    summaryLabel: GUEST_ROUTE_PREVIEW_SUMMARY_FALLBACK
  };
}

function normalizeGuestRouteMetricLabel(value?: string | null): string {
  return value?.trim().replace(/\s+/g, ' ') || '';
}

function createCompactGuestRoutePreviewMetricLabel(label: string): string {
  if (label.length <= GUEST_ROUTE_PREVIEW_METRIC_MAX_LENGTH) {
    return label;
  }

  return `${label.slice(0, GUEST_ROUTE_PREVIEW_METRIC_MAX_LENGTH - 1).trimEnd()}…`;
}

export function shouldShowGuestMapGateRow({
  authenticated,
  routePlotted
}: GuestMapGateOptions): boolean {
  return getGuestMapGateFeatures({ authenticated, routePlotted }).length > 0;
}

export function getGuestMapGateFeatures({
  authenticated,
  routePlotted
}: GuestMapGateOptions): GuestFullAccessFeature[] {
  if (!authenticated || routePlotted) {
    return [];
  }

  return ['planned-trips', 'calendar', 'convoy-management'];
}

export function getGuestFullAccessCopy(feature: GuestFullAccessFeature): GuestFullAccessCopy {
  switch (feature) {
    case 'planned-trips':
      return {
        title: 'Trips',
        body: 'View assigned trips after sign-in.',
        action: 'Sign in to view trips'
      };
    case 'calendar':
      return {
        title: 'Calendar',
        body: 'View route windows after sign-in.',
        action: 'Sign in to view calendar'
      };
    case 'convoy-management':
      return {
        title: 'Convoys',
        body: 'View convoy assignments after sign-in.',
        action: 'Sign in to view convoys'
      };
    case 'saved-routes':
    default:
      return {
        title: 'Saved',
        body: 'Sync saved SafeRoute plans after sign-in.',
        action: 'Sign in to sync saved routes'
      };
  }
}
