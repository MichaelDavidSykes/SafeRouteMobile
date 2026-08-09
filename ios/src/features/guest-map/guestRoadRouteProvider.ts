import type { LatLng } from 'react-native-maps';

import { haversineDistanceMeters } from '../live-map/routeGeometry';
import type {
  RiskZone,
  RouteNavigationStep,
  SafeRouteTravelMode,
} from '../live-map/liveMapTypes';
import {
  normalizeRouteAvoidRectangles,
  routeIntersectsAvoidRectangles,
  type RouteAvoidRectangle
} from './routeAvoidanceGeometry';
import type { SafeRouteRoutePreferences } from './routePreferences';

export type GuestRoadRouteProvider = 'osrm' | 'tomtom';

export type SafeRouteRiskAvoidanceProof = {
  coverageStatus: 'complete' | 'current-empty';
  criticalCrossedAreaCount: number;
  crossedAreaCount: number;
  ignoredAreaCount: 0;
  policyVersion: 'safe-route-v1';
  riskExposureMeters: number;
  status: 'verified' | 'not-required' | 'best-effort';
};

export type GuestRoadRouteAlternative = {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  guidanceSteps: RouteNavigationStep[];
  provider: GuestRoadRouteProvider;
  snapped: true;
};

export type GuestRoadRoutePreview = {
  alternatives?: GuestRoadRouteAlternative[];
  coordinates: LatLng[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  provider: GuestRoadRouteProvider;
  snapped: boolean;
  guidanceSteps?: RouteNavigationStep[];
  routeAlerts?: RiskZone[];
};

export type VerifiedSafeRouteAlternative = GuestRoadRouteAlternative & {
  riskAvoidance: SafeRouteRiskAvoidanceProof;
  riskZones: RiskZone[];
};

export type VerifiedSafeRoutePreview = Omit<
  GuestRoadRoutePreview,
  'alternatives'
> & {
  alternatives?: VerifiedSafeRouteAlternative[];
  riskAvoidance: SafeRouteRiskAvoidanceProof;
  riskZones: RiskZone[];
};

export type GuestRoadRoutePreviewOptions = {
  avoidRectangles?: GuestRouteAvoidRectangle[];
  request?: typeof fetch;
  signal?: AbortSignal;
  stops: LatLng[];
  timeoutMs?: number;
  travelMode?: SafeRouteTravelMode;
  preferences?: SafeRouteRoutePreferences;
};

export type GuestRouteAvoidRectangle = RouteAvoidRectangle;

const OSRM_ROUTE_BASE_URLS: Partial<Record<SafeRouteTravelMode, string>> = {
  drive: 'https://router.project-osrm.org/route/v1/driving',
  walk: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
  cycle: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
};
const GUEST_ROUTE_PROVIDER_TIMEOUT_MS = 8000;
const GUEST_ROUTE_PROVIDER_MAX_STOPS = 25;
const GUEST_ROUTE_PROVIDER_MAX_COORDINATES = 1400;
const GUEST_ROUTE_PROVIDER_ENDPOINT_CONNECTOR_THRESHOLD_METERS = 2;
const GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS = 800;
const GUEST_ROUTE_TARGET_ALTERNATIVE_COUNT = 2;
const GUEST_ROUTE_MAX_ALTERNATIVE_DISTANCE_FACTOR = 3;
const GUEST_ROUTE_MAX_ALTERNATIVE_DURATION_FACTOR = 3.5;
const GUEST_ROUTE_MIN_DETOUR_OFFSET_METERS = 260;
const GUEST_ROUTE_MAX_DETOUR_OFFSET_METERS = 1200;
const GUEST_ROUTE_RISK_DETOUR_CLEARANCE_METERS = [260, 520, 900] as const;
const GUEST_ROUTE_MAX_DETOUR_REQUESTS = 8;

export async function fetchGuestRoadRoutePreview({
  avoidRectangles = [],
  request = fetch,
  signal,
  stops,
  timeoutMs = GUEST_ROUTE_PROVIDER_TIMEOUT_MS,
  travelMode = 'drive',
}: GuestRoadRoutePreviewOptions): Promise<GuestRoadRoutePreview | null> {
  const routeStops = normalizeRouteStops(stops);
  if (routeStops.length < 2) {
    return null;
  }

  const timeoutSignal = createTimeoutSignal(signal, timeoutMs);

  try {
    const routeUrl = buildOsrmRouteUrl(routeStops, travelMode);
    const response = await request(routeUrl, {
      signal: timeoutSignal.signal
    });

    if (!response.ok) {
      return null;
    }

    const normalizedAvoidRectangles =
      normalizeRouteAvoidRectangles(avoidRectangles);
    const providerPayload = await response.json();
    const providerCandidates = normalizeOsrmRouteCandidates(
      providerPayload,
      routeStops,
    );
    const primaryPreview = normalizeOsrmRoutePreview(
      providerPayload,
      routeStops,
      normalizedAvoidRectangles,
    );
    if (
      primaryPreview &&
      (primaryPreview.alternatives?.length ?? 0) >=
        GUEST_ROUTE_TARGET_ALTERNATIVE_COUNT
    ) {
      return primaryPreview;
    }

    const detourStopSets = createRouteDetourStopSets(
      routeStops,
      normalizedAvoidRectangles,
      providerCandidates.map(({ coordinates }) => coordinates),
    );
    const detourPreviews = await Promise.all(
      detourStopSets.map(async (detourStops) => {
        try {
          const detourResponse = await request(
            buildOsrmRouteUrl(detourStops, travelMode),
            { signal: timeoutSignal.signal },
          );
          if (!detourResponse.ok) {
            return null;
          }
          const detourPayload = await detourResponse.json();
          return normalizeOsrmRoutePreview(
            detourPayload,
            detourStops,
            normalizedAvoidRectangles,
          );
        } catch {
          return null;
        }
      }),
    );

    const validDetourPreviews = detourPreviews.filter(
      (preview): preview is GuestRoadRoutePreview => Boolean(preview),
    );
    const resolvedPrimary = primaryPreview || validDetourPreviews
      .slice()
      .sort(compareGuestRoutePreviews)[0];
    if (!resolvedPrimary) {
      return null;
    }

    return mergeGuestRoutePreviewAlternatives(resolvedPrimary, [
      ...validDetourPreviews.filter(
        (preview) =>
          routePreviewSignature(preview) !==
          routePreviewSignature(resolvedPrimary),
      ),
    ]);
  } catch {
    return null;
  } finally {
    timeoutSignal.cleanup();
  }
}

export function buildOsrmRouteUrl(
  stops: LatLng[],
  travelMode: SafeRouteTravelMode = 'drive',
): string {
  const normalizedStops = normalizeRouteStops(stops);
  if (normalizedStops.length < 2) {
    throw new Error('At least two valid stops are required to request a guest road route.');
  }

  const coordinatePath = normalizedStops
    .map((stop) => `${formatCoordinate(stop.longitude)},${formatCoordinate(stop.latitude)}`)
    .join(';');
  const searchParams = new URLSearchParams({
    alternatives: 'true',
    continue_straight: 'false',
    geometries: 'geojson',
    overview: 'full',
    steps: 'true'
  });
  const routeBaseUrl = OSRM_ROUTE_BASE_URLS[travelMode];
  if (!routeBaseUrl) {
    throw new Error(`No public route profile is configured for ${travelMode}.`);
  }

  return `${routeBaseUrl}/${coordinatePath}?${searchParams.toString()}`;
}

function normalizeOsrmRoutePreview(
  payload: unknown,
  stops: LatLng[],
  avoidRectangles: GuestRouteAvoidRectangle[] = []
): GuestRoadRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  if (record.code !== 'Ok' || !Array.isArray(record.routes) || !record.routes.length) {
    return null;
  }

  const candidates = normalizeOsrmRouteCandidates(payload, stops)
    .filter((route) => !routeIntersectsAvoidRectangles(route.coordinates, avoidRectangles))
    .sort((left, right) =>
      (left.durationSeconds ?? Number.POSITIVE_INFINITY) -
        (right.durationSeconds ?? Number.POSITIVE_INFINITY) ||
      (left.distanceMeters ?? Number.POSITIVE_INFINITY) -
        (right.distanceMeters ?? Number.POSITIVE_INFINITY)
    );

  const primary = candidates[0];
  if (!primary) {
    return null;
  }

  return {
    ...primary,
    alternatives: candidates
      .slice(1, GUEST_ROUTE_TARGET_ALTERNATIVE_COUNT + 1)
      .map(toGuestRoadRouteAlternative)
      .filter(
        (alternative): alternative is GuestRoadRouteAlternative =>
          Boolean(alternative),
      ),
  };
}

