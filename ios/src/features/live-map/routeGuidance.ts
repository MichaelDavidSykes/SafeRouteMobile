import type { LatLng } from 'react-native-maps';

import type { RouteNavigationStep } from './liveMapTypes';

const MAX_GUIDANCE_STEPS = 120;
const UPCOMING_STEP_BUFFER_METERS = 12;
const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Builds conservative offline guidance from snapped route geometry when the
 * provider did not persist maneuver steps with a saved web route.
 */
export function deriveRouteNavigationSteps(
  coordinates: readonly LatLng[],
): RouteNavigationStep[] {
  const valid = coordinates.filter((coordinate) =>
    validCoordinate(coordinate.latitude, coordinate.longitude),
  );
  if (valid.length < 2) {
    return [];
  }
  const cumulative = [0];
  for (let index = 1; index < valid.length; index += 1) {
    cumulative.push(
      cumulative[index - 1] + distanceMeters(valid[index - 1], valid[index]),
    );
  }
  const steps: RouteNavigationStep[] = [
    {
      id: "geometry-step-depart",
      instruction: "Continue on the saved route",
      maneuverType: "depart",
      modifier: null,
      roadName: null,
      distanceAlongMeters: 0,
      distanceMeters: cumulative.at(-1) || 0,
      durationSeconds: null,
      coordinate: valid[0],
    },
  ];
  let lastStepDistance = 0;
  for (let index = 1; index < valid.length - 1; index += 1) {
    const distanceAlong = cumulative[index];
    if (distanceAlong - lastStepDistance < 45) {
      continue;
    }
    const turn = signedTurnDegrees(
      bearingDegrees(valid[index - 1], valid[index]),
      bearingDegrees(valid[index], valid[index + 1]),
    );
    if (Math.abs(turn) < 38) {
      continue;
    }
    const direction = turn > 0 ? "right" : "left";
    steps.push({
      id: `geometry-step-${steps.length + 1}`,
      instruction: `Turn ${direction} to stay on the saved route`,
      maneuverType: "turn",
      modifier: direction,
      roadName: null,
      distanceAlongMeters: distanceAlong,
      distanceMeters: cumulative[index + 1] - distanceAlong,
      durationSeconds: null,
      coordinate: valid[index],
    });
    lastStepDistance = distanceAlong;
    if (steps.length >= MAX_GUIDANCE_STEPS - 1) {
      break;
    }
  }
  steps.push({
    id: "geometry-step-arrive",
    instruction: "Arrive at destination",
    maneuverType: "arrive",
    modifier: null,
    roadName: null,
    distanceAlongMeters: cumulative.at(-1) || 0,
    distanceMeters: 0,
    durationSeconds: 0,
    coordinate: valid.at(-1) as LatLng,
  });
  return steps;
}

function distanceMeters(start: LatLng, end: LatLng): number {
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function bearingDegrees(start: LatLng, end: LatLng): number {
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const y = Math.sin(longitudeDelta) * Math.cos(endLatitude);
  const x = Math.cos(startLatitude) * Math.sin(endLatitude) -
    Math.sin(startLatitude) * Math.cos(endLatitude) * Math.cos(longitudeDelta);
  return Math.atan2(y, x) * (180 / Math.PI);
}

function signedTurnDegrees(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function toRadians(value: number): number {
  return value * (Math.PI / 180);
}

export function normalizeRouteNavigationSteps(value: unknown): RouteNavigationStep[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const steps = value.map((item, index): RouteNavigationStep | null => {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const record = item as Record<string, unknown>;
    const coordinate = normalizeCoordinate(record.coordinate ?? record.location);
    const instruction = cleanText(record.instruction ?? record.message, 240);
    const distanceAlongMeters = nonNegativeNumber(
      record.distance_along_meters ?? record.distanceAlongMeters ?? record.routeOffsetInMeters
    );
    if (!coordinate || !instruction || distanceAlongMeters === null) {
      return null;
    }
    return {
      id: cleanText(record.id, 80) || `route-step-${index + 1}`,
      instruction,
      maneuverType: cleanText(
        record.maneuver_type ?? record.maneuverType ?? record.maneuver,
        48
      ) || 'continue',
      modifier: cleanText(record.modifier, 48) || null,
      roadName: cleanText(record.road_name ?? record.roadName ?? record.street, 120) || null,
      distanceAlongMeters,
      distanceMeters: nonNegativeNumber(record.distance_meters ?? record.distanceMeters ?? record.distance),
      durationSeconds: nonNegativeNumber(record.duration_seconds ?? record.durationSeconds ?? record.duration),
      coordinate
    };
  }).filter((step): step is RouteNavigationStep => step !== null)
    .sort((left, right) => left.distanceAlongMeters - right.distanceAlongMeters)
    .slice(0, MAX_GUIDANCE_STEPS);

  const seen = new Set<string>();
  return steps.filter((step) => {
    const signature = `${step.instruction.toLowerCase()}|${Math.round(step.distanceAlongMeters)}`;
    if (seen.has(signature)) {
      return false;
    }
    seen.add(signature);
    return true;
  });
}

export function resolveUpcomingNavigationStep(
  steps: RouteNavigationStep[] | null | undefined,
  travelledDistanceMeters: number
): { distanceToStepMeters: number; step: RouteNavigationStep } | null {
  if (!Array.isArray(steps) || !steps.length) {
    return null;
  }
  const travelled = Number.isFinite(travelledDistanceMeters)
    ? Math.max(0, travelledDistanceMeters)
    : 0;
  const upcoming = steps.find((step, index) =>
    step.distanceAlongMeters >= travelled + (index === 0 ? 0 : UPCOMING_STEP_BUFFER_METERS)
  ) ?? steps.at(-1);
  if (!upcoming) {
    return null;
  }
  return {
    distanceToStepMeters: Math.max(0, upcoming.distanceAlongMeters - travelled),
    step: upcoming
  };
}

function normalizeCoordinate(value: unknown): LatLng | null {
  if (Array.isArray(value) && value.length >= 2) {
    const longitude = Number(value[0]);
    const latitude = Number(value[1]);
    return validCoordinate(latitude, longitude) ? { latitude, longitude } : null;
  }
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const latitude = Number(record.latitude ?? record.lat);
  const longitude = Number(record.longitude ?? record.lon ?? record.lng);
  return validCoordinate(latitude, longitude) ? { latitude, longitude } : null;
}

function validCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude) &&
    latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function nonNegativeNumber(value: unknown): number | null {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : null;
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}
