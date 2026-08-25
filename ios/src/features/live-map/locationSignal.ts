import { haversineDistanceMeters } from "./routeGeometry";

const ACTIVE_MAX_ACCURACY_METERS = 120;
const IDLE_MAX_ACCURACY_METERS = 250;
export const RELIABLE_LOCATION_MAX_WALL_AGE_MS = 2 * 60 * 1000;
export const RELIABLE_LOCATION_FUTURE_TOLERANCE_MS = 30_000;
const MAX_PLAUSIBLE_DRIVING_SPEED_METERS_PER_SECOND = 80;
const JUMP_ACCURACY_BUFFER_MULTIPLIER = 2;
const COORDINATE_SMOOTHING_DISTANCE_METERS = 60;
const JUMP_CONFIRMATION_MAX_AGE_MS = 15_000;
const JUMP_CONFIRMATION_MIN_RADIUS_METERS = 120;
const ACTIVE_RENDER_MIN_INTERVAL_MS = 750;
const ACTIVE_RENDER_IDLE_INTERVAL_MS = 2_000;
const ACTIVE_RENDER_MIN_DISTANCE_METERS = 2;
const ACTIVE_RENDER_MIN_HEADING_DEGREES = 10;

export interface ReliableLocationSample {
  accuracyMeters: number | null;
  headingDegrees: number | null;
  latitude: number;
  longitude: number;
  speedMetersPerSecond: number | null;
  timestampMs: number;
}

export interface LocationSignalState {
  jumpCandidate: ReliableLocationSample | null;
  rejectedSampleCount: number;
  sample: ReliableLocationSample | null;
}

export type LocationSignalTransitionReason =
  | "accepted"
  | "implausible-jump"
  | "invalid"
  | "poor-accuracy"
  | "stale";

export interface LocationSignalTransition {
  accepted: boolean;
  quality: "degraded" | "good";
  reason: LocationSignalTransitionReason;
  state: LocationSignalState;
}

export function createLocationSignalState(
  sample: ReliableLocationSample | null = null,
): LocationSignalState {
  return {
    jumpCandidate: null,
    rejectedSampleCount: 0,
    sample: sample ? copyLocationSample(sample) : null,
  };
}

export function isReliableLocationSampleRecent(
  value: unknown,
  nowMs = Date.now(),
): value is ReliableLocationSample {
  const sample = normalizeReliableLocationSample(value);
  return Boolean(
      sample &&
      sample.timestampMs <= nowMs + RELIABLE_LOCATION_FUTURE_TOLERANCE_MS &&
      nowMs - sample.timestampMs <= RELIABLE_LOCATION_MAX_WALL_AGE_MS,
  );
}

export function normalizeReliableLocationSample(
  value: unknown,
): ReliableLocationSample | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);
  const timestampMs = Number(record.timestampMs);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180 ||
    !Number.isFinite(timestampMs) ||
    timestampMs <= 0
  ) {
    return null;
  }

  return {
    accuracyMeters: normalizeOptionalNonNegativeNumber(record.accuracyMeters),
    headingDegrees: normalizeOptionalHeading(record.headingDegrees),
    latitude,
    longitude,
    speedMetersPerSecond: normalizeOptionalNonNegativeNumber(
      record.speedMetersPerSecond,
    ),
    timestampMs,
  };
}

export function canAcceptLocationSource(
  mocked: unknown,
  developmentRuntime: boolean,
): boolean {
  return mocked !== true || developmentRuntime;
}