function normalizeOsrmRouteCandidates(
  payload: unknown,
  stops: LatLng[],
): GuestRoadRoutePreview[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const record = payload as Record<string, unknown>;
  if (record.code !== 'Ok' || !Array.isArray(record.routes)) {
    return [];
  }
  return dedupeRoutePreviews(record.routes
    .map((route) => normalizeOsrmRouteCandidate(route, stops))
    .filter((route): route is GuestRoadRoutePreview => Boolean(route)));
}

function normalizeOsrmRouteCandidate(
  payload: unknown,
  stops: LatLng[]
): GuestRoadRoutePreview | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const route = payload as Record<string, unknown>;
  const geometry = route.geometry as Record<string, unknown> | undefined;
  const coordinates = normalizeOsrmGeometryCoordinates(geometry?.coordinates);
  if (
    coordinates.length < 2 ||
    !routeCoversRequestedEndpoints(coordinates, stops) ||
    !routeCoversRequestedStopsInOrder(coordinates, stops)
  ) {
    return null;
  }

  return {
    coordinates: preserveRequestedEndpointConnectors(
      downsampleRouteCoordinates(coordinates),
      stops[0],
      stops[stops.length - 1]
    ),
    distanceMeters: normalizePositiveNumber(route.distance),
    durationSeconds: normalizePositiveNumber(route.duration),
    provider: 'osrm',
    snapped: true,
    guidanceSteps: normalizeOsrmGuidanceSteps(route.legs),
    routeAlerts: []
  };
}

