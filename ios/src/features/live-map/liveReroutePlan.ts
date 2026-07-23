import type { LatLng, Region } from 'react-native-maps';

import type { GuestRoadRoutePreview, GuestRouteAvoidRectangle } from '../guest-map/guestRoadRouteProvider';
import { routeIntersectsAvoidRectangles } from '../guest-map/routeAvoidanceGeometry';
import { deriveRiskZoneAvoidRectangles, mergeRiskZonesById } from './areaRiskApiCore';
import type { RiskZone, RouteCheckpoint, SavedSafeRoutePlan } from './liveMapTypes';
import { extractRemainingCheckpoints } from './liveRerouteState';
import { calculateRiskZoneRouteProximity } from './routeRisk';
import {
  formatDistance,
  formatEta,
  haversineDistanceMeters,
  projectCoordinateToRoute,
  type RouteProgressSnapshot
} from './routeProgress';

const LIVE_RISK_REGION_DELTA = 0.12;
const CHECKPOINT_COMPLETION_BUFFER_METERS = 35;
const REROUTE_STOP_DEDUPE_METERS = 5;

export interface LiveRerouteTargets {
  remainingCheckpoints: RouteCheckpoint[];
  stops: LatLng[];
}

export function createLiveRiskRegion(
  coordinate: LatLng | null | undefined,
  fallback: Region
): Region {
  if (!isCoordinate(coordinate)) {
    return fallback;
  }
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: LIVE_RISK_REGION_DELTA,
    longitudeDelta: LIVE_RISK_REGION_DELTA
  };
}

export function buildLiveRerouteTargets(
  routePlan: SavedSafeRoutePlan,
  currentCoordinate: LatLng,
  progress: RouteProgressSnapshot | null
): LiveRerouteTargets {
  const checkpoints = routePlan.checkpoints;
  const travelledDistanceMeters = progress?.travelledDistanceMeters ?? 0;
  const nextCheckpointIndex = checkpoints.findIndex((checkpoint) => {
    if (checkpoint.kind === 'origin') {
      return false;
    }
    const projection = projectCoordinateToRoute(
      routePlan.route.coordinates,
      checkpoint.coordinate
    );
    return !projection ||
      projection.distanceAlongMeters >= travelledDistanceMeters - CHECKPOINT_COMPLETION_BUFFER_METERS;
  });
  const remainingCheckpoints = extractRemainingCheckpoints(checkpoints, {
    nextCheckpointIndex: nextCheckpointIndex >= 0 ? nextCheckpointIndex : checkpoints.length
  });
  const destinationCoordinate = routePlan.route.coordinates.at(-1);
  const targets = remainingCheckpoints.length
    ? remainingCheckpoints
    : isCoordinate(destinationCoordinate) &&
        haversineDistanceMeters(currentCoordinate, destinationCoordinate) > 50
      ? [{
          id: `${routePlan.id}-destination`,
          label: routePlan.destination,
          caption: 'Destination',
          coordinate: destinationCoordinate,
          kind: 'destination' as const
        }]
      : [];
  const stops = dedupeCoordinates([
    currentCoordinate,
    ...targets.map((checkpoint) => checkpoint.coordinate)
  ]);

  return {
    remainingCheckpoints: targets,
    stops
  };
}

export function buildLiveRerouteAvoidRectangles(
  riskZones: RiskZone[],
  routeCoordinates: LatLng[],
  requiredStops: LatLng[]
): GuestRouteAvoidRectangle[] {
  const rankedZones = [...riskZones].sort((left, right) => {
    const leftProximity = calculateRiskZoneRouteProximity(routeCoordinates, left);
    const rightProximity = calculateRiskZoneRouteProximity(routeCoordinates, right);
    return (leftProximity?.routeDistanceMeters ?? Number.POSITIVE_INFINITY) -
      (rightProximity?.routeDistanceMeters ?? Number.POSITIVE_INFINITY);
  });
  return deriveRiskZoneAvoidRectangles(rankedZones, {
    maxRectangles: 10,
    paddingMeters: 140
  }).map((rectangle) => ({
    label: rectangle.label,
    maxLatitude: rectangle.max_lat,
    maxLongitude: rectangle.max_lon,
    minLatitude: rectangle.min_lat,
    minLongitude: rectangle.min_lon
  }))
    .filter((rectangle) => routeIntersectsAvoidRectangles(routeCoordinates, [rectangle]))
    .filter((rectangle) => !requiredStops.some((stop) => coordinateInsideRectangle(stop, rectangle)));
}