export function shouldPublishReliableLocationSample(
  previousPublishedSample: ReliableLocationSample | null,
  incomingSample: ReliableLocationSample,
  { navigationActive = false }: { navigationActive?: boolean } = {},
): boolean {
  if (!navigationActive || !previousPublishedSample) {
    return true;
  }

  const elapsedMs = incomingSample.timestampMs - previousPublishedSample.timestampMs;
  if (elapsedMs < ACTIVE_RENDER_MIN_INTERVAL_MS) {
    return false;
  }

  if (
    haversineDistanceMeters(previousPublishedSample, incomingSample) >=
      ACTIVE_RENDER_MIN_DISTANCE_METERS ||
    headingDistanceDegrees(
      previousPublishedSample.headingDegrees,
      incomingSample.headingDegrees,
    ) >= ACTIVE_RENDER_MIN_HEADING_DEGREES
  ) {
    return true;
  }

  return elapsedMs >= ACTIVE_RENDER_IDLE_INTERVAL_MS;
}

export function applyReliableLocationSample(
  state: LocationSignalState,
  incomingValue: unknown,
  {
    navigationActive = false,
    nowMs = null,
  }: { navigationActive?: boolean; nowMs?: number | null } = {},
): LocationSignalTransition {
  const incoming = normalizeReliableLocationSample(incomingValue);
  if (!incoming) {
    return rejectedTransition(state, "invalid");
  }

  if (
    nowMs !== null &&
    (incoming.timestampMs > nowMs + RELIABLE_LOCATION_FUTURE_TOLERANCE_MS ||
      nowMs - incoming.timestampMs > RELIABLE_LOCATION_MAX_WALL_AGE_MS)
  ) {
    return rejectedTransition(state, "stale");
  }

  const previous = state.sample;
  if (previous && incoming.timestampMs <= previous.timestampMs) {
    return rejectedTransition(state, "stale");
  }

  const maxAccuracyMeters = navigationActive
    ? ACTIVE_MAX_ACCURACY_METERS
    : IDLE_MAX_ACCURACY_METERS;
  if (
    incoming.accuracyMeters !== null &&
    incoming.accuracyMeters > maxAccuracyMeters
  ) {
    return rejectedTransition(state, "poor-accuracy");
  }

  if (previous && isImplausibleJump(previous, incoming)) {
    if (isConfirmedJump(state.jumpCandidate, incoming)) {
      return acceptedTransition(state, copyLocationSample(incoming));
    }

    return rejectedTransition(state, "implausible-jump", incoming);
  }

  const acceptedSample = previous
    ? smoothLocationSample(previous, incoming)
    : copyLocationSample(incoming);
  return acceptedTransition(state, acceptedSample);
}

function acceptedTransition(
  state: LocationSignalState,
  sample: ReliableLocationSample,
): LocationSignalTransition {
  return {
    accepted: true,
    quality: locationQuality(sample),
    reason: "accepted",
    state: {
      jumpCandidate: null,
      rejectedSampleCount: state.rejectedSampleCount,
      sample,
    },
  };
}

function rejectedTransition(
  state: LocationSignalState,
  reason: Exclude<LocationSignalTransitionReason, "accepted">,
  jumpCandidate = state.jumpCandidate,
): LocationSignalTransition {
  return {
    accepted: false,
    quality:
      reason === "poor-accuracy" || reason === "implausible-jump"
        ? "degraded"
        : state.sample
          ? locationQuality(state.sample)
          : "degraded",
    reason,
    state: {
      jumpCandidate: jumpCandidate
        ? copyLocationSample(jumpCandidate)
        : null,
      rejectedSampleCount: state.rejectedSampleCount + 1,
      sample: state.sample ? copyLocationSample(state.sample) : null,
    },
  };
}

function locationQuality(
  sample: ReliableLocationSample,
): LocationSignalTransition["quality"] {
  return sample.accuracyMeters === null || sample.accuracyMeters > 50
    ? "degraded"
    : "good";
}

function isConfirmedJump(
  candidate: ReliableLocationSample | null,
  incoming: ReliableLocationSample,
): boolean {
  if (
    !candidate ||
    incoming.timestampMs <= candidate.timestampMs ||
    incoming.timestampMs - candidate.timestampMs > JUMP_CONFIRMATION_MAX_AGE_MS
  ) {
    return false;
  }

  const confirmationRadiusMeters = Math.max(
    JUMP_CONFIRMATION_MIN_RADIUS_METERS,
    (candidate.accuracyMeters || 0) * 2,
    (incoming.accuracyMeters || 0) * 2,
  );
  return haversineDistanceMeters(candidate, incoming) <= confirmationRadiusMeters;
}