function normalizeOsrmGuidanceSteps(value: unknown): RouteNavigationStep[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const guidanceSteps: RouteNavigationStep[] = [];
  let distanceAlongMeters = 0;

  for (const leg of value) {
    if (!leg || typeof leg !== 'object') {
      continue;
    }
    const steps = (leg as Record<string, unknown>).steps;
    if (!Array.isArray(steps)) {
      continue;
    }
    for (const stepValue of steps) {
      if (!stepValue || typeof stepValue !== 'object') {
        continue;
      }
      const step = stepValue as Record<string, unknown>;
      const maneuver = step.maneuver && typeof step.maneuver === 'object'
        ? step.maneuver as Record<string, unknown>
        : {};
      const coordinate = normalizeOsrmManeuverCoordinate(maneuver.location);
      const maneuverType = cleanOsrmText(maneuver.type, 48) || 'continue';
      const modifier = cleanOsrmText(maneuver.modifier, 48);
      const roadName = cleanOsrmText(step.name, 120);
      const distanceMeters = normalizePositiveNumber(step.distance);
      const durationSeconds = normalizePositiveNumber(step.duration);

      if (coordinate) {
        guidanceSteps.push({
          id: `osrm-step-${guidanceSteps.length + 1}`,
          instruction: createOsrmInstruction({
            maneuverType,
            modifier,
            roadName,
          }),
          maneuverType,
          ...(modifier ? { modifier } : {}),
          ...(roadName ? { roadName } : {}),
          distanceAlongMeters,
          distanceMeters,
          durationSeconds,
          coordinate,
        });
      }
      distanceAlongMeters += distanceMeters ?? 0;
    }
  }

  return guidanceSteps;
}

