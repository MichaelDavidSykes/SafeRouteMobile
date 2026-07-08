export type PermissionStatus = 'idle' | 'checking' | 'granted' | 'denied';

export const LOCATION_PERMISSION_DENIED_MESSAGE =
  'Location permission is off. Live route guidance needs foreground location access.';
export const LIVE_LOCATION_UNAVAILABLE_MESSAGE = 'Live location is unavailable right now.';

export interface LiveLocationTrackingCadence {
  distanceIntervalMeters: number;
  lastKnownMaxAgeMs: number;
  lastKnownRequiredAccuracyMeters: number;
  timeIntervalMs: number;
}

export function resolveLiveLocationTrackingCadence(
  navigationActive: boolean
): LiveLocationTrackingCadence {
  if (navigationActive) {
    return {
      distanceIntervalMeters: 3,
      lastKnownMaxAgeMs: 5000,
      lastKnownRequiredAccuracyMeters: 50,
      timeIntervalMs: 1000
    };
  }

  return {
    distanceIntervalMeters: 12,
    lastKnownMaxAgeMs: 60000,
    lastKnownRequiredAccuracyMeters: 250,
    timeIntervalMs: 5000
  };
}

export function permissionStatusFromForegroundPermission(
  granted: boolean,
  requestable = false
): PermissionStatus {
  if (granted) {
    return 'granted';
  }

  return requestable ? 'idle' : 'denied';
}

export function trackingLabelForPermissionStatus(status: PermissionStatus): string {
  if (status === 'granted') {
    return 'Live';
  }

  if (status === 'checking') {
    return 'Checking';
  }

  if (status === 'idle') {
    return 'Ready';
  }

  return 'Location off';
}