export function applyLiveReroutePreview({
  currentCoordinate,
  preview,
  requestRevision,
  riskZones,
  routePlan,
  targets
}: {
  currentCoordinate: LatLng;
  preview: GuestRoadRoutePreview;
  requestRevision: number;
  riskZones: RiskZone[];
  routePlan: SavedSafeRoutePlan;
  targets: LiveRerouteTargets;
}): SavedSafeRoutePlan {
  const routeId = `${routePlan.route.id}-reroute-${Math.max(1, requestRevision)}`;
  const checkpoints: RouteCheckpoint[] = [
    {
      id: `${routeId}-origin`,
      label: 'Current location',
      caption: 'Reroute start',
      coordinate: currentCoordinate,
      kind: 'origin'
    },
    ...targets.remainingCheckpoints
  ];
  return {
    ...routePlan,
    origin: 'Current location',
    updatedAtLabel: 'Updated now',
    region: regionForCoordinates(preview.coordinates, routePlan.region),
    checkpoints,
    riskZones: mergeRiskZonesById(riskZones, preview.routeAlerts || []),
    route: {
      ...routePlan.route,
      id: routeId,
      label: 'Updated SafeRoute',
      coordinates: preview.coordinates,
      distance: formatDistance(preview.distanceMeters ?? measureDistance(preview.coordinates)),
      eta: formatEta(preview.durationSeconds),
      description: 'Updated from your live position around mapped risk areas.',
      nextInstruction: 'Continue on updated SafeRoute',
      nextDistance: formatDistance(preview.distanceMeters ?? measureDistance(preview.coordinates)),
      navigationSteps: preview.guidanceSteps ?? [],
      ...(preview.guidanceSteps?.length
        ? {
            navigationStepRevision: routeId,
            navigationStepSource: 'backend' as const,
          }
        : {
            navigationStepRevision: undefined,
            navigationStepSource: undefined,
          })
    }
  };
}

function regionForCoordinates(coordinates: LatLng[], fallback: Region): Region {
  const valid = coordinates.filter(isCoordinate);
  if (!valid.length) {
    return fallback;
  }
  const latitudes = valid.map((coordinate) => coordinate.latitude);
  const longitudes = valid.map((coordinate) => coordinate.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  return {
    latitude: (minLatitude + maxLatitude) / 2,
    longitude: (minLongitude + maxLongitude) / 2,
    latitudeDelta: Math.max(0.018, (maxLatitude - minLatitude) * 1.35),
    longitudeDelta: Math.max(0.018, (maxLongitude - minLongitude) * 1.35)
  };
}

function measureDistance(coordinates: LatLng[]): number {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) => total + haversineDistanceMeters(coordinates[index], coordinate),
    0
  );
}

function dedupeCoordinates(coordinates: LatLng[]): LatLng[] {
  return coordinates.filter((coordinate, index, items) =>
    isCoordinate(coordinate) &&
    (index === 0 || haversineDistanceMeters(items[index - 1], coordinate) >= REROUTE_STOP_DEDUPE_METERS)
  );
}

function coordinateInsideRectangle(
  coordinate: LatLng,
  rectangle: GuestRouteAvoidRectangle
): boolean {
  return coordinate.latitude >= rectangle.minLatitude &&
    coordinate.latitude <= rectangle.maxLatitude &&
    coordinate.longitude >= rectangle.minLongitude &&
    coordinate.longitude <= rectangle.maxLongitude;
}

function isCoordinate(coordinate?: LatLng | null): coordinate is LatLng {
  return Boolean(
    coordinate &&
      Number.isFinite(coordinate.latitude) &&
      Number.isFinite(coordinate.longitude) &&
      coordinate.latitude >= -90 &&
      coordinate.latitude <= 90 &&
      coordinate.longitude >= -180 &&
      coordinate.longitude <= 180
  );
}