function normalizeOsrmManeuverCoordinate(value: unknown): LatLng | null {
  if (!Array.isArray(value) || value.length < 2) {
    return null;
  }
  const coordinate = {
    latitude: Number(value[1]),
    longitude: Number(value[0]),
  };
  return isValidLatLng(coordinate) ? coordinate : null;
}

function createOsrmInstruction({
  maneuverType,
  modifier,
  roadName,
}: {
  maneuverType: string;
  modifier: string;
  roadName: string;
}): string {
  const destination = roadName ? ` onto ${roadName}` : '';
  if (maneuverType === 'depart') {
    return roadName ? `Start on ${roadName}` : 'Start route';
  }
  if (maneuverType === 'arrive') {
    return 'Arrive at destination';
  }
  if (maneuverType === 'roundabout' || maneuverType === 'rotary') {
    return `Enter the roundabout${destination}`;
  }
  if (maneuverType === 'merge') {
    return `Merge${modifier ? ` ${modifier}` : ''}${destination}`;
  }
  if (maneuverType === 'fork') {
    return `Keep${modifier ? ` ${modifier}` : ' straight'}${destination}`;
  }
  if (maneuverType === 'turn' || modifier) {
    return `Turn${modifier ? ` ${modifier}` : ''}${destination}`;
  }
  return roadName ? `Continue on ${roadName}` : 'Continue on route';
}

function cleanOsrmText(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').slice(0, maxLength)
    : '';
}

