export type PermissionStatus = 'checking' | 'granted' | 'denied';

export const LOCATION_PERMISSION_DENIED_MESSAGE =
  'Location permission is off. Live route guidance needs foreground location access.';
export const LIVE_LOCATION_UNAVAILABLE_MESSAGE = 'Live location is unavailable right now.';

export function permissionStatusFromForegroundPermission(granted: boolean): PermissionStatus {
  return granted ? 'granted' : 'denied';
}

export function trackingLabelForPermissionStatus(status: PermissionStatus): string {
  if (status === 'granted') {
    return 'Live';
  }

  if (status === 'checking') {
    return 'Checking';
  }

  return 'Location off';
}
