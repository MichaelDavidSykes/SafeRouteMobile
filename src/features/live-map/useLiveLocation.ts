import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import {
  LIVE_LOCATION_UNAVAILABLE_MESSAGE,
  LOCATION_PERMISSION_DENIED_MESSAGE,
  permissionStatusFromForegroundPermission,
  trackingLabelForPermissionStatus,
  type PermissionStatus
} from './liveLocationState';

export type { PermissionStatus } from './liveLocationState';

export function useLiveLocation() {
  const [coordinate, setCoordinate] = useState<Location.LocationObjectCoords | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus>('checking');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    let subscription: Location.LocationSubscription | undefined;

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
        const lastKnown = await Location.getLastKnownPositionAsync();
        if (mounted && lastKnown?.coords) {
          setCoordinate(lastKnown.coords);
        }
      } catch {
        // Keep foreground permission granted; the live watcher below may still return a fresh fix.
      }

      try {
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 12,
            timeInterval: 5000
          },
          (nextLocation) => {
            if (mounted) {
              setCoordinate(nextLocation.coords);
              setErrorMessage('');
            }
          }
        );
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
  }, []);

  return {
    coordinate,
    errorMessage,
    permissionStatus,
    trackingLabel: trackingLabelForPermissionStatus(permissionStatus)
  };
}