function createRouteDetourStopSets(
  stops: LatLng[],
  avoidRectangles: GuestRouteAvoidRectangle[] = [],
  providerRoutes: LatLng[][] = [],
): LatLng[][] {
  if (stops.length < 2) {
    return [];
  }

  let longestSegmentIndex = 0;
  let longestSegmentMeters = 0;
  for (let index = 0; index < stops.length - 1; index += 1) {
    const segmentMeters = haversineDistanceMeters(stops[index], stops[index + 1]);
    if (segmentMeters > longestSegmentMeters) {
      longestSegmentMeters = segmentMeters;
      longestSegmentIndex = index;
    }
  }

  const start = stops[longestSegmentIndex];
  const end = stops[longestSegmentIndex + 1];
  const centerLatitude = (start.latitude + end.latitude) / 2;
  const metersPerLongitudeDegree = Math.max(
    1,
    111320 * Math.abs(Math.cos(centerLatitude * Math.PI / 180)),
  );
  const deltaX = (end.longitude - start.longitude) * metersPerLongitudeDegree;
  const deltaY = (end.latitude - start.latitude) * 110574;
  const segmentLength = Math.hypot(deltaX, deltaY);
  if (segmentLength < 120) {
    return [];
  }

  const perpendicularX = -deltaY / segmentLength;
  const perpendicularY = deltaX / segmentLength;

  const genericCandidates = [0.16, 0.28].flatMap((offsetFactor) =>
    [-1, 1].map((side) => {
      const offsetMeters = Math.max(
        GUEST_ROUTE_MIN_DETOUR_OFFSET_METERS,
        Math.min(
          GUEST_ROUTE_MAX_DETOUR_OFFSET_METERS,
          longestSegmentMeters * offsetFactor,
        ),
      );
      const detourStop = {
        latitude:
          centerLatitude +
          (perpendicularY * offsetMeters * side) / 110574,
        longitude:
          (start.longitude + end.longitude) / 2 +
          (perpendicularX * offsetMeters * side) /
            metersPerLongitudeDegree,
      };
      return [
        ...stops.slice(0, longestSegmentIndex + 1),
        detourStop,
        ...stops.slice(longestSegmentIndex + 1),
      ];
    }),
  ).filter((candidateStops) => candidateStops.every(isValidLatLng));

  const riskBoundaryCandidates = createRiskBoundaryDetourStopSets(
    stops,
    avoidRectangles,
    longestSegmentIndex,
    providerRoutes,
  );
  const seen = new Set<string>();
  return [
    ...riskBoundaryCandidates,
    ...genericCandidates,
  ].filter((candidateStops) => {
    const key = candidateStops
      .map((stop) => `${stop.latitude.toFixed(5)},${stop.longitude.toFixed(5)}`)
      .join('|');
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).slice(0, GUEST_ROUTE_MAX_DETOUR_REQUESTS);
}

function createRiskBoundaryDetourStopSets(
  stops: LatLng[],
  avoidRectangles: GuestRouteAvoidRectangle[],
  segmentIndex: number,
  providerRoutes: LatLng[][],
): LatLng[][] {
  if (!avoidRectangles.length) {
    return [];
  }

  const segmentStart = stops[segmentIndex];
  const segmentEnd = stops[segmentIndex + 1];
  const rankedRectangles = avoidRectangles
    .map((rectangle) => ({
      rectangle,
      intersectsProviderRoute: providerRoutes.some((route) =>
        routeIntersectsAvoidRectangles(route, [rectangle])
      ),
      distanceMeters: distanceFromCoordinateToSegmentMeters(
        rectangleCenter(rectangle),
        segmentStart,
        segmentEnd,
      ),
    }))
    .sort((left, right) =>
      Number(right.intersectsProviderRoute) -
        Number(left.intersectsProviderRoute) ||
      left.distanceMeters - right.distanceMeters
    );
  const providerRouteRectangles = rankedRectangles.filter(
    ({ intersectsProviderRoute }) => intersectsProviderRoute,
  );
  const selectedRectangles = (
    providerRouteRectangles.length
      ? providerRouteRectangles
      : rankedRectangles.slice(0, 1)
  ).slice(0, 3);

  const combinedCandidates = selectedRectangles.length > 1
    ? [0, 1].map((sideIndex) => {
      const anchors = selectedRectangles.flatMap(({ rectangle }) =>
      riskRectangleDetourSides(
        rectangle,
        segmentStart,
        segmentEnd,
        GUEST_ROUTE_RISK_DETOUR_CLEARANCE_METERS[1],
      )[sideIndex]
      ).sort(
        (left, right) =>
          haversineDistanceMeters(segmentStart, left) -
          haversineDistanceMeters(segmentStart, right),
      );
      return [
        ...stops.slice(0, segmentIndex + 1),
        ...anchors,
        ...stops.slice(segmentIndex + 1),
      ];
    })
    : [];

  const individualCandidates = selectedRectangles.flatMap(({ rectangle }) =>
    GUEST_ROUTE_RISK_DETOUR_CLEARANCE_METERS.flatMap((clearanceMeters) =>
      riskRectangleDetourSides(
        rectangle,
        segmentStart,
        segmentEnd,
        clearanceMeters,
      ).map((anchors) => [
        ...stops.slice(0, segmentIndex + 1),
        ...anchors.slice().sort(
          (left, right) =>
            haversineDistanceMeters(segmentStart, left) -
            haversineDistanceMeters(segmentStart, right),
        ),
        ...stops.slice(segmentIndex + 1),
      ])
    )
  );
  return [
    ...combinedCandidates,
    ...individualCandidates,
  ].filter((candidateStops) => candidateStops.every(isValidLatLng));
}

function riskRectangleDetourSides(
  rectangle: GuestRouteAvoidRectangle,
  segmentStart: LatLng,
  segmentEnd: LatLng,
  clearanceMeters: number,
): [LatLng[], LatLng[]] {
  const centerLatitude =
    (rectangle.minLatitude + rectangle.maxLatitude) / 2;
  const latitudeClearance =
    clearanceMeters / 110574;
  const longitudeClearance =
    clearanceMeters /
    Math.max(
      1,
      111320 * Math.abs(Math.cos(centerLatitude * Math.PI / 180)),
    );
  const west = rectangle.minLongitude - longitudeClearance;
  const east = rectangle.maxLongitude + longitudeClearance;
  const south = rectangle.minLatitude - latitudeClearance;
  const north = rectangle.maxLatitude + latitudeClearance;
  const deltaLongitude = Math.abs(
    segmentEnd.longitude - segmentStart.longitude,
  );
  const deltaLatitude = Math.abs(
    segmentEnd.latitude - segmentStart.latitude,
  );
  return deltaLongitude >= deltaLatitude
    ? [
        [
          { latitude: north, longitude: west },
          { latitude: north, longitude: east },
        ],
        [
          { latitude: south, longitude: west },
          { latitude: south, longitude: east },
        ],
      ]
    : [
        [
          { latitude: south, longitude: west },
          { latitude: north, longitude: west },
        ],
        [
          { latitude: south, longitude: east },
          { latitude: north, longitude: east },
        ],
      ];
}

function rectangleCenter(
  rectangle: GuestRouteAvoidRectangle,
): LatLng {
  return {
    latitude: (rectangle.minLatitude + rectangle.maxLatitude) / 2,
    longitude: (rectangle.minLongitude + rectangle.maxLongitude) / 2,
  };
}

function distanceFromCoordinateToSegmentMeters(
  coordinate: LatLng,
  segmentStart: LatLng,
  segmentEnd: LatLng,
): number {
  const centerLatitude =
    (segmentStart.latitude + segmentEnd.latitude + coordinate.latitude) / 3;
  const metersPerLongitudeDegree = Math.max(
    1,
    111320 * Math.abs(Math.cos(centerLatitude * Math.PI / 180)),
  );
  const endX =
    (segmentEnd.longitude - segmentStart.longitude) *
    metersPerLongitudeDegree;
  const endY = (segmentEnd.latitude - segmentStart.latitude) * 110574;
  const pointX =
    (coordinate.longitude - segmentStart.longitude) *
    metersPerLongitudeDegree;
  const pointY = (coordinate.latitude - segmentStart.latitude) * 110574;
  const segmentLengthSquared = endX * endX + endY * endY;
  if (segmentLengthSquared <= 0) {
    return Math.hypot(pointX, pointY);
  }
  const projection = Math.max(
    0,
    Math.min(1, (pointX * endX + pointY * endY) / segmentLengthSquared),
  );
  return Math.hypot(
    pointX - projection * endX,
    pointY - projection * endY,
  );
}

function mergeGuestRoutePreviewAlternatives(
  primary: GuestRoadRoutePreview,
  supplementalPreviews: GuestRoadRoutePreview[],
): GuestRoadRoutePreview {
  const primaryDistance = primary.distanceMeters ?? measureRouteDistance(primary.coordinates);
  const primaryDuration = primary.durationSeconds;
  const candidates = dedupeRoutePreviews([
    ...previewAlternativesAsPreviews(primary),
    ...supplementalPreviews.flatMap(previewAlternativesAsPreviews),
  ]).filter((candidate) => {
    const candidateDistance =
      candidate.distanceMeters ?? measureRouteDistance(candidate.coordinates);
    if (
      primaryDistance > 0 &&
      candidateDistance >
        primaryDistance * GUEST_ROUTE_MAX_ALTERNATIVE_DISTANCE_FACTOR
    ) {
      return false;
    }
    return !(
      primaryDuration &&
      candidate.durationSeconds &&
      candidate.durationSeconds >
        primaryDuration * GUEST_ROUTE_MAX_ALTERNATIVE_DURATION_FACTOR
    );
  });

  const primarySignature = routePreviewSignature(primary);
  const alternatives = candidates
    .filter((candidate) => routePreviewSignature(candidate) !== primarySignature)
    .slice(0, GUEST_ROUTE_TARGET_ALTERNATIVE_COUNT)
    .map(toGuestRoadRouteAlternative)
    .filter(
      (alternative): alternative is GuestRoadRouteAlternative =>
        Boolean(alternative),
    );

  return {
    ...primary,
    alternatives,
  };
}

function previewAlternativesAsPreviews(
  preview: GuestRoadRoutePreview,
): GuestRoadRoutePreview[] {
  return [
    {
      ...preview,
      alternatives: undefined,
    },
    ...(preview.alternatives || []).map((alternative) => ({
      ...alternative,
      alternatives: undefined,
      routeAlerts: [],
    })),
  ];
}

function toGuestRoadRouteAlternative(
  preview: GuestRoadRoutePreview,
): GuestRoadRouteAlternative | null {
  const distanceMeters =
    preview.distanceMeters ?? measureRouteDistance(preview.coordinates);
  const durationSeconds = preview.durationSeconds;
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters <= 0 ||
    !durationSeconds ||
    !Number.isFinite(durationSeconds)
  ) {
    return null;
  }

  return {
    coordinates: preview.coordinates,
    distanceMeters,
    durationSeconds,
    guidanceSteps: preview.guidanceSteps || [],
    provider: preview.provider,
    snapped: true,
  };
}

