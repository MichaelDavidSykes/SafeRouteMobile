export interface DeviceHeadingSample {
  accuracy: unknown;
  magHeading: unknown;
  trueHeading: unknown;
}

const COMPASS_DIRECTION_LABELS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest'
] as const;

const HEADING_DEADBAND_DEGREES = 1.5;

export function resolveDeviceHeadingDegrees(
  sample: DeviceHeadingSample
): number | null {
  if (!isFiniteNumber(sample.accuracy) || sample.accuracy <= 0) {
    return null;
  }

  const heading = isValidHeading(sample.trueHeading)
    ? sample.trueHeading
    : isValidHeading(sample.magHeading)
      ? sample.magHeading
      : null;

  return heading === null ? null : normalizeHeading(heading);
}

export function smoothDeviceHeadingDegrees(
  previousHeading: number | null,
  nextHeading: number
): number {
  const normalizedNext = normalizeHeading(nextHeading);
  if (previousHeading === null || !Number.isFinite(previousHeading)) {
    return normalizedNext;
  }

  const normalizedPrevious = normalizeHeading(previousHeading);
  const delta = shortestHeadingDelta(normalizedPrevious, normalizedNext);
  if (Math.abs(delta) < HEADING_DEADBAND_DEGREES) {
    return normalizedPrevious;
  }

  const alpha = Math.abs(delta) >= 90
    ? 0.65
    : Math.abs(delta) >= 30
      ? 0.45
      : 0.3;
  return normalizeHeading(normalizedPrevious + delta * alpha);
}

export function resolveDeviceHeadingScreenRotation(
  headingDegrees: number | null,
  mapHeadingDegrees: number
): number | null {
  if (headingDegrees === null || !Number.isFinite(headingDegrees)) {
    return null;
  }

  const normalizedMapHeading = Number.isFinite(mapHeadingDegrees)
    ? normalizeHeading(mapHeadingDegrees)
    : 0;
  return normalizeHeading(headingDegrees - normalizedMapHeading);
}

export function createDeviceHeadingAccessibilityLabel(
  headingDegrees: number | null
): string {
  if (headingDegrees === null || !Number.isFinite(headingDegrees)) {
    return 'Current location';
  }

  const normalizedHeading = normalizeHeading(headingDegrees);
  const directionIndex = Math.round(normalizedHeading / 45) % COMPASS_DIRECTION_LABELS.length;
  return `Current location, facing ${COMPASS_DIRECTION_LABELS[directionIndex]}`;
}

function isValidHeading(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function shortestHeadingDelta(from: number, to: number): number {
  return ((to - from + 540) % 360) - 180;
}

function normalizeHeading(value: number): number {
  return ((value % 360) + 360) % 360;
}
