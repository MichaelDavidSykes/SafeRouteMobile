import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import {
  LIVE_LOCATION_UNAVAILABLE_MESSAGE,
  LOCATION_PERMISSION_DENIED_MESSAGE,
  permissionStatusFromForegroundPermission,
  resolveLiveLocationTrackingCadence,
  trackingLabelForPermissionStatus,
  type PermissionStatus
} from './liveLocationState';

export type { PermissionStatus } from './liveLocationState';

interface UseLiveLocationOptions {
  navigationActive?: boolean;
}

export function useLiveLocation({
  navigationActive = false
}: UseLiveLocationOptions = {}) {
  const [coordinate, setCoordinate] = useState<Location.LocationObjectCoords | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('checking');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;
    const trackingCadence = resolveLiveLocationTrackingCadence(navigationActive);

    const startTracking = async () => {
      let permission: Location.PermissionResponse;
      try {
        permission = await Location.requestForegroundPermissionsAsync();
      } catch {
        if (mounted) {
          setPermissionStatus('denied');
          setErrorMessage(LIVE_LOCATION_UNAVAILABLE_MESSAGE);
        }
        return;
      }

      if (!mounted) {
        return;
      }

      const nextPermissionStatus = permissionStatusFromForegroundPermission(
        permission.status === Location.PermissionStatus.GRANTED
      );

      if (nextPermissionStatus !== 'granted') {
        setPermissionStatus(nextPermissionStatus);
        setErrorMessage(LOCATION_PERMISSION_DENIED_MESSAGE);
        return;
      }

      setPermissionStatus('granted');
      setErrorMessage('');

      try {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: trackingCadence.lastKnownMaxAgeMs,
          requiredAccuracy: trackingCadence.lastKnownRequiredAccuracyMeters
        });
        if (mounted && lastKnown?.coords) {
          setCoordinate(lastKnown.coords);
        }
      } catch {
        // Keep foreground permission granted; the live watcher below may still return a fresh fix.
      }

      try {
        const nextSubscription = await Location.watchPositionAsync(
          {
            accuracy: navigationActive
              ? Location.Accuracy.BestForNavigation
              : Location.Accuracy.Balanced,
            distanceInterval: trackingCadence.distanceIntervalMeters,
            timeInterval: trackingCadence.timeIntervalMs
          },
          (nextLocation) => {
            if (mounted) {
              setCoordinate(nextLocation.coords);
              setErrorMessage('');
            }
          }
        );
        if (!mounted) {
          nextSubscription.remove();
          return;
        }
        subscription = nextSubscription;
      } catch {
        if (mounted) {
          setErrorMessage(LIVE_LOCATION_UNAVAILABLE_MESSAGE);
        }
      }
    };

    void startTracking().catch(() => {
      if (!mounted) {
        return;
      }

      setErrorMessage(LIVE_LOCATION_UNAVAILABLE_MESSAGE);
    });

    return () => {
      mounted = false;
      subscription?.remove();
    };
  }, [navigationActive]);

  return {
    coordinate,
    errorMessage,
    permissionStatus,
    trackingLabel: trackingLabelForPermissionStatus(permissionStatus)
  };
}