function dedupeRoutePreviews(
  previews: GuestRoadRoutePreview[],
): GuestRoadRoutePreview[] {
  const signatures = new Set<string>();
  return previews.filter((preview) => {
    const signature = routePreviewSignature(preview);
    if (!signature || signatures.has(signature)) {
      return false;
    }
    signatures.add(signature);
    return true;
  });
}

function routePreviewSignature(preview: GuestRoadRoutePreview): string {
  const coordinates = preview.coordinates;
  if (coordinates.length < 2) {
    return '';
  }
  const sampleCount = Math.min(24, coordinates.length);
  return Array.from({ length: sampleCount }, (_, index) => {
    const coordinateIndex = Math.round(
      index * (coordinates.length - 1) / Math.max(1, sampleCount - 1),
    );
    const coordinate = coordinates[coordinateIndex];
    return `${coordinate.latitude.toFixed(4)},${coordinate.longitude.toFixed(4)}`;
  }).join('|');
}

function measureRouteDistance(coordinates: LatLng[]): number {
  return coordinates.slice(1).reduce(
    (total, coordinate, index) =>
      total + haversineDistanceMeters(coordinates[index], coordinate),
    0,
  );
}

function compareGuestRoutePreviews(
  left: GuestRoadRoutePreview,
  right: GuestRoadRoutePreview,
): number {
  return (
    (left.durationSeconds ?? Number.POSITIVE_INFINITY) -
      (right.durationSeconds ?? Number.POSITIVE_INFINITY) ||
    (left.distanceMeters ?? Number.POSITIVE_INFINITY) -
      (right.distanceMeters ?? Number.POSITIVE_INFINITY)
  );
}

