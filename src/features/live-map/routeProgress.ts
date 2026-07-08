import type { LatLng } from 'react-native-maps';

import type { RoutePath } from './liveMapTypes';
import {
  bearingBetween,
  calculateCumulativeDistances,
  densifyRouteCoordinates,
  haversineDistanceMeters,
  nearestSegmentProjection,
  normalizeRouteCoordinates,
  projectCoordinateToRoute
} from './routeGeometry';

export {
  bearingBetween,
  calculateCumulativeDistances,
  densifyRouteCoordinates,
  haversineDistanceMeters,
  nearestSegmentProjection,
  normalizeRouteCoordinates,
  projectCoordinateToRoute
} from './routeGeometry';

export const OFF_ROUTE_THRESHOLD_METERS = 75;
export const ARRIVAL_THRESHOLD_METERS = 50;
export const DEFAULT_SPEED_METERS_PER_SECOND = 35 / 3.6;
export const DEMO_DRIVE_STEP_INTERVAL_MS = 1000;
export const DEMO_DRIVE_MIN_DURATION_MS = 72000;

export interface RouteProgressOptions {
  offRouteThresholdMeters?: number;
  arrivalThresholdMeters?: number;
  speedMetersPerSecond?: number | null;
  minimumDistanceAlongMeters?: number;
}

export interface RouteProgressSnapshot {
  snappedCoordinate: LatLng;
  completedCoordinates: LatLng[];
  totalDistanceMeters: number;
  travelledDistanceMeters: number;
  remainingDistanceMeters: number;
  offRouteDistanceMeters: number;
  nearestSegmentIndex: number;
  segmentProgress: number;
  progressRatio: number;
  etaSeconds: number | null;
  isOffRoute: boolean;
  isArrived: boolean;
}

export function clampRouteStep(totalPoints: number, requestedStep: number): number {
  if (totalPoints <= 0) {
    return 0;
  }

  if (!Number.isFinite(requestedStep)) {
    return 0;
  }

  return Math.max(0, Math.min(totalPoints - 1, Math.floor(requestedStep)));
}

export function coordinateForStep(coordinates: LatLng[], requestedStep: number): LatLng | null {
  if (!coordinates.length) {
    return null;
  }

  return coordinates[clampRouteStep(coordinates.length, requestedStep)];
}

export function buildProgressCoordinates(coordinates: LatLng[], requestedStep: number): LatLng[] {
  if (!coordinates.length) {
    return [];
  }

  const step = clampRouteStep(coordinates.length, requestedStep);
  return coordinates.slice(0, step + 1);
}

export function resolveDemoDriveStepIncrement(
  totalPoints: number,
  options: {
    intervalMs?: number;
    minimumDurationMs?: number;
  } = {}
): number {
  const finalStep = Math.max(0, totalPoints - 1);
  if (finalStep <= 0) {
    return 0;
  }

  const intervalMs = resolvePositiveNumber(options.intervalMs, DEMO_DRIVE_STEP_INTERVAL_MS);
  const minimumDurationMs = resolvePositiveNumber(options.minimumDurationMs, DEMO_DRIVE_MIN_DURATION_MS);
  const minimumTicks = Math.max(finalStep, Math.ceil(minimumDurationMs / intervalMs));

  return finalStep / minimumTicks;
}

export function coordinateForInterpolatedStep(
  coordinates: LatLng[],
  requestedStep: number
): LatLng | null {
  if (!coordinates.length) {
    return null;
  }

  if (!Number.isFinite(requestedStep)) {
    return coordinates[0];
  }

  const step = clampInterpolatedRouteStep(coordinates.length, requestedStep);
  const lowerStep = Math.floor(step);
  const upperStep = Math.ceil(step);
  const lowerCoordinate = coordinates[lowerStep];
  const upperCoordinate = coordinates[upperStep] || lowerCoordinate;

  if (lowerStep === upperStep || !upperCoordinate) {
    return lowerCoordinate;
  }

  const segmentProgress = step - lowerStep;
  return {
    latitude: interpolateNumber(lowerCoordinate.latitude, upperCoordinate.latitude, segmentProgress),
    longitude: interpolateNumber(lowerCoordinate.longitude, upperCoordinate.longitude, segmentProgress)
  };
}

export function buildInterpolatedProgressCoordinates(
  coordinates: LatLng[],
  requestedStep: number
): LatLng[] {
  if (!coordinates.length) {
    return [];
  }

  const step = Number.isFinite(requestedStep)
    ? clampInterpolatedRouteStep(coordinates.length, requestedStep)
    : 0;
  const lowerStep = Math.floor(step);
  const completedCoordinates = coordinates.slice(0, Math.max(1, lowerStep + 1));
  const currentCoordinate = coordinateForInterpolatedStep(coordinates, step);
  const lastCoordinate = completedCoordinates[completedCoordinates.length - 1];

  if (
    currentCoordinate &&
    lastCoordinate &&
    haversineDistanceMeters(lastCoordinate, currentCoordinate) > 1
  ) {
    completedCoordinates.push(currentCoordinate);
  }

  return completedCoordinates;
}

