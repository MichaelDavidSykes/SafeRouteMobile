import type { LatLng, Region } from 'react-native-maps';

import { calculateCumulativeDistances, densifyRouteCoordinates } from '../live-map/routeGeometry';
import type { RiskZone, SavedSafeRoutePlan } from '../live-map/liveMapTypes';
import { formatDistance, formatEta } from '../routes/routeMapperNormalization';

export type GuestFullAccessFeature = 'saved-routes' | 'planned-trips' | 'convoy-management';

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

export type GuestRouteMetrics = {
  distance: string;
  eta: string;
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

export function createGuestRouteMetrics(coordinates: LatLng[]): GuestRouteMetrics {
  const cumulativeDistances = calculateCumulativeDistances(coordinates);
  const distanceMeters = cumulativeDistances.length
    ? cumulativeDistances[cumulativeDistances.length - 1]
    : 0;
  const durationSeconds = distanceMeters > 0
    ? distanceMeters / GUEST_ROUTE_PREVIEW_SPEED_METERS_PER_SECOND
    : null;

  return {
    distance: formatDistance(distanceMeters),
    eta: formatEta(durationSeconds)
  };
}

export function createGuestRoutePlan({
  authenticated = false,
  destination,
  origin
}: {
  authenticated?: boolean;
  destination: string;
  origin: string;
}): SavedSafeRoutePlan {
  const originLabel = normalizeGuestRouteLabel(origin, 'Current location');
  const destinationLabel = normalizeGuestRouteLabel(destination, '');

  if (!destinationLabel) {
    throw new Error('A destination is required before plotting a guest route.');
  }

  const routeMetrics = createGuestRouteMetrics(GUEST_ROUTE_COORDINATES);

  return {
    id: 'guest-plotted-route',
    name: 'Route preview',
    operation: authenticated ? 'Local route' : 'Unsaved route',
    status: 'ready',
    convoyCallsign: authenticated ? 'Map preview' : 'Guest mode',
    updatedAtLabel: 'Local preview',
    origin: originLabel,
    destination: destinationLabel,
    region: GUEST_MAP_REGION,
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
        ? 'Local preview. Saved plans stay in Saved.'
        : 'Local preview. Sign in to save.',
      nextInstruction: authenticated
        ? 'Review the route, then open Saved for synced plans.'
        : 'Review the route, then sign in to save it.',
      nextDistance: 'Preview',
      coordinates: GUEST_ROUTE_COORDINATES
    },
    riskZones: GUEST_ROUTE_RISK_ZONES,
    checkpoints: [
      {
        id: 'guest-origin',
        label: 'A',
        caption: originLabel,
        coordinate: GUEST_ROUTE_COORDINATES[0],
        kind: 'origin'
      },
      {
        id: 'guest-destination',
        label: 'B',
        caption: destinationLabel,
        coordinate: GUEST_ROUTE_COORDINATES[GUEST_ROUTE_COORDINATES.length - 1],
        kind: 'destination'
      }
    ]
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

  return {
    accessibilityLabel: `${modeValue} route preview from ${routePlan.origin} to ${routePlan.destination}. ${routePlan.route.eta}, ${routePlan.route.distance}. ${guidanceCopy}`,
    summaryLabel: `${routePlan.route.eta} · ${routePlan.route.distance}`,
  };
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

  return ['planned-trips', 'convoy-management'];
}

export function getGuestFullAccessCopy(feature: GuestFullAccessFeature): GuestFullAccessCopy {
  switch (feature) {
    case 'planned-trips':
      return {
        title: 'Trips',
        body: 'View assigned trips after sign-in.',
        action: 'Sign in to view trips'
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