function routeCoversRequestedStopsInOrder(coordinates: LatLng[], stops: LatLng[]): boolean {
  let routeStartIndex = 0;
  for (const stop of stops) {
    let nearestIndex = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = routeStartIndex; index < coordinates.length; index += 1) {
      const distance = haversineDistanceMeters(coordinates[index], stop);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }
    if (nearestIndex < 0 || nearestDistance > GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS) {
      return false;
    }
    routeStartIndex = nearestIndex;
  }
  return true;
}

function normalizeOsrmGeometryCoordinates(coordinates: unknown): LatLng[] {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  const normalized: LatLng[] = [];

  for (const coordinate of coordinates) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) {
      continue;
    }

    const longitude = Number(coordinate[0]);
    const latitude = Number(coordinate[1]);
    const nextCoordinate = {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6))
    };

    if (!isValidLatLng(nextCoordinate)) {
      continue;
    }

    const previous = normalized[normalized.length - 1];
    if (!previous || haversineDistanceMeters(previous, nextCoordinate) >= 1) {
      normalized.push(nextCoordinate);
    }
  }

  return normalized;
}

function normalizeRouteStops(stops: LatLng[]): LatLng[] {
  const validStops = stops.filter(isValidLatLng);
  const compactStops: LatLng[] = [];

  for (const [index, stop] of validStops.entries()) {
    const isEndpoint = index === 0 || index === validStops.length - 1;
    const previousStop = compactStops[compactStops.length - 1];

    if (isEndpoint || !previousStop || haversineDistanceMeters(previousStop, stop) >= 15) {
      compactStops.push(stop);
    }
  }

  return limitRouteStops(compactStops);
}