function isImplausibleJump(
  previous: ReliableLocationSample,
  incoming: ReliableLocationSample,
): boolean {
  const elapsedSeconds = Math.max(
    0.001,
    (incoming.timestampMs - previous.timestampMs) / 1000,
  );
  const distanceMeters = haversineDistanceMeters(previous, incoming);
  const accuracyBufferMeters =
    Math.max(
      previous.accuracyMeters || 0,
      incoming.accuracyMeters || 0,
      30,
    ) * JUMP_ACCURACY_BUFFER_MULTIPLIER;
  const plausibleDistanceMeters =
    elapsedSeconds * MAX_PLAUSIBLE_DRIVING_SPEED_METERS_PER_SECOND +
    accuracyBufferMeters;

  return distanceMeters > plausibleDistanceMeters;
}

function smoothLocationSample(
  previous: ReliableLocationSample,
  incoming: ReliableLocationSample,
): ReliableLocationSample {
  const distanceMeters = haversineDistanceMeters(previous, incoming);
  const elapsedMs = incoming.timestampMs - previous.timestampMs;
  const speed = incoming.speedMetersPerSecond || 0;
  const shouldSmoothCoordinate =
    elapsedMs <= 10_000 &&
    distanceMeters <= COORDINATE_SMOOTHING_DISTANCE_METERS &&
    (incoming.accuracyMeters === null || incoming.accuracyMeters <= 60);
  const coordinateAlpha = speed >= 8 ? 0.8 : speed >= 2 ? 0.65 : 0.35;
  const latitude = shouldSmoothCoordinate
    ? interpolate(previous.latitude, incoming.latitude, coordinateAlpha)
    : incoming.latitude;
  const longitude = shouldSmoothCoordinate
    ? interpolateLongitude(
        previous.longitude,
        incoming.longitude,
        coordinateAlpha,
      )
    : incoming.longitude;

  return {
    ...incoming,
    headingDegrees: smoothHeading(previous, incoming),
    latitude,
    longitude,
  };
}

function headingDistanceDegrees(
  first: number | null,
  second: number | null,
): number {
  if (
    first === null ||
    second === null ||
    !Number.isFinite(first) ||
    !Number.isFinite(second)
  ) {
    return 0;
  }

  const delta = Math.abs(first - second) % 360;
  return Math.min(delta, 360 - delta);
}

function smoothHeading(
  previous: ReliableLocationSample,
  incoming: ReliableLocationSample,
): number | null {
  if (incoming.headingDegrees === null) {
    return previous.headingDegrees;
  }

  if (previous.headingDegrees === null) {
    return incoming.headingDegrees;
  }

  if ((incoming.speedMetersPerSecond || 0) < 0.8) {
    return previous.headingDegrees;
  }

  const delta = shortestHeadingDelta(
    previous.headingDegrees,
    incoming.headingDegrees,
  );
  const alpha =
    (incoming.speedMetersPerSecond || 0) >= 8 && Math.abs(delta) > 90
      ? 0.65
      : 0.35;

  return normalizeHeading(previous.headingDegrees + delta * alpha);
}

function shortestHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360;
}

function normalizeOptionalHeading(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? normalizeHeading(numeric)
    : null;
}

function normalizeOptionalNonNegativeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
}

function interpolate(from: number, to: number, alpha: number): number {
  return from + (to - from) * alpha;
}

function interpolateLongitude(from: number, to: number, alpha: number): number {
  const delta = ((to - from + 540) % 360) - 180;
  const interpolated = from + delta * alpha;
  return ((interpolated + 540) % 360) - 180;
}

function copyLocationSample(
  sample: ReliableLocationSample,
): ReliableLocationSample {
  return { ...sample };
}