export function calculateRouteProgress(
  coordinates: LatLng[],
  currentCoordinate: LatLng | null,
  options: RouteProgressOptions = {}
): RouteProgressSnapshot | null {
  if (!currentCoordinate || !coordinates.length) {
    return null;
  }

  const routeCoordinates = normalizeRouteCoordinates(coordinates);
  if (!routeCoordinates.length) {
    return null;
  }

  const cumulativeDistances = calculateCumulativeDistances(routeCoordinates);
  const totalDistanceMeters = cumulativeDistances[cumulativeDistances.length - 1] || 0;
  const projection = projectCoordinateToRoute(
    routeCoordinates,
    currentCoordinate,
    options.minimumDistanceAlongMeters
  );
  if (!projection) {
    return null;
  }

  const travelledDistanceMeters = Math.min(totalDistanceMeters, projection.distanceAlongMeters);
  const remainingDistanceMeters = Math.max(0, totalDistanceMeters - travelledDistanceMeters);
  const speedMetersPerSecond = resolveSpeed(options.speedMetersPerSecond);
  const arrivalThresholdMeters = options.arrivalThresholdMeters ?? ARRIVAL_THRESHOLD_METERS;
  const offRouteThresholdMeters = options.offRouteThresholdMeters ?? OFF_ROUTE_THRESHOLD_METERS;
  const destination = routeCoordinates[routeCoordinates.length - 1];
  const destinationDistanceMeters = haversineDistanceMeters(currentCoordinate, destination);
  const hasTraversableDistance = totalDistanceMeters > 0;
  const isArrived =
    destinationDistanceMeters <= arrivalThresholdMeters ||
    (
      hasTraversableDistance &&
      remainingDistanceMeters <= arrivalThresholdMeters &&
      projection.distanceMeters <= arrivalThresholdMeters
    );

  return {
    snappedCoordinate: projection.snappedCoordinate,
    completedCoordinates: buildSnappedProgressCoordinates(routeCoordinates, projection.segmentIndex, projection.snappedCoordinate),
    totalDistanceMeters,
    travelledDistanceMeters,
    remainingDistanceMeters,
    offRouteDistanceMeters: projection.distanceMeters,
    nearestSegmentIndex: projection.segmentIndex,
    segmentProgress: projection.segmentProgress,
    progressRatio: totalDistanceMeters > 0 ? travelledDistanceMeters / totalDistanceMeters : 0,
    etaSeconds: speedMetersPerSecond > 0 ? remainingDistanceMeters / speedMetersPerSecond : null,
    isOffRoute: projection.distanceMeters > offRouteThresholdMeters && !isArrived,
    isArrived
  };
}

export function resolveGuidance(
  route: RoutePath,
  progressOrStep: RouteProgressSnapshot | number | null,
  navigationState: 'loaded' | 'navigating' | 'paused' | 'off-route' | 'arrived' | 'stopped' = 'navigating'
): { instruction: string; distance: string } {
  if (typeof progressOrStep === 'number') {
    return resolveStepGuidance(route, progressOrStep);
  }

  if (navigationState === 'arrived' || progressOrStep?.isArrived) {
    return {
      instruction: 'Arrived at destination',
      distance: '0 m'
    };
  }

  if (navigationState === 'off-route' || progressOrStep?.isOffRoute) {
    return {
      instruction: 'Return to saved route',
      distance: formatDistance(progressOrStep?.offRouteDistanceMeters || 0)
    };
  }

  if (navigationState === 'paused') {
    return {
      instruction: 'Navigation paused',
      distance: formatDistance(progressOrStep?.remainingDistanceMeters || 0)
    };
  }

  if (navigationState === 'loaded' || navigationState === 'stopped' || !progressOrStep) {
    return {
      instruction: 'Start route when ready',
      distance: route.distance
    };
  }

  return {
    instruction: route.nextInstruction || 'Continue on saved route',
    distance: formatDistance(progressOrStep.remainingDistanceMeters)
  };
}

export function formatDistance(distanceMeters: number): string {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    return '0 m';
  }
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

export function formatEta(etaSeconds: number | null | undefined): string {
  if (!Number.isFinite(Number(etaSeconds)) || Number(etaSeconds) <= 0) {
    return 'ETA pending';
  }
  return `${Math.max(1, Math.round(Number(etaSeconds) / 60))} min`;
}

function resolveStepGuidance(route: RoutePath, requestedStep: number): { instruction: string; distance: string } {
  const finalStep = route.coordinates.length - 1;
  const step = clampRouteStep(route.coordinates.length, requestedStep);

  if (step >= finalStep) {
    return {
      instruction: 'Arrived at destination',
      distance: '0 m'
    };
  }

  if (step >= Math.max(1, Math.floor(finalStep * 0.68))) {
    return {
      instruction: 'Continue on final approach',
      distance: formatDistance(haversineDistanceMeters(route.coordinates[step], route.coordinates[finalStep]))
    };
  }

  return {
    instruction: route.nextInstruction,
    distance: route.nextDistance
  };
}

function buildSnappedProgressCoordinates(coordinates: LatLng[], segmentIndex: number, snappedCoordinate: LatLng): LatLng[] {
  const completedCoordinates = coordinates.slice(0, Math.max(1, segmentIndex + 1));
  const lastCoordinate = completedCoordinates[completedCoordinates.length - 1];
  if (!lastCoordinate || haversineDistanceMeters(lastCoordinate, snappedCoordinate) > 1) {
    completedCoordinates.push(snappedCoordinate);
  }
  return completedCoordinates;
}

function resolveSpeed(speedMetersPerSecond: number | null | undefined): number {
  if (typeof speedMetersPerSecond === 'number' && Number.isFinite(speedMetersPerSecond) && speedMetersPerSecond > 0) {
    return speedMetersPerSecond;
  }
  return DEFAULT_SPEED_METERS_PER_SECOND;
}

function clampInterpolatedRouteStep(totalPoints: number, requestedStep: number): number {
  if (totalPoints <= 0) {
    return 0;
  }

  if (!Number.isFinite(requestedStep)) {
    return 0;
  }

  return Math.max(0, Math.min(totalPoints - 1, requestedStep));
}

function interpolateNumber(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function resolvePositiveNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