function limitRouteStops(stops: LatLng[]): LatLng[] {
  if (stops.length <= GUEST_ROUTE_PROVIDER_MAX_STOPS) {
    return stops;
  }

  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const intermediateStops = stops.slice(1, -1);
  const intermediateBudget = GUEST_ROUTE_PROVIDER_MAX_STOPS - 2;
  const selectedIntermediateStops: LatLng[] = [];
  const selectedIndexes = new Set<number>();

  for (let index = 0; index < intermediateBudget; index += 1) {
    const sourceIndex = Math.round(
      (index * (intermediateStops.length - 1)) / Math.max(1, intermediateBudget - 1)
    );

    if (!selectedIndexes.has(sourceIndex)) {
      selectedIndexes.add(sourceIndex);
      selectedIntermediateStops.push(intermediateStops[sourceIndex]);
    }
  }

  return [origin, ...selectedIntermediateStops, destination];
}

function routeCoversRequestedEndpoints(coordinates: LatLng[], stops: LatLng[]): boolean {
  const firstCoordinate = coordinates[0];
  const lastCoordinate = coordinates[coordinates.length - 1];
  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];

  return (
    haversineDistanceMeters(firstCoordinate, firstStop) <= GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS &&
    haversineDistanceMeters(lastCoordinate, lastStop) <= GUEST_ROUTE_PROVIDER_MAX_ENDPOINT_SNAP_METERS
  );
}

function preserveRequestedEndpointConnectors(
  coordinates: LatLng[],
  origin: LatLng,
  destination: LatLng
): LatLng[] {
  const route = [...coordinates];
  const firstCoordinate = route[0];
  const lastCoordinate = route[route.length - 1];

  if (
    firstCoordinate &&
    haversineDistanceMeters(origin, firstCoordinate) >
      GUEST_ROUTE_PROVIDER_ENDPOINT_CONNECTOR_THRESHOLD_METERS
  ) {
    route.unshift(origin);
  }

  if (
    lastCoordinate &&
    haversineDistanceMeters(destination, lastCoordinate) >
      GUEST_ROUTE_PROVIDER_ENDPOINT_CONNECTOR_THRESHOLD_METERS
  ) {
    route.push(destination);
  }

  return route;
}

function downsampleRouteCoordinates(coordinates: LatLng[]): LatLng[] {
  if (coordinates.length <= GUEST_ROUTE_PROVIDER_MAX_COORDINATES) {
    return coordinates;
  }

  const step = Math.ceil(coordinates.length / GUEST_ROUTE_PROVIDER_MAX_COORDINATES);
  return coordinates.filter((_, index) => (
    index === 0 ||
    index === coordinates.length - 1 ||
    index % step === 0
  ));
}

function createTimeoutSignal(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number
): { cleanup: () => void; signal: AbortSignal } {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  const clearTimer = () => clearTimeout(timeout);
  const abortFromParent = () => {
    clearTimer();
    controller.abort();
  };

  if (parentSignal?.aborted) {
    abortFromParent();
    return {
      cleanup: clearTimer,
      signal: controller.signal
    };
  }

  parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  controller.signal.addEventListener('abort', clearTimer, { once: true });

  return {
    cleanup: () => {
      clearTimer();
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
    signal: controller.signal
  };
}

function normalizePositiveNumber(value: unknown): number | null {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : null;
}

function formatCoordinate(value: number): string {
  return Number(value.toFixed(6)).toString();
}

function isValidLatLng(coordinate?: LatLng | null): coordinate is LatLng {
  return Boolean(
    coordinate &&
      Number.isFinite(Number(coordinate.latitude)) &&
      Number.isFinite(Number(coordinate.longitude)) &&
      coordinate.latitude >= -90 &&
      coordinate.latitude <= 90 &&
      coordinate.longitude >= -180 &&
      coordinate.longitude <= 180
  );
}
